import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Paths, File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { loadModel, unloadModel, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, syncModelsFromDisk, getDefaultModelId, addHistoryItem, updateScanStreak, toPath } from '../utils/storage';
import { isVisionModel } from '../utils/models';
import { logInference } from '../utils/auditLogger';
import { ModelInfo } from '../types';

// Short, directive prompt — fewer prompt tokens = faster TTFT
const SYSTEM_PROMPT = `You are Peek, a private on-device AI with vision. Answer in 2-4 sentences. Be direct and specific about what you see.`;

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
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [modelReady, setModelReady] = useState(false);

  // Cached model — loaded on focus, released on blur
  const modelIdRef = useRef<string | null>(null);
  const modelInfoRef = useRef<ModelInfo | null>(null);
  const isLoadingModelRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const captureScale = useRef(new Animated.Value(1)).current;
  const analyzeAnim = useRef(new Animated.Value(0)).current;
  const runRef = useRef<any>(null);

  // Preload model silently so capture is instant
  const preloadModel = async () => {
    if (modelIdRef.current || isLoadingModelRef.current) return;
    isLoadingModelRef.current = true;
    try {
      const modelInfo = await findModel(preselectedModelId);
      if (!modelInfo) return;
      modelInfoRef.current = modelInfo;
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 1024, device };
      if (modelInfo.projectionModelSrc) modelConfig.projectionModelSrc = toPath(modelInfo.projectionModelSrc);
      const mid = await loadModel({
        modelSrc: toPath(modelInfo.modelSrc),
        modelType: 'llm',
        modelConfig,
      });
      modelIdRef.current = mid;
      setModelReady(true);
    } catch {
      // silent — will fall back to loading on capture
    } finally {
      isLoadingModelRef.current = false;
    }
  };

  // Model lifecycle: load on focus, release on blur
  useFocusEffect(React.useCallback(() => {
    preloadModel();
    return () => {
      if (modelIdRef.current) {
        unloadModel({ modelId: modelIdRef.current }).catch(() => {});
        modelIdRef.current = null;
        modelInfoRef.current = null;
      }
      setModelReady(false);
      isLoadingModelRef.current = false;
    };
  }, []));

  // Gallery auto-launch and camera permission
  const didAutoLaunch = useRef(false);
  useFocusEffect(React.useCallback(() => {
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

  const ZOOM_STEP = 0.1;
  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.min(1, Math.max(0, parseFloat((prev + delta).toFixed(2)))));
  };

  const zoomLabel = `${(1 + zoom * 9).toFixed(zoom === 0 ? 0 : 1)}×`;

  const runInference = async (imageUri: string) => {
    setIsAnalyzing(true);
    setPreviewUri(imageUri);
    setAnalysisText('Saving...');

    Animated.timing(analyzeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    try {
      const savedFile = new File(Paths.document, `peek_${Date.now()}.jpg`);
      new File(imageUri).copy(savedFile);

      // Use cached model if ready; otherwise load now (first-time fallback)
      let mid = modelIdRef.current;
      let modelInfo = modelInfoRef.current;

      if (!mid) {
        setAnalysisText('Loading model...');
        modelInfo = await findModel(preselectedModelId);
        if (!modelInfo) {
          setIsAnalyzing(false);
          setPreviewUri(null);
          navigation.navigate('Download', { modelId: 'vision', returnTo: 'LensScan', returnParams: { mode: launchMode } });
          return;
        }
        modelInfoRef.current = modelInfo;
        const settings = await getSettings();
        const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
        const modelConfig: any = { ctx_size: 1024, device };
        if (modelInfo.projectionModelSrc) modelConfig.projectionModelSrc = toPath(modelInfo.projectionModelSrc);
        mid = await loadModel({
          modelSrc: toPath(modelInfo.modelSrc),
          modelType: 'llm',
          modelConfig,
          onProgress: (p) => setAnalysisText(`Loading ${p.percentage.toFixed(0)}%`),
        });
        modelIdRef.current = mid;
        setModelReady(true);
      }

      const q = 'What is this? Describe what you see.';
      setAnalysisText('Analyzing...');
      const t0 = Date.now();

      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: q, attachments: [{ path: toPath(savedFile.uri) }] },
        ],
        stream: true,
        // Cap tokens and tune sampling for speed
        generationParams: { predict: 220, temp: 0.3, top_k: 20 },
      });
      runRef.current = run;

      let fullText = '';
      let wordCount = 0;
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          fullText += event.text;
          wordCount = fullText.split(' ').length;
          if (wordCount % 4 === 0) setAnalysisText(`Analyzing... ${wordCount} words`);
        }
      }
      const final = await run.final;
      runRef.current = null;

      const totalMs = Date.now() - t0;
      const stats = (final as any).stats;
      const tokensPerSec = stats?.tokensPerSecond;
      const ttftMs = stats?.timeToFirstToken || totalMs;
      const tokensPredicted = stats?.generatedTokens || 0;

      await logInference('scan', modelInfo!.name, ttftMs, totalMs, tokensPredicted);
      await updateScanStreak();

      await addHistoryItem({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        query: q,
        result: { type: 'scan', text: fullText || 'No response.', query: q },
        imagePath: savedFile.uri,
        modelName: modelInfo!.name,
      });

      // Keep model loaded — don't unload here
      setIsAnalyzing(false);
      setPreviewUri(null);
      Animated.timing(analyzeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();

      navigation.navigate('Result', {
        text: fullText,
        query: q,
        imagePath: savedFile.uri,
        inferenceMs: totalMs,
        tokensPerSec,
        modelName: modelInfo!.name,
      });
    } catch (err: any) {
      runRef.current = null;
      setIsAnalyzing(false);
      setPreviewUri(null);
      Animated.timing(analyzeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      if (err instanceof InferenceCancelledError) return;
      const msg = err?.message?.replace(/file:\/\/[^\s]*/g, '[model file]') ?? 'Analysis failed';
      navigation.navigate('Result', {
        text: '',
        query: 'What is this? Describe what you see.',
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
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.72, shutterSound: false });
    if (photo?.uri) await runInference(photo.uri);
  };

  const handleGallery = async () => {
    if (isAnalyzing) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await runInference(result.assets[0].uri);
    } else if (result.canceled && launchMode === 'gallery') {
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
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="picture"
        zoom={zoom}
        mute
        ratio="16:9"
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {!modelReady && (
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>Loading model…</Text>
            </View>
          )}
        </View>

        <View style={styles.viewfinderFlex} />

        {/* Zoom controls */}
        <View style={styles.zoomRow}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(-ZOOM_STEP)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.zoomBtnText}>−</Text>
          </TouchableOpacity>
          <View style={styles.zoomPill}>
            <Text style={styles.zoomPillText}>{zoomLabel}</Text>
          </View>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(ZOOM_STEP)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.zoomBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Analyzing overlay */}
        {isAnalyzing && (
          <View style={styles.analyzeOverlay}>
            {previewUri && <Image source={{ uri: previewUri }} style={styles.previewThumb} />}
            <ActivityDots color={theme.accent} />
            <Text style={[styles.analyzeText, { color: '#fff' }]}>{analysisText}</Text>
          </View>
        )}
      </CameraView>

      {/* Bottom bar — no text input */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={[styles.sideBtn, { opacity: isAnalyzing ? 0.4 : 1 }]}
            onPress={handleGallery}
            disabled={isAnalyzing}
          >
            <View style={[styles.galleryIcon, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={[styles.galleryInner, { backgroundColor: theme.textSecondary }]} />
            </View>
            <Text style={[styles.sideBtnLabel, { color: theme.textSecondary }]}>Gallery</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: captureScale }] }}>
            <TouchableOpacity
              style={[styles.captureBtn, { borderColor: modelReady ? theme.accent : theme.border, opacity: isAnalyzing ? 0.4 : 1 }]}
              onPress={handleCapture}
              disabled={isAnalyzing}
              activeOpacity={0.85}
            >
              <View style={[styles.captureInner, { backgroundColor: modelReady ? theme.accent : theme.textSecondary }]} />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.sideBtn} />
        </View>
      </View>
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
  const downloaded = await syncModelsFromDisk();
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
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backBtn: { paddingRight: 4 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modelBadge: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modelBadgeText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  viewfinderFlex: { flex: 1 },
  zoomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingVertical: 14, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  zoomBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomBtnText: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  zoomPill: {
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, minWidth: 54, alignItems: 'center',
  },
  zoomPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  analyzeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  previewThumb: { width: 110, height: 110, borderRadius: 14 },
  analyzeText: { fontSize: 14, fontWeight: '600' },
  bottomBar: { borderTopWidth: 1, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 32 },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  sideBtn: { width: 56, alignItems: 'center', gap: 5 },
  galleryIcon: { width: 38, height: 32, borderRadius: 6, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'flex-end' },
  galleryInner: { height: 10 },
  sideBtnLabel: { fontSize: 11, fontWeight: '600' },
  captureBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30 },
  permText: { fontSize: 17, textAlign: 'center', lineHeight: 24 },
  permBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { fontSize: 16, fontWeight: '800' },
});
