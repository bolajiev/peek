import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Switch, ScrollView } from 'react-native';
import { getTheme } from '../theme';
import { useTheme, useThemeToggle } from '../navigation/AppNavigator';
import { getHistory } from '../utils/storage';

interface Props {
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

export default function Sidebar({ onClose, onNavigate }: Props) {
  const themeMode = useTheme();
  const toggle = useThemeToggle();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    getHistory().then((h) => setFileCount(h.length));
  }, []);

  const NavRow = ({ label, screen }: { label: string; screen: string }) => (
    <TouchableOpacity
      style={[styles.navRow, { borderBottomColor: theme.border }]}
      onPress={() => onNavigate(screen)}
      activeOpacity={0.7}
    >
      <Text style={[styles.navLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderRightColor: theme.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image source={require('../../peeklogo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.logoText, { color: theme.accent }]}>Peek</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.closeIcon, { color: theme.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Navigation */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Navigate</Text>
        <View style={[styles.navCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <NavRow label="History" screen="History" />
          <NavRow label="Models" screen="Models" />
          <TouchableOpacity
            style={[styles.navRow, { borderBottomColor: 'transparent' }]}
            onPress={() => onNavigate('Settings')}
            activeOpacity={0.7}
          >
            <Text style={[styles.navLabel, { color: theme.text }]}>Settings</Text>
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Files */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Files</Text>
        <View style={[styles.filesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.filesRow}>
            <Text style={[styles.filesCount, { color: theme.text }]}>{fileCount}</Text>
            <Text style={[styles.filesLabel, { color: theme.textSecondary }]}>
              {fileCount === 1 ? 'file analyzed' : 'files analyzed'}
            </Text>
          </View>
          <View style={[styles.filesBar, { backgroundColor: theme.border }]}>
            <View style={[styles.filesFill, { backgroundColor: theme.accent, width: `${Math.min(fileCount * 5, 100)}%` }]} />
          </View>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Appearance</Text>
        <View style={[styles.toggleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Dark mode</Text>
          <Switch
            value={isDark}
            onValueChange={() => toggle()}
            trackColor={{ false: theme.border, true: theme.accent + '80' }}
            thumbColor={isDark ? theme.accent : theme.textSecondary}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>Peek v1.0 · On-Device AI · qvac</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRightWidth: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  logoText: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  closeIcon: { fontSize: 18, fontWeight: '600', padding: 4 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 24, marginBottom: 8,
  },
  navCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1,
  },
  navLabel: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 20, fontWeight: '300' },
  filesCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  filesRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  filesCount: { fontSize: 32, fontWeight: '900' },
  filesLabel: { fontSize: 14, fontWeight: '500' },
  filesBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  filesFill: { height: '100%', borderRadius: 2 },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingVertical: 20, borderTopWidth: 1 },
  footerText: { fontSize: 12 },
});
