import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Animated, Image, PanResponder, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Paths, File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { loadModel, unloadModel, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, getDownloadedModels, getDefaultModelId, addHistoryItem, updateScanStreak, toPath } from '../utils/storage';
import { isVisionModel } from '../utils/models';
import { logInference } from '../utils/auditLogger';
import { ModelInfo } from '../types';

const SYSTEM_PROMPT = `You are Peek, a personal AI assistant with vision. Answer the user's question about the image accurately and concisely. Focus only on what they asked. Do not add disclaimers unless medically necessary.`;

function pinchDist(touches: { pageX: number; pageY: number }[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const launchMode: 'camera' | 'gallery' = route.params?.mode ?? 'camera';
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [question, setQuestion] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [showZoom, setShowZoom] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const captureScale = useRef(new Animated.Value(1)).current;
  const analyzeAnim = useRef(new Animated.Value(0)).current;
  const runRef = useRef<any>(null);
  const zoomRef = useRef(0);
  const lastPinchDist = useRef<number | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const didAutoLaunch = useRef(false);
  useFocusEffect(React.useCallback(() => {
    // Gallery picker doesn't need camera permission — skip the gate
    if (launchMode === 'gallery') {
      if (!didAutoLaunch.current) {
        didAutoLaunch.current = true;
        handleGallery();
      }
      return;
    }
    if (!permission?.granted) requestPermission();
  }, [permission, launchMode]));

  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, []);

  const pinchResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onPanResponderGrant: (e) => {
      if (e.nativeEvent.touches.length === 2) lastPinchDist.current = pinchDist(e.nativeEvent.touches as any);
    },
    onPanResponderMove: (e) => {
      if (e.nativeEvent.touches.length === 2) {
        const dist = pinchDist(e.nativeEvent.touches as any);
        if (lastPinchDist.current !== null) {
          const next = Math.min(1, Math.max(0, zoomRef.current + (dist - lastPinchDist.current) / 350));
          zoomRef.current = next;
          setZoom(next);
          setShowZoom(true);
          if (zoomTimer.current) clearTimeout(zoomTimer.current);
          zoomTimer.current = setTimeout(() => setShowZoom(false), 1400);
        }
        lastPinchDist.current = dist;
      }
    },
    onPanResponderRelease: () => { lastPinchDist.current = null; },
    onPanResponderTerminate: () => { lastPinchDist.current = null; },
  })).current;

  const runInference = async (imageUri: string) => {
    setIsAnalyzing(true);
    setPreviewUri(imageUri);
    setAnalysisText('Saving image...');

    Animated.timing(analyzeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    let loadedId: string | null = null;
    try {
      const savedFile = new File(Paths.document, `peek_${Date.now()}.jpg`);
      new File(imageUri).copy(savedFile);

      setAnalysisText('Loading model...');
      const modelInfo = await findModel(preselectedModelId);
      if (!modelInfo) {
        setIsAnalyzing(false);
        setPreviewUri(null);
        navigation.navigate('Models', { autoLaunch: { screen: 'Lens', label: 'Peek Lens' } });
        return;
      }

      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 2048, device };
      if (modelInfo.projectionModelSrc) modelConfig.projectionModelSrc = toPath(modelInfo.projectionModelSrc);

      loadedId = await loadModel({
        modelSrc: toPath(modelInfo.modelSrc),
        modelType: 'llm',
        modelConfig,
        onProgress: (p) => setAnalysisText(`Loading ${p.percentage.toFixed(0)}%`),
      });

      const q = question.trim() || 'What is this? Describe what you see.';
      setAnalysisText('Analyzing...');
      const t0 = Date.now();

      const run = completion({
        modelId: loadedId,
        history: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: q, attachments: [{ path: savedFile.uri }] },
        ],
        stream: true,
      });
      runRef.current = run;

      let fullText = '';
      let wordCount = 0;
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          fullText += event.text;
          wordCount = fullText.split(' ').length;
          setAnalysisText(`Analyzing... ${wordCount} words`);
        }
      }
      const final = await run.final;
      runRef.current = null;

      const totalMs = Date.now() - t0;
      const stats = (final as any).stats;
      const tokensPerSec = stats?.tokensPerSecond;
      const ttftMs = stats?.timeToFirstToken || totalMs;
      const tokensPredicted = stats?.generatedTokens || 0;

      await logInference('scan', modelInfo.name, ttftMs, totalMs, tokensPredicted);
      await updateScanStreak();

      const scanResult = { type: 'scan', text: fullText || 'No response.', query: q };
      await addHistoryItem({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        query: q,
        result: scanResult,
        imagePath: savedFile.uri,
        modelName: modelInfo.name,
      });

      await unloadModel({ modelId: loadedId! });
      setIsAnalyzing(false);
      setPreviewUri(null);
      Animated.timing(analyzeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();

      navigation.navigate('Result', {
        text: fullText,
        query: q,
        imagePath: savedFile.uri,
        inferenceMs: totalMs,
        tokensPerSec,
        modelName: modelInfo.name,
      });
    } catch (err: any) {
      runRef.current = null;
      if (typeof loadedId === 'string') await unloadModel({ modelId: loadedId }).catch(() => {});
      setIsAnalyzing(false);
      setPreviewUri(null);
      Animated.timing(analyzeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      if (err instanceof InferenceCancelledError) return;
      const msg = err?.message?.replace(/file:\/\/[^\s]*/g, '[model file]') ?? 'Analysis failed';
      navigation.navigate('Result', {
        text: '',
        query: question || '',
        error: msg,
        modelName: '',
      });
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;
    Animated.sequence([
      Animated.timing(captureScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(captureScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (photo?.uri) await runInference(photo.uri);
  };

  const handleGallery = async () => {
    if (isAnalyzing) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await runInference(result.assets[0].uri);
    } else if (result.canceled && launchMode === 'gallery') {
      // Came here specifically for gallery — go back to hub on cancel
      navigation.goBack();
    }
  };

  const handleBack = () => {
    if (runRef.current) void cancel({ requestId: runRef.current.requestId }).catch(() => {});
    navigation.goBack();
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 40 }]}>
        <Text style={[styles.permText, { color: theme.text }]}>Camera access is needed to scan.</Text>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: theme.accent }]} onPress={requestPermission}>
          <Text style={[styles.permBtnText, { color: theme.accentFg }]}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="picture" zoom={zoom} mute>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={[styles.accentPill, { backgroundColor: theme.accent }]}>
            <Text style={styles.accentPillText}>Scan</Text>
          </View>
          {showZoom && (
            <View style={styles.zoomBadge}>
              <Text style={styles.zoomText}>{(1 + zoom * 9).toFixed(1)}×</Text>
            </View>
          )}
        </View>

        {/* Scan frame */}
        {!isAnalyzing && (
          <View style={styles.frameContainer} {...pinchResponder.panHandlers}>
            <Animated.View style={[styles.frame, { transform: [{ scale: pulseAnim }] }]}>
              {(['TL', 'TR', 'BL', 'BR'] as const).map((pos) => (
                <View key={pos} style={[styles.corner, styles[`corner${pos}`], { borderColor: theme.accent }]} />
              ))}
            </Animated.View>
            <Text style={styles.frameHint}>Pinch to zoom</Text>
          </View>
        )}

        {/* Analyzing overlay */}
        {isAnalyzing && (
          <View style={styles.analyzeOverlay}>
            {previewUri && <Image source={{ uri: previewUri }} style={styles.previewThumb} />}
            <View style={[styles.analyzeCard, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
              <ActivityDots color={theme.accent} />
              <Text style={[styles.analyzeText, { color: '#fff' }]}>{analysisText}</Text>
            </View>
          </View>
        )}

        {/* Bottom input + controls */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bottomSection}>
            <View style={[styles.questionBar, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
              <TextInput
                style={styles.questionInput}
                placeholder="Ask anything about this..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={question}
                onChangeText={setQuestion}
                returnKeyType="done"
                blurOnSubmit
              />
            </View>
            <View style={styles.captureRow}>
              <TouchableOpacity style={[styles.sideBtn, { opacity: isAnalyzing ? 0.4 : 1 }]} onPress={handleGallery} disabled={isAnalyzing}>
                <View style={[styles.galleryIcon, { borderColor: 'rgba(255,255,255,0.6)' }]}>
                  <View style={[styles.galleryInner, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
                </View>
                <Text style={styles.sideBtnLabel}>Gallery</Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: captureScale }] }}>
                <TouchableOpacity
                  style={[styles.captureBtn, { borderColor: theme.accent, opacity: isAnalyzing ? 0.4 : 1 }]}
                  onPress={handleCapture}
                  disabled={isAnalyzing}
                  activeOpacity={0.85}
                >
                  <View style={[styles.captureInner, { backgroundColor: theme.accent }]} />
                </TouchableOpacity>
              </Animated.View>

              <View style={styles.sideBtn} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </CameraView>
    </View>
  );
}

function ActivityDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    dots.forEach((d, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 130),
        Animated.timing(d, { toValue: -6, duration: 260, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.delay(480),
      ])).start();
    });
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
      {dots.map((d, i) => <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, transform: [{ translateY: d }] }} />)}
    </View>
  );
}

async function findModel(preselectedId?: string): Promise<ModelInfo | null> {
  const downloaded = await getDownloadedModels();
  // Lens requires a vision model (needs projection/mmproj file)
  const visionModels = downloaded.filter(isVisionModel);
  const pool = visionModels.length > 0 ? visionModels : downloaded;
  if (pool.length === 0) return null;
  if (preselectedId) return pool.find(m => m.id === preselectedId) ?? pool[0];
  const defaultId = await getDefaultModelId();
  return (defaultId ? pool.find(m => m.id === defaultId) : null) ?? pool[0];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.45)', gap: 12 },
  backBtn: { paddingRight: 4 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  accentPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  accentPillText: { fontSize: 13, fontWeight: '800', color: '#000' },
  zoomBadge: { marginLeft: 'auto', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  zoomText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  frameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  frame: { width: 260, height: 260, position: 'relative' },
  corner: { position: 'absolute', width: 32, height: 32 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  frameHint: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  analyzeOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  previewThumb: { width: 120, height: 120, borderRadius: 14 },
  analyzeCard: { alignItems: 'center', padding: 20, borderRadius: 16, gap: 4 },
  analyzeText: { fontSize: 14, fontWeight: '600' },
  bottomSection: { paddingBottom: 48 },
  questionBar: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  questionInput: { color: '#fff', fontSize: 15 },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40 },
  sideBtn: { width: 56, alignItems: 'center', gap: 5 },
  galleryIcon: { width: 38, height: 32, borderRadius: 6, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'flex-end' },
  galleryInner: { height: 10 },
  sideBtnLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 64, height: 64, borderRadius: 32 },
  permText: { fontSize: 17, textAlign: 'center', lineHeight: 24 },
  permBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { fontSize: 16, fontWeight: '800' },
});
