import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Switch,
} from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useThemeToggle } from '../navigation/AppNavigator';
import {
  getSettings, setAccelerator, setResponseLength, clearAllData, saveSettings,
} from '../utils/storage';
import { Accelerator, ResponseLength } from '../types';

const appVersion = Constants.expoConfig?.version ?? '1.0';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const toggleTheme = useThemeToggle();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const [accelerator, setAccelState] = useState<Accelerator>('cpu');
  const [responseLength, setRespLength] = useState<ResponseLength>('balanced');
  const [temperature, setTempState] = useState(0.7);
  const [topK, setTopKState] = useState(40);
  const [topP, setTopPState] = useState(0.95);
  const [repeatPenalty, setRepeatState] = useState(1.1);
  const [maxTokens, setMaxTokensState] = useState(1024);
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceBrand, setDeviceBrand] = useState('');
  const [totalMemory, setTotalMemory] = useState('N/A');

  useEffect(() => { loadSettings(); loadDeviceInfo(); }, []);

  const loadSettings = async () => {
    const s = await getSettings();
    setAccelState(s.accelerator);
    setRespLength(s.responseLength);
    setTempState(s.temperature ?? 0.7);
    setTopKState(s.topK ?? 40);
    setTopPState(s.topP ?? 0.95);
    setRepeatState(s.repeatPenalty ?? 1.1);
    setMaxTokensState(s.maxTokens ?? 1024);
  };

  const loadDeviceInfo = () => {
    setDeviceModel(Device.modelName || 'Unknown');
    setDeviceBrand(Device.brand || 'Unknown');
    const mem = (Device as any).totalMemory;
    if (mem) setTotalMemory(`${(mem / 1073741824).toFixed(1)} GB`);
  };

  const set = async (patch: Record<string, any>) => saveSettings(patch as any);

  const OptionBtn = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.optionBtn, { borderColor: theme.border }, selected && { backgroundColor: theme.accent }]}
      onPress={onPress}
    >
      <Text style={[styles.optionText, { color: selected ? theme.accentFg : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  // ── Warnings ──────────────────────────────────────────────
  const tempWarn = temperature > 1.0
    ? 'High temperature — output may become erratic or repetitive.'
    : null;
  const topKWarn = topK > 80
    ? 'Very broad sampling — responses may lose focus.'
    : null;
  const topPWarn = topP > 0.97
    ? 'Near maximum — similar effect to high temperature.'
    : null;
  const repeatWarn = repeatPenalty > 1.3
    ? 'Aggressive penalty — may produce choppy or cut-off sentences.'
    : null;
  const tokensWarn = maxTokens >= 4096
    ? 'Very high — may cause out-of-memory on devices with less than 4 GB RAM.'
    : maxTokens > 2048
    ? 'Large outputs take more time and drain battery faster.'
    : null;

  const Warn = ({ msg }: { msg: string | null }) =>
    msg ? <Text style={[styles.warn, { color: '#F59E0B' }]}>{msg}</Text> : null;

  const ParamRow = ({ label, hint, children, warn }: {
    label: string; hint: string; children: React.ReactNode; warn: string | null;
  }) => (
    <View style={styles.paramBlock}>
      <View style={styles.paramHeader}>
        <Text style={[styles.paramLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.paramHint, { color: theme.textSecondary }]}>{hint}</Text>
      </View>
      <View style={styles.optionsRow}>{children}</View>
      <Warn msg={warn} />
    </View>
  );

  const handleClearData = () => {
    Alert.alert('Clear All Data', 'This will remove all history and settings. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => { await clearAllData(); navigation.popToTop(); },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.backText, { color: theme.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={() => toggleTheme()}
              trackColor={{ false: theme.border, true: theme.accent + '80' }}
              thumbColor={isDark ? theme.accent : theme.textSecondary}
            />
          </View>
        </View>

        {/* Performance */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Performance</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Accelerator</Text>
            <View style={styles.optionsRow}>
              <OptionBtn label="CPU" selected={accelerator === 'cpu'} onPress={() => { setAccelState('cpu'); setAccelerator('cpu'); }} />
              <OptionBtn label="GPU" selected={accelerator === 'gpu'} onPress={() => { setAccelState('gpu'); setAccelerator('gpu'); }} />
            </View>
          </View>
        </View>

        {/* Generation Parameters */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Generation</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>

          <ParamRow
            label="Temperature"
            hint="Creativity vs. focus"
            warn={tempWarn}
          >
            {[0.1, 0.3, 0.7, 1.0, 1.2].map(v => (
              <OptionBtn key={v} label={v.toFixed(1)} selected={temperature === v}
                onPress={() => { setTempState(v); set({ temperature: v }); }} />
            ))}
          </ParamRow>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ParamRow
            label="Top-K"
            hint="Vocabulary pool size"
            warn={topKWarn}
          >
            {[10, 20, 40, 60, 80].map(v => (
              <OptionBtn key={v} label={String(v)} selected={topK === v}
                onPress={() => { setTopKState(v); set({ topK: v }); }} />
            ))}
          </ParamRow>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ParamRow
            label="Top-P"
            hint="Nucleus sampling threshold"
            warn={topPWarn}
          >
            {[0.7, 0.85, 0.92, 0.95, 1.0].map(v => (
              <OptionBtn key={v} label={v.toFixed(2)} selected={topP === v}
                onPress={() => { setTopPState(v); set({ topP: v }); }} />
            ))}
          </ParamRow>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ParamRow
            label="Repeat Penalty"
            hint="Reduces repeated phrases"
            warn={repeatWarn}
          >
            {[1.0, 1.1, 1.2, 1.3, 1.5].map(v => (
              <OptionBtn key={v} label={v.toFixed(1)} selected={repeatPenalty === v}
                onPress={() => { setRepeatState(v); set({ repeatPenalty: v }); }} />
            ))}
          </ParamRow>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ParamRow
            label="Max Tokens"
            hint="Output length limit"
            warn={tokensWarn}
          >
            {[256, 512, 1024, 2048, 4096].map(v => (
              <OptionBtn key={v} label={v >= 1024 ? `${v / 1024}k` : String(v)} selected={maxTokens === v}
                onPress={() => { setMaxTokensState(v); set({ maxTokens: v }); }} />
            ))}
          </ParamRow>

        </View>

        {/* Device */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Device</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          {[['Model', deviceModel], ['Brand', deviceBrand], ['RAM', totalMemory]].map(([k, v]) => (
            <View key={k} style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: theme.textSecondary }]}>{k}</Text>
              <Text style={[styles.infoVal, { color: theme.text }]}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.accent + '40', borderWidth: 1 }]}>
          <View style={styles.qvacRow}>
            <View style={[styles.qvacDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.qvacName, { color: theme.accent }]}>qvac</Text>
            <View style={[styles.qvacBadge, { backgroundColor: theme.accent + '20' }]}>
              <Text style={[styles.qvacBadgeText, { color: theme.accent }]}>On-Device AI</Text>
            </View>
          </View>
          <Text style={[styles.qvacDesc, { color: theme.textSecondary }]}>
            All AI inference in Peek runs locally using the qvac SDK — no cloud, no servers, no data leaving your phone.
          </Text>
        </View>

        <TouchableOpacity style={[styles.dangerBtn, { borderColor: theme.error }]} onPress={handleClearData}>
          <Text style={[styles.dangerText, { color: theme.error }]}>Clear All Data</Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: theme.textSecondary }]}>{`Peek v${appVersion} · Built with qvac · On-Device AI`}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 58, paddingBottom: 14, borderBottomWidth: 1,
  },
  backText: { fontSize: 17, fontWeight: '600' },
  topBarTitle: { fontSize: 18, fontWeight: '800' },
  scroll: { paddingHorizontal: 20, paddingBottom: 60, gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 6 },
  card: { borderRadius: 14, padding: 14, gap: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  optionsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  optionBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  optionText: { fontSize: 13, fontWeight: '600' },
  paramBlock: { gap: 8 },
  paramHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  paramLabel: { fontSize: 14, fontWeight: '600' },
  paramHint: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth },
  warn: { fontSize: 11, lineHeight: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoKey: { fontSize: 14 },
  infoVal: { fontSize: 14, fontWeight: '600' },
  qvacRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  qvacDot: { width: 8, height: 8, borderRadius: 4 },
  qvacName: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  qvacBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  qvacBadgeText: { fontSize: 11, fontWeight: '700' },
  qvacDesc: { fontSize: 13, lineHeight: 19 },
  dangerBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, marginTop: 16 },
  dangerText: { fontSize: 15, fontWeight: '700' },
  footer: { fontSize: 12, textAlign: 'center', marginTop: 20 },
});
