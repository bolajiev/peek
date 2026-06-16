import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Paths, File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { loadModel, unloadModel, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSystemPrompt, AVAILABLE_MODELS } from '../utils/models';
import { getSettings, getDownloadedModels, getCustomSystemPrompt } from '../utils/storage';
import { logInference } from '../utils/auditLogger';
import { updateScanStreak, addHistoryItem } from '../utils/storage';
import { UseCase, ScanResult, ModelInfo } from '../types';

type CameraParams = {
  Camera: { useCase: UseCase; modelId: string };
};

const CATEGORY_ACCENT: Record<UseCase, string> = {
  food: '#FF6B35',
  plant: '#22C55E',
  text: '#6366F1',
  health: '#3B82F6',
  code: '#A855F7',
  object: '#F59E0B',
};

export default function CameraScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<CameraParams, 'Camera'>>();
  const { useCase, modelId } = route.params;
  const theme = getTheme(useTheme());
  const accent = CATEGORY_ACCENT[useCase] ?? theme.accent;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState('Analyzing...');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const runRef = useRef<any>(null);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleBack = () => {
    if (runRef.current) {
      void cancel({ requestId: runRef.current.requestId }).catch(() => {});
    }
    navigation.goBack();
  };

  const runInference = async (imageUri: string) => {
    setIsAnalyzing(true);
    setPreviewUri(imageUri);
    setAnalyzingText('Saving image…');

    let loadedModelIdStr: string | null = null;
    try {
      const savedFile = new File(Paths.document, `peek_scan_${Date.now()}.jpg`);
      const tempFile = new File(imageUri);
      tempFile.copy(savedFile);

      setAnalyzingText('Loading model…');

      const modelInfo = await findModelById(modelId);
      if (!modelInfo) {
        setIsAnalyzing(false);
        return;
      }

      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      let ctxSize = 2048;
      if (settings.responseLength === 'short') ctxSize = 1024;
      else if (settings.responseLength === 'detailed') ctxSize = 4096;

      const modelConfig: any = { ctx_size: ctxSize, device };
      if (modelInfo.projectionModelSrc) {
        modelConfig.projectionModelSrc = modelInfo.projectionModelSrc;
      }

      loadedModelIdStr = await loadModel({
        modelSrc: modelInfo.modelSrc,
        modelType: 'llm',
        modelConfig,
        onProgress: (p) => {
          setAnalyzingText(`Loading model… ${p.percentage.toFixed(0)}%`);
        },
      });

      const startTime = Date.now();
      setAnalyzingText('Analyzing…');

      const customPrompt = await getCustomSystemPrompt(useCase);
      const systemPrompt = customPrompt || getSystemPrompt(useCase);

      const run = completion({
        modelId: loadedModelIdStr,
        history: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Analyze this image and respond with only valid JSON:',
            attachments: [{ path: savedFile.uri }],
          },
        ],
        stream: true,
      });
      runRef.current = run;

      let fullText = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          fullText += event.text;
          const wordCount = fullText.split(' ').length;
          setAnalyzingText(`Analyzing… ${wordCount} words`);
        }
      }
      const final = await run.final;
      runRef.current = null;

      const endTime = Date.now();
      const totalMs = endTime - startTime;

      const text = fullText || (final as any).contentText || '';

      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      let parsedResult: ScanResult;

      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const jsonStr = text.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonStr);
          parsedResult = { ...parsed, type: useCase } as ScanResult;
        } catch {
          parsedResult = { type: useCase, _rawText: text } as ScanResult;
        }
      } else {
        parsedResult = { type: useCase, _rawText: text || 'No response from model.' } as ScanResult;
      }

      const stats = (final as any).stats;
      const ttftMs = stats?.timeToFirstToken || totalMs;
      const tokensPredicted = stats?.generatedTokens || 0;
      const tokensPerSec = stats?.tokensPerSecond;

      await logInference(useCase, modelInfo.name, ttftMs, totalMs, tokensPredicted);
      await updateScanStreak();
      await addHistoryItem({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        useCase,
        result: parsedResult,
        imagePath: savedFile.uri,
        modelName: modelInfo.name,
      });

      await unloadModel({ modelId: loadedModelIdStr! });
      setIsAnalyzing(false);
      setPreviewUri(null);

      navigation.replace('Result', {
        result: parsedResult,
        useCase,
        modelId,
        imagePath: savedFile.uri,
        inferenceMs: totalMs,
        tokensPerSec,
        modelName: modelInfo.name,
      });
    } catch (err) {
      runRef.current = null;
      if (typeof loadedModelIdStr === 'string') {
        await unloadModel({ modelId: loadedModelIdStr }).catch(() => {});
      }
      setIsAnalyzing(false);
      setPreviewUri(null);
      if (!(err instanceof InferenceCancelledError)) {
        navigation.goBack();
      }
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return;
    await runInference(photo.uri);
  };

  const handleGalleryPick = async () => {
    if (isAnalyzing) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await runInference(result.assets[0].uri);
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.permissionText, { color: theme.text }]}>
          Camera permission required
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: accent }]}
          onPress={requestPermission}
        >
          <Text style={[styles.permissionButtonText, { color: '#fff' }]}>
            Grant Permission
          </Text>
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
        mute
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topBarInfo}>
            <Text style={styles.useCaseLabel}>{getUseCaseLabel(useCase)}</Text>
            <Text style={styles.modelLabel}>{getModelDisplayName(modelId)}</Text>
          </View>
          <View style={[styles.accentDot, { backgroundColor: accent }]} />
        </View>

        {/* Center content */}
        {isAnalyzing ? (
          <View style={styles.analyzingOverlay}>
            {previewUri && (
              <Image source={{ uri: previewUri }} style={styles.previewThumb} />
            )}
            <ActivityIndicator size="large" color={accent} style={{ marginTop: 16 }} />
            <Text style={styles.analyzingText}>{analyzingText}</Text>
          </View>
        ) : (
          <View style={styles.scanFrameContainer}>
            <Animated.View
              style={[styles.scanFrame, { transform: [{ scale: pulseAnim }] }]}
            >
              <View style={[styles.corner, styles.cornerTL, { borderColor: accent }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: accent }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: accent }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: accent }]} />
            </Animated.View>
            <Text style={styles.hintText}>Point at {getUseCaseHint(useCase)}</Text>
          </View>
        )}

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {/* Gallery pick */}
          <TouchableOpacity
            style={[styles.sideButton, { opacity: isAnalyzing ? 0.4 : 1 }]}
            onPress={handleGalleryPick}
            disabled={isAnalyzing}
          >
            <Text style={styles.sideButtonIcon}>🖼</Text>
            <Text style={styles.sideButtonLabel}>Gallery</Text>
          </TouchableOpacity>

          {/* Shutter */}
          <TouchableOpacity
            style={[styles.captureButton, { opacity: isAnalyzing ? 0.4 : 1, borderColor: accent }]}
            onPress={handleCapture}
            disabled={isAnalyzing}
          >
            <View style={[styles.captureInner, { backgroundColor: accent }]} />
          </TouchableOpacity>

          {/* Spacer to balance layout */}
          <View style={styles.sideButton} />
        </View>
      </CameraView>
    </View>
  );
}

function getUseCaseLabel(useCase: UseCase): string {
  const labels: Record<UseCase, string> = {
    food: 'Food & Nutrition',
    plant: 'Plant Identifier',
    text: 'Text & Documents',
    health: 'Health & Medicine',
    code: 'Code Reader',
    object: 'Object Identifier',
  };
  return labels[useCase];
}

function getUseCaseHint(useCase: UseCase): string {
  const hints: Record<UseCase, string> = {
    food: 'food or a meal',
    plant: 'a plant or leaf',
    text: 'text or a document',
    health: 'medical content',
    code: 'code on a screen',
    object: 'any object',
  };
  return hints[useCase];
}

function getModelDisplayName(modelId: string): string {
  const known = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (known) return known.name;
  return 'Custom Model';
}

async function findModelById(modelId: string): Promise<ModelInfo | null> {
  const downloaded = await getDownloadedModels();
  const local = downloaded.find((m) => m.id === modelId);
  if (local) return local;
  return AVAILABLE_MODELS.find((m) => m.id === modelId) || null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backButton: {
    paddingRight: 12,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topBarInfo: {
    flex: 1,
  },
  useCaseLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modelLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scanFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  scanFrame: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  hintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  analyzingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 8,
  },
  previewThumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  analyzingText: {
    color: '#fff',
    fontSize: 15,
    marginTop: 8,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingBottom: 52,
    paddingTop: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sideButton: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  sideButtonIcon: {
    fontSize: 28,
  },
  sideButtonLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  permissionText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 32,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
