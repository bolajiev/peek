import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { IconDeep, IconBack } from '../components/Icons';
import { getDeepHistory, DeepSessionRecord } from '../utils/storage';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DeepHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const modelId: string | undefined = route.params?.modelId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [history, setHistory] = useState<DeepSessionRecord[]>([]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  useFocusEffect(useCallback(() => {
    getDeepHistory().then(h => setHistory(h.slice(0, 10))).catch(() => setHistory([]));
  }, []));

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
            <IconDeep size={26} color={theme.text} strokeWidth={1.6} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Peek Deep</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Research your files privately — nothing leaves your phone.</Text>
        </View>

        {/* Primary action */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          onPress={() => navigation.navigate('DeepResearch', { modelId })}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryBtnText, { color: theme.accentFg }]}>New Research</Text>
        </TouchableOpacity>

        {/* Recent sessions */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Recent Sessions</Text>

        {history.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Your recent research sessions will appear here</Text>
          </View>
        ) : (
          history.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.sessionItem, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigation.navigate('DeepResearch', { modelId, resumeConvId: item.id })}
              activeOpacity={0.72}
            >
              <View style={[styles.sessionIcon, { backgroundColor: theme.cardAlt }]}>
                <IconDeep size={16} color={theme.textSecondary} />
              </View>
              <View style={styles.sessionBody}>
                <Text style={[styles.sessionDoc, { color: theme.text }]} numberOfLines={1}>{item.docName || 'Document'}</Text>
                <Text style={[styles.sessionQ, { color: theme.textSecondary }]} numberOfLines={1}>{item.firstQuestion}</Text>
                <Text style={[styles.sessionMeta, { color: theme.textSecondary }]}>{timeAgo(item.createdAt)}</Text>
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
  subtitle: { fontSize: 14, lineHeight: 20 },
  primaryBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 28 },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.1,
    textTransform: 'uppercase', marginBottom: 12,
  },
  emptyBox: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 13 },
  sessionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  sessionIcon: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  sessionBody: { flex: 1, gap: 3 },
  sessionDoc: { fontSize: 14, fontWeight: '700' },
  sessionQ: { fontSize: 12 },
  sessionMeta: { fontSize: 11 },
});
