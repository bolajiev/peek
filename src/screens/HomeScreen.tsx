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
import { syncModelsFromDisk } from '../utils/storage';
import { MODEL_KEYS } from '../utils/models';
import { DownloadedModel } from '../types';

const { width: SW, height: SH } = Dimensions.get('window');
const H_PAD = 12;
const CARD_GAP = 10;
const CARD_W = (SW - H_PAD * 2 - CARD_GAP) / 2;

type ModuleKey = 'Lens' | 'Voice' | 'Scribe' | 'Deep' | 'QuickChat' | 'Relay';

interface Module {
  id: ModuleKey;
  screen: string;
  label: string;
  title: string;
  desc: string;
  icon: (color: string) => React.ReactNode;
  fullWidth?: boolean;
  modelKey?: string;      // which model key this module needs
  requiresBoth?: boolean; // vision: requires main + mmproj
}

const MODULES: Module[] = [
  {
    id: 'Lens', screen: 'Lens', label: 'Vision AI', title: 'Peek Lens',
    desc: 'Scan food, labels & images — instant insights',
    icon: (c) => <IconLens size={20} color={c} />,
    modelKey: MODEL_KEYS.VISION,
    requiresBoth: true,
  },
  {
    id: 'Voice', screen: 'Voice', label: 'Whisper · Built-in', title: 'Peek Voice',
    desc: 'Record or upload audio — transcribe & summarize',
    icon: (c) => <IconVoice size={20} color={c} />,
    // Whisper is always available (descriptor model); text summary needs text-fast
    // but Voice handles its own download prompt internally — no lifecycle gate
  },
  {
    id: 'Scribe', screen: 'Scribe', label: 'MedPsy', title: 'Peek Scribe',
    desc: 'Draft documents, meal plans, and notes',
    icon: (c) => <IconScribe size={20} color={c} />,
    modelKey: MODEL_KEYS.TEXT_HEALTH,
  },
  {
    id: 'Deep', screen: 'Deep', label: 'MedPsy', title: 'Peek Deep',
    desc: 'Research documents privately on-device',
    icon: (c) => <IconDeep size={20} color={c} />,
    modelKey: MODEL_KEYS.TEXT_HEALTH,
  },
  {
    id: 'QuickChat', screen: 'QuickChat', label: 'MedPsy', title: 'Quick Chat',
    desc: 'Ask anything — fast, private, on-device',
    icon: (c) => <IconScribe size={20} color={c} />,
    modelKey: MODEL_KEYS.TEXT_HEALTH,
  },
  {
    id: 'Relay', screen: 'Relay', label: 'P2P · Coming Soon', title: 'Peek Relay',
    desc: 'Offload heavy tasks to a nearby device',
    icon: (c) => <IconRelay size={20} color={c} />,
    fullWidth: true,
  },
];

type ModelStatus = 'ready' | 'needs-download' | 'unknown';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const { open: openSidebar } = useSidebar();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);

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

  // Refresh model status every time screen focuses
  useFocusEffect(useCallback(() => {
    syncModelsFromDisk().then(models => {
      setDownloadedModels(models);
      setDownloadedIds(new Set(models.map(m => m.id)));
    }).catch(() => {});
  }, []));

  const getStatus = (mod: Module): ModelStatus => {
    if (!mod.modelKey) return 'ready'; // no model needed (Voice, Relay)
    const dm = downloadedModels.find(m => m.id === mod.modelKey);
    if (!dm) return 'needs-download';
    if (mod.requiresBoth && !dm.projectionModelSrc) return 'needs-download';
    return 'ready';
  };

  const enterModule = async (mod: Module) => {
    if (mod.id === 'Relay') {
      navigation.navigate(mod.screen);
      return;
    }
    const status = getStatus(mod);
    if (status === 'needs-download' && mod.modelKey) {
      navigation.navigate('Download', {
        modelId: mod.modelKey,
        returnTo: mod.screen,
        returnParams: {},
      });
      return;
    }
    navigation.navigate(mod.screen);
  };

  const handleFabTap = () => {
    const status = getStatus(MODULES.find(m => m.id === 'QuickChat')!);
    if (status === 'needs-download') {
      navigation.navigate('Download', {
        modelId: MODEL_KEYS.TEXT_FAST,
        returnTo: 'QuickChat',
        returnParams: {},
      });
    } else {
      navigation.navigate('QuickChat');
    }
  };

  const grid = MODULES.filter(m => !m.fullWidth && m.id !== 'QuickChat');
  const full = MODULES.filter(m => m.fullWidth);

  const statusBadge = (mod: Module) => {
    const s = getStatus(mod);
    if (s === 'needs-download') {
      return (
        <View style={[styles.statusPill, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
          <Text style={[styles.statusPillText, { color: theme.textSecondary }]}>Download</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusPill, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '55' }]}>
        <View style={[styles.statusDot, { backgroundColor: theme.accent }]} />
        <Text style={[styles.statusPillText, { color: theme.accent }]}>Ready</Text>
      </View>
    );
  };

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
              onPress={() => enterModule(mod)}
              activeOpacity={0.72}
            >
              <View style={[styles.cardIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                {mod.icon(theme.text)}
              </View>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{mod.label}</Text>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{mod.title}</Text>
              <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>{mod.desc}</Text>
              {mod.modelKey ? statusBadge(mod) : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* Full-width relay card */}
        {full.map((mod) => (
          <TouchableOpacity
            key={mod.id}
            style={[styles.cardFull, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => enterModule(mod)}
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

      {/* Draggable FAB — Quick Chat */}
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
          <Text style={[styles.fabSub, { color: theme.textSecondary }]}>
            {getStatus(MODULES.find(m => m.id === 'QuickChat')!) === 'ready' ? 'on-device · ready' : 'tap to download'}
          </Text>
        </View>
      </Animated.View>
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
    gap: 6, minHeight: 145,
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
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3, marginTop: 2,
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusPillText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
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
