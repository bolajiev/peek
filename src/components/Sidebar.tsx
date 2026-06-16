import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Switch,
  ScrollView,
} from 'react-native';
import { getTheme } from '../theme';
import { useTheme, useThemeToggle } from '../navigation/AppNavigator';
import { getDownloadedModels, getDefaultModelId } from '../utils/storage';
import { getRagDocCount } from '../utils/ragService';
import { DownloadedModel } from '../types';

interface Props {
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

export default function Sidebar({ onClose, onNavigate }: Props) {
  const themeMode = useTheme();
  const toggle = useThemeToggle();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const [activeModel, setActiveModel] = useState<DownloadedModel | null>(null);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    const [models, defaultId, count] = await Promise.all([
      getDownloadedModels(),
      getDefaultModelId(),
      getRagDocCount(),
    ]);
    const model = defaultId
      ? models.find((m) => m.id === defaultId) ?? models[0] ?? null
      : models[0] ?? null;
    setActiveModel(model);
    setDocCount(count);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderRightColor: theme.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image source={require('../../peeklogo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.logoText, { color: theme.accent }]}>Peek</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.closeIcon, { color: theme.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Model section */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Active Model</Text>
        {activeModel ? (
          <TouchableOpacity
            style={[styles.modelCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => onNavigate('Models')}
            activeOpacity={0.7}
          >
            <View style={[styles.modelDot, { backgroundColor: theme.accent }]} />
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: theme.text }]} numberOfLines={1}>
                {activeModel.name}
              </Text>
              <Text style={[styles.modelSize, { color: theme.textSecondary }]}>
                {activeModel.size}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.modelCard, { backgroundColor: theme.card, borderColor: theme.accent + '44' }]}
            onPress={() => onNavigate('Models')}
            activeOpacity={0.7}
          >
            <Text style={[styles.noModelText, { color: theme.accent }]}>Download a model to start →</Text>
          </TouchableOpacity>
        )}

        {/* Memory section */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Memory</Text>
        <View style={[styles.memoryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.memoryRow}>
            <View style={styles.memoryLeft}>
              <Text style={[styles.memoryCount, { color: theme.text }]}>{docCount}</Text>
              <Text style={[styles.memoryLabel, { color: theme.textSecondary }]}>
                {docCount === 1 ? 'document' : 'documents'} stored
              </Text>
            </View>
            <View style={[styles.memoryBar, { backgroundColor: theme.border }]}>
              <View style={[styles.memoryFill, { backgroundColor: theme.accent, width: `${Math.min(docCount * 10, 100)}%` }]} />
            </View>
          </View>
          <Text style={[styles.memoryHint, { color: theme.textSecondary }]}>
            Add documents from the Scan screen. The AI searches your memory automatically.
          </Text>
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

        {/* Settings link */}
        <TouchableOpacity
          style={[styles.linkRow, { borderColor: theme.border }]}
          onPress={() => onNavigate('Settings')}
          activeOpacity={0.7}
        >
          <Text style={[styles.linkText, { color: theme.text }]}>Settings</Text>
          <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          Peek v1.0 · On-Device AI · qvac
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRightWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  modelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '700',
  },
  modelSize: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
  },
  noModelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  memoryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memoryLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  memoryCount: {
    fontSize: 28,
    fontWeight: '900',
  },
  memoryLabel: {
    fontSize: 13,
  },
  memoryBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  memoryFill: {
    height: '100%',
    borderRadius: 2,
  },
  memoryHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginTop: 8,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
  },
});
