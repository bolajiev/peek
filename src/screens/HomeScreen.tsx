import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
  Dimensions, PanResponder,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useSidebar } from '../navigation/AppNavigator';
import {
  IconLens, IconVoice, IconScribe, IconDeep, IconRelay, IconMenu,
} from '../components/Icons';
import ModelPickerSheet from '../components/ModelPickerSheet';
import { getDownloadedModels, getQuickChatDefaultId, setQuickChatDefaultId } from '../utils/storage';
import { isVisionModel, isTextModel } from '../utils/models';
import { DownloadedModel } from '../types';

const { width: SW, height: SH } = Dimensions.get('window');
const H_PAD = 12;
const CARD_GAP = 10;
const CARD_W = (SW - H_PAD * 2 - CARD_GAP) / 2;

interface Module {
  id: string;
  screen: string;
  label: string;
  title: string;
  desc: string;
  icon: (color: string) => React.ReactNode;
  fullWidth?: boolean;
  skipPicker?: boolean;
  filterFn?: (m: DownloadedModel) => boolean;
}

const MODULES: Module[] = [
  {
    id: 'Lens', screen: 'Lens', label: 'Vision Models', title: 'Peek Lens',
    desc: 'Analyze images with your camera',
    icon: (c) => <IconLens size={20} color={c} />,
    filterFn: isVisionModel,
  },
  {
    id: 'Voice', screen: 'Voice', label: 'Whisper · Built-in', title: 'Peek Voice',
    desc: 'Transcribe and summarize audio',
    icon: (c) => <IconVoice size={20} color={c} />,
    skipPicker: true,
  },
  {
    id: 'Scribe', screen: 'Scribe', label: 'Text Models', title: 'Peek Scribe',
    desc: 'Write and edit with on-device AI',
    icon: (c) => <IconScribe size={20} color={c} />,
    filterFn: isTextModel,
  },
  {
    id: 'Deep', screen: 'Deep', label: 'Text Models', title: 'Peek Deep',
    desc: 'Research your files privately',
    icon: (c) => <IconDeep size={20} color={c} />,
    filterFn: isTextModel,
  },
  {
    id: 'Relay', screen: 'Relay', label: 'P2P · Beta', title: 'Peek Relay',
    desc: 'Offload heavy tasks to a nearby device',
    icon: (c) => <IconRelay size={20} color={c} />,
    fullWidth: true, skipPicker: true,
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const { open: openSidebar } = useSidebar();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Model picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerModule, setPickerModule] = useState<Module | null>(null);
  const [pickerModels, setPickerModels] = useState<DownloadedModel[]>([]);
  const [pickerIsQuickChat, setPickerIsQuickChat] = useState(false);
  const [pickerDefaultId, setPickerDefaultId] = useState<string | null>(null);

  // FAB drag state
  const [fabPos, setFabPos] = useState({ x: 20, y: SH - 120 });
  const fabPosRef = useRef({ x: 20, y: SH - 120 });
  const fabTranslate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      isDragging.current = false;
      dragStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      fabTranslate.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.pageX - dragStart.current.x;
      const dy = e.nativeEvent.pageY - dragStart.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) isDragging.current = true;
      fabTranslate.setValue({ x: dx, y: dy });
    },
    onPanResponderRelease: (e, g) => {
      if (!isDragging.current) {
        fabTranslate.setValue({ x: 0, y: 0 });
        handleFabTap();
      } else {
        const newPos = {
          x: Math.max(12, Math.min(fabPosRef.current.x + g.dx, SW - 180)),
          y: Math.max(60, Math.min(fabPosRef.current.y + g.dy, SH - 100)),
        };
        fabPosRef.current = newPos;
        setFabPos(newPos);
        fabTranslate.setValue({ x: 0, y: 0 });
      }
    },
  })).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);

  const handleModuleTap = async (mod: Module) => {
    if (mod.skipPicker) {
      navigation.navigate(mod.screen);
      return;
    }
    const all = await getDownloadedModels();
    const compatible = mod.filterFn ? all.filter(mod.filterFn) : all;
    if (compatible.length === 0) {
      // No compatible model — send to Models with auto-launch context so
      // downloading a model continues directly into the module
      navigation.navigate('Models', {
        autoLaunch: { screen: mod.screen, label: mod.title },
      });
      return;
    }
    setPickerModule(mod);
    setPickerModels(compatible);
    setPickerIsQuickChat(false);
    setPickerDefaultId(null);
    setPickerVisible(true);
  };

  const handleFabTap = async () => {
    const all = await getDownloadedModels();
    if (all.length === 0) {
      navigation.navigate('Models', { autoLaunch: { screen: 'QuickChat', label: 'Quick Chat' } });
      return;
    }
    // Prefer text models; sort by size smallest first
    const textModels = all.filter(isTextModel);
    const pool = textModels.length > 0 ? textModels : all;
    const sorted = [...pool].sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));
    const defaultId = await getQuickChatDefaultId();
    // If default is set and still downloaded, go straight in
    if (defaultId && sorted.find(m => m.id === defaultId)) {
      navigation.navigate('QuickChat', { modelId: defaultId });
      return;
    }
    // Otherwise show picker with smallest pre-selected
    setPickerModule(null);
    setPickerModels(sorted);
    setPickerIsQuickChat(true);
    setPickerDefaultId(sorted[0]?.id ?? null);
    setPickerVisible(true);
  };

  const handlePickerStart = async (model: DownloadedModel, saveDefault: boolean) => {
    setPickerVisible(false);
    if (pickerIsQuickChat) {
      if (saveDefault) await setQuickChatDefaultId(model.id);
      setTimeout(() => navigation.navigate('QuickChat', { modelId: model.id }), 180);
    } else if (pickerModule) {
      setTimeout(() => navigation.navigate(pickerModule.screen, { modelId: model.id }), 180);
    }
  };

  const grid = MODULES.filter(m => !m.fullWidth);
  const full = MODULES.filter(m => m.fullWidth);

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openSidebar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.menuBtn}>
          <IconMenu size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.brand}>
          <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.brandName, { color: theme.text }]}>Peek</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Cards */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>All Modules</Text>

        {/* 2-col grid */}
        <View style={styles.grid}>
          {grid.map((mod) => (
            <TouchableOpacity
              key={mod.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, width: CARD_W }]}
              onPress={() => handleModuleTap(mod)}
              activeOpacity={0.72}
            >
              <View style={[styles.cardIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                {mod.icon(theme.text)}
              </View>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{mod.label}</Text>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{mod.title}</Text>
              <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>{mod.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Full-width relay card */}
        {full.map((mod) => (
          <TouchableOpacity
            key={mod.id}
            style={[styles.cardFull, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleModuleTap(mod)}
            activeOpacity={0.72}
          >
            <View style={[styles.cardIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              {mod.icon(theme.text)}
            </View>
            <View style={styles.cardFullBody}>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{mod.label}</Text>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{mod.title}</Text>
              <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={1}>{mod.desc}</Text>
            </View>
            <View style={[styles.betaBadge, { borderColor: theme.accent + '44', backgroundColor: theme.accent + '18' }]}>
              <Text style={[styles.betaText, { color: theme.accent }]}>Beta</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Draggable FAB */}
      <Animated.View
        style={[
          styles.fab,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            left: fabPos.x,
            top: fabPos.y,
            transform: fabTranslate.getTranslateTransform(),
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.fabPulse, { backgroundColor: theme.accent, shadowColor: theme.accent }]} />
        <View>
          <Text style={[styles.fabLabel, { color: theme.text }]}>Quick Chat</Text>
          <Text style={[styles.fabSub, { color: theme.textSecondary }]}>Smallest model</Text>
        </View>
      </Animated.View>

      {/* Model Picker Sheet */}
      <ModelPickerSheet
        visible={pickerVisible}
        moduleTitle={pickerIsQuickChat ? 'Quick Chat' : (pickerModule?.title ?? '')}
        moduleIcon={pickerIsQuickChat
          ? <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.accent }} />
          : pickerModule?.icon(theme.text)}
        models={pickerModels}
        initialModelId={pickerDefaultId}
        showSetDefault={pickerIsQuickChat}
        startLabel={pickerIsQuickChat ? 'Start Chat' : 'Launch'}
        onStart={handlePickerStart}
        onClose={() => setPickerVisible(false)}
        onGetModels={() => { setPickerVisible(false); setTimeout(() => navigation.navigate('Models'), 200); }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 13, borderBottomWidth: 1,
  },
  menuBtn: { width: 36, height: 36, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 3.5 },
  brandName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 0 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
    paddingVertical: 14, paddingHorizontal: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 14,
    gap: 8, minHeight: 138,
  },
  cardFull: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: CARD_GAP,
  },
  cardFullBody: { flex: 1, gap: 4 },
  cardIcon: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  cardMeta: { fontSize: 10, fontWeight: '500' },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, lineHeight: 18 },
  cardDesc: { fontSize: 12, lineHeight: 16 },
  betaBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  betaText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  fab: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 50,
    paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabPulse: {
    width: 8, height: 8, borderRadius: 4,
    shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  fabLabel: { fontSize: 13, fontWeight: '600' },
  fabSub: { fontSize: 10, marginTop: 1 },
});
