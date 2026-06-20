import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert,
  Image, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Paths, File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, syncModelsFromDisk, getDefaultModelId, toPath } from '../utils/storage';
import { isVisionModel } from '../utils/models';
import { llmManager } from '../utils/modelManager';
import { DownloadedModel } from '../types';

const SYSTEM_PROMPT = `You are Peek Lens, a private on-device vision assistant. Analyze the image the user provides and answer their questions about it clearly and accurately. Describe what you see, identify objects, read text, or answer specific questions about the visual content. Be direct and specific.`;

export { SYSTEM_PROMPT as LENS_SYSTEM_PROMPT };

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const launchMode: 'camera' | 'gallery' = route.params?.mode ?? 'camera';
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [zoom, setZoom] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const captureScale = useRef(new Animated.Value(1)).current;
  const isLoadingModelRef = useRef(false);

  // Preload model silently via llmManager (handles already-loaded without error)
  const preloadModel = async () => {
    if (modelReady || isLoadingModelRef.current) return;
    isLoadingModelRef.current = true;
    try {
      const modelInfo = await findModel(preselectedModelId);
      if (!modelInfo) return;
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const cfg: any = { ctx_size: 1024, device };
      if (modelInfo.projectionModelSrc) cfg.projectionModelSrc = toPath(modelInfo.projectionModelSrc);
      await llmManager.ensure(modelInfo, cfg);
      setModelReady(true);
    } catch {
      // silent — LensResultScreen will load on demand
    } finally {
      isLoadingModelRef.current = false;
    }
  };

  useFocusEffect(React.useCallback(() => {
    preloadModel();
    return () => { isLoadingModelRef.current = false; };
  }, []));

  // Gallery auto-launch
  const didAutoLaunch = useRef(false);
  useFocusEffect(React.useCallback(() => {
    if (launchMode === 'gallery') {
      if (!didAutoLaunch.current) {
        didAutoLaunch.current = true;
        handleGallery();
      }
      return;
    }
    // Fix 1: await requestPermission to avoid race with camera render
    if (!permission?.granted) {
      (async () => { await requestPermission(); })();
    }
  }, [permission]));

  const ZOOM_STEP = 0.1;
  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.min(1, Math.max(0, parseFloat((prev + delta).toFixed(2)))));
  };
  const zoomLabel = `${(1 + zoom * 9).toFixed(zoom === 0 ? 0 : 1)}×`;

  const navigateToResult = (photoUri: string) => {
    setPendingUri(photoUri);
    setUserQuery('');
  };

  const analyzeNow = () => {
    if (!pendingUri) return;
    navigation.navigate('LensResult', { photoUri: pendingUri, preselectedModelId, userQuery: userQuery.trim() });
    setPendingUri(null);
    setUserQuery('');
  };

  // Fix 3: wrap entire capture body in try-catch
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.sequence([
        Animated.timing(captureScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
        Animated.spring(captureScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      ]).start();
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.72, shutterSound: false });
      if (!photo?.uri) return;
      // Fix 5: Save immediately then navigate — fall back to photo.uri on copy failure
      try {
        const savedFile = new File(Paths.document, `peek_${Date.now()}.jpg`);
        new File(photo.uri).copy(savedFile);
        navigateToResult(savedFile.uri);
      } catch {
        navigateToResult(photo.uri);
      }
    } catch (err) {
      Alert.alert('Capture failed', 'Could not take a photo. Please try again.');
    }
  };

  // Fix 4: wrap gallery picker in try-catch
  const handleGallery = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]?.uri) {
        navigateToResult(result.assets[0].uri);
      } else if (result.canceled && launchMode === 'gallery') {
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Gallery error', 'Could not open the photo library. Please try again.');
      if (launchMode === 'gallery') navigation.goBack();
    }
  };

  // Photo preview + query input before analysis
  if (pendingUri) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.previewHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => { setPendingUri(null); setUserQuery(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.previewBack, { color: theme.accent }]}>Retake</Text>
          </TouchableOpacity>
          <Text style={[styles.previewTitle, { color: theme.text }]}>Analyze</Text>
          <View style={{ width: 52 }} />
        </View>
        <Image source={{ uri: pendingUri }} style={styles.previewImage} resizeMode="cover" />
        <View style={[styles.previewInputWrap, { borderTopColor: theme.border }]}>
          <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>What would you like to know?</Text>
          <TextInput
            style={[styles.previewInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            placeholder="Leave blank for a general description..."
            placeholderTextColor={theme.textSecondary}
            value={userQuery}
            onChangeText={setUserQuery}
            multiline
            maxLength={400}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.analyzeBtn, { backgroundColor: theme.accent }]}
            onPress={analyzeNow}
            activeOpacity={0.85}
          >
            <Text style={[styles.analyzeBtnText, { color: theme.accentFg }]}>Analyze</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Gallery mode: never render the camera view — DocumentPicker handles everything
  if (launchMode === 'gallery') {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

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
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="picture" zoom={zoom} mute ratio="16:9">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {!modelReady && (
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>Loading model…</Text>
            </View>
          )}
        </View>
        <View style={styles.viewfinderFlex} />
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
      </CameraView>

      <View style={[styles.bottomBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <View style={styles.captureRow}>
          <TouchableOpacity style={styles.sideBtn} onPress={handleGallery}>
            <View style={[styles.galleryIcon, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={[styles.galleryInner, { backgroundColor: theme.textSecondary }]} />
            </View>
            <Text style={[styles.sideBtnLabel, { color: theme.textSecondary }]}>Gallery</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: captureScale }] }}>
            <TouchableOpacity
              style={[styles.captureBtn, { borderColor: modelReady ? theme.accent : theme.border }]}
              onPress={handleCapture}
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

export async function findModel(preselectedId?: string): Promise<DownloadedModel | null> {
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
  zoomBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  zoomBtnText: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  zoomPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, minWidth: 54, alignItems: 'center' },
  zoomPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  previewBack: { fontSize: 15, fontWeight: '600', width: 52 },
  previewTitle: { fontSize: 16, fontWeight: '700' },
  previewImage: { flex: 1 },
  previewInputWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, borderTopWidth: 1, gap: 10 },
  previewLabel: { fontSize: 13, fontWeight: '600' },
  previewInput: {
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, minHeight: 60, maxHeight: 120, textAlignVertical: 'top',
  },
  analyzeBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  analyzeBtnText: { fontSize: 16, fontWeight: '800' },
});
