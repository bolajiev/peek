import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Image } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { IconLens, IconBack, IconUpload } from '../components/Icons';
import { getLensHistory, LensScanRecord } from '../utils/storage';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LensHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const modelId: string | undefined = route.params?.modelId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [history, setHistory] = useState<LensScanRecord[]>([]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  useFocusEffect(useCallback(() => {
    getLensHistory().then(h => setHistory(h.slice(0, 10))).catch(() => setHistory([]));
  }, []));

  const goScan = (mode: 'camera' | 'gallery') =>
    navigation.navigate('LensScan', { modelId, mode });

  const openResult = (item: LensScanRecord) =>
    navigation.navigate('Result', {
      text: item.text,
      query: item.query,
      imagePath: item.imagePath,
      modelName: item.modelName,
      inferenceMs: item.inferenceMs,
    });

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <IconBack size={18} color={theme.accent} />
        </TouchableOpacity>
        <View style={styles.brand}>
          <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.brandName, { color: theme.text }]}>Peek</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <IconLens size={26} color={theme.text} strokeWidth={1.6} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Peek Lens</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Point. Ask. Understand. All on-device.</Text>
        </View>

        {/* Primary action — Open Camera */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          onPress={() => goScan('camera')}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryBtnText, { color: theme.accentFg }]}>Open Camera</Text>
        </TouchableOpacity>

        {/* Secondary action — Upload Image */}
        <TouchableOpacity
          style={[styles.uploadCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => goScan('gallery')}
          activeOpacity={0.72}
        >
          <View style={[styles.uploadIcon, { backgroundColor: theme.cardAlt }]}>
            <IconUpload size={18} color={theme.text} />
          </View>
          <View style={styles.uploadText}>
            <Text style={[styles.uploadTitle, { color: theme.text }]}>Upload Image</Text>
            <Text style={[styles.uploadSub, { color: theme.textSecondary }]}>Pick from your gallery or files</Text>
          </View>
        </TouchableOpacity>

        {/* Recent scans */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Recent Scans</Text>

        {history.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Your recent scans will appear here</Text>
          </View>
        ) : (
          history.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.historyItem, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => openResult(item)}
              activeOpacity={0.72}
            >
              {item.imagePath ? (
                <Image source={{ uri: item.imagePath }} style={styles.historyThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.historyThumb, styles.historyThumbPlaceholder, { backgroundColor: theme.cardAlt }]}>
                  <IconLens size={18} color={theme.textSecondary} />
                </View>
              )}
              <View style={styles.historyBody}>
                <Text style={[styles.historyQuery, { color: theme.text }]} numberOfLines={1}>{item.query}</Text>
                <Text style={[styles.historyMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {timeAgo(item.createdAt)}{item.modelName ? ` · ${item.modelName}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 13, borderBottomWidth: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 3.5 },
  brandName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  hero: { alignItems: 'flex-start', gap: 6, marginBottom: 24 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 14 },
  primaryBtn: {
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginBottom: 12,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  uploadCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 28,
  },
  uploadIcon: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  uploadText: { flex: 1, gap: 3 },
  uploadTitle: { fontSize: 14, fontWeight: '600' },
  uploadSub: { fontSize: 12 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.1,
    textTransform: 'uppercase', marginBottom: 12,
  },
  emptyBox: {
    borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center',
  },
  emptyText: { fontSize: 13 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10,
  },
  historyThumb: { width: 52, height: 52, borderRadius: 8, flexShrink: 0 },
  historyThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  historyBody: { flex: 1, gap: 4 },
  historyQuery: { fontSize: 14, fontWeight: '600' },
  historyMeta: { fontSize: 12 },
});
