import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Switch, ScrollView } from 'react-native';
import { getTheme } from '../theme';
import { useTheme, useThemeToggle } from '../navigation/AppNavigator';
import { getHistory } from '../utils/storage';
import { HistoryItem } from '../types';

interface Props {
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function moduleLabel(item: HistoryItem): string {
  if (item.result?.type === 'scan') return 'Peek Lens';
  if (item.result?.type === 'chat') return 'Peek Scribe';
  return 'Peek';
}

export default function Sidebar({ onClose, onNavigate }: Props) {
  const themeMode = useTheme();
  const toggle = useThemeToggle();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';
  const [recent, setRecent] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory().then(h => {
      const sorted = [...h].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecent(sorted.slice(0, 4));
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderRightColor: theme.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.logoRow}>
          <Image source={require('../../peeklogo.png')} style={styles.logoImg} />
          <Text style={[styles.logoText, { color: theme.text }]}>Peek</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.closeIcon, { color: theme.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Recent sessions */}
        {recent.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Recent</Text>
              <TouchableOpacity onPress={() => onNavigate('History')}>
                <Text style={[styles.viewAll, { color: theme.accent }]}>View all →</Text>
              </TouchableOpacity>
            </View>
            {recent.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.chatItem}
                onPress={() => onNavigate('History')}
                activeOpacity={0.7}
              >
                <Text style={[styles.chatTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.query || 'Untitled'}
                </Text>
                <Text style={[styles.chatPreview, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.result?.text?.slice(0, 60) || ''}
                </Text>
                <Text style={[styles.chatTime, { color: theme.textSecondary }]}>
                  {relativeTime(item.timestamp)} · {moduleLabel(item)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Nav */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Settings</Text>
          {[
            { label: 'Model Manager', screen: 'Models' },
            { label: 'History', screen: 'History' },
            { label: 'Preferences', screen: 'Settings' },
          ].map(item => (
            <TouchableOpacity
              key={item.screen}
              style={[styles.navItem, { borderRadius: 10 }]}
              onPress={() => onNavigate(item.screen)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: theme.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dark mode */}
        <View style={[styles.toggleRow, { borderColor: theme.border }]}>
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Dark mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggle}
            trackColor={{ false: theme.border, true: theme.accent + '80' }}
            thumbColor={isDark ? theme.accent : theme.textSecondary}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>Powered by QVAC SDK · v1.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRightWidth: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImg: { width: 30, height: 30, borderRadius: 15 },
  logoText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  closeIcon: { fontSize: 18, fontWeight: '600', padding: 4 },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 10, paddingTop: 14, paddingBottom: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 6 },
  sectionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  viewAll: { fontSize: 11, fontWeight: '500' },
  chatItem: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, gap: 2 },
  chatTitle: { fontSize: 13, fontWeight: '500' },
  chatPreview: { fontSize: 11 },
  chatTime: { fontSize: 10, marginTop: 1 },
  divider: { height: 1, marginHorizontal: 10, marginTop: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  navLabel: { fontSize: 13, fontWeight: '500' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 10, marginTop: 8, paddingHorizontal: 10, paddingVertical: 14,
    borderRadius: 10, borderWidth: 1,
  },
  toggleLabel: { fontSize: 14, fontWeight: '500' },
  footer: { paddingHorizontal: 18, paddingVertical: 18, borderTopWidth: 1 },
  footerText: { fontSize: 11, textAlign: 'center' },
});
