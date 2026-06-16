import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Paths, File } from 'expo-file-system';
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

export default function CameraScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<CameraParams, 'Camera'>>();
  const { useCase, modelId } = route.params;
  const theme = getTheme(useTheme());
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState('Analyzing...');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const runRef = useRef<any>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalyzingText('Capturing...');

    let loadedModelIdStr: string | null = null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (!photo?.uri) {
        setIsAnalyzing(false);
        return;
      }

      const savedFile = new File(Paths.document, `peek_scan_${Date.now()}.jpg`);
      const tempFile = new File(photo.uri);
      tempFile.copy(savedFile);

      setAnalyzingText('Loading model...');

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

      setAnalyzingText('Analyzing image…');

      const customPrompt = await getCustomSystemPrompt(useCase);
      const systemPrompt = customPrompt || getSystemPrompt(useCase);

      const run = completion({
        modelId: loadedModelIdStr,
        history: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Analyze this image:',
            attachments: [{ path: savedFile.uri }],
          },
        ],
        stream: false,
      });
      runRef.current = run;

      const final = await run.final;
      runRef.current = null;
      const endTime = Date.now();
      const totalMs = endTime - startTime;

      const text = final.contentText || final.raw?.fullText || '';

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

      const stats = final.stats;
      const ttftMs = stats?.timeToFirstToken || totalMs;
      const tokensPredicted = stats?.generatedTokens || 0;
      const tokensPerSec = stats?.tokensPerSecond;

      await logInference(useCase, modelInfo.name, ttftMs, totalMs, tokensPredicted);
      await updateScanStreak();

      const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        useCase,
        result: parsedResult,
        imagePath: savedFile.uri,
        modelName: modelInfo.name,
      };
      await addHistoryItem(historyItem);

      await unloadModel({ modelId: loadedModelIdStr! });

      setIsAnalyzing(false);

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
      if (!(err instanceof InferenceCancelledError)) {
        navigation.goBack();
      }
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.permissionText, { color: theme.text }]}>
          Camera permission required
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: theme.accent }]}
          onPress={requestPermission}
        >
          <Text style={[styles.permissionButtonText, { color: theme.background }]}>
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
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (runRef.current) {
                void cancel({ requestId: runRef.current.requestId }).catch(() => {});
              }
              navigation.goBack();
            }}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topBarInfo}>
            <Text style={styles.useCaseLabel}>
              {getUseCaseLabel(useCase)}
            </Text>
            <Text style={styles.modelLabel}>{getModelDisplayName(modelId)}</Text>
          </View>
        </View>

        {isAnalyzing ? (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.analyzingText}>{analyzingText}</Text>
          </View>
        ) : (
          <View style={styles.scanFrameContainer}>
            <Animated.View
              style={[
                styles.scanFrame,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </Animated.View>
          </View>
        )}

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.captureButton, { opacity: isAnalyzing ? 0.5 : 1 }]}
            onPress={handleCapture}
            disabled={isAnalyzing}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>
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

function getModelDisplayName(modelId: string): string {
  const known = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (known) return known.name;
  if (modelId.startsWith('custom-') || modelId.startsWith('loaded-')) return 'Custom Model';
  return modelId;
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  scanFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00FF87',
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
  analyzingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  analyzingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  bottomBar: {
    paddingBottom: 50,
    paddingTop: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  permissionText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
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
