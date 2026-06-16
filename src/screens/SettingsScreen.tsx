import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Switch,
} from 'react-native';
import * as Device from 'expo-device';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useThemeToggle } from '../navigation/AppNavigator';
import {
  getSettings, setAccelerator, setResponseLength,
  getHuggingFaceToken, setHuggingFaceToken, clearAllData,
} from '../utils/storage';
import { Accelerator, ResponseLength } from '../types';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const toggleTheme = useThemeToggle();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const [accelerator, setAccelState] = useState<Accelerator>('cpu');
  const [responseLength, setRespLength] = useState<ResponseLength>('balanced');
  const [hfToken, setHfToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceBrand, setDeviceBrand] = useState('');
  const [totalMemory, setTotalMemory] = useState('N/A');

  useEffect(() => {
    loadSettings();
    loadDeviceInfo();
  }, []);

  const loadSettings = async () => {
    const settings = await getSettings();
    setAccelState(settings.accelerator);
    setRespLength(settings.responseLength);
    const token = await getHuggingFaceToken();
    setHfToken(token);
  };

  const loadDeviceInfo = () => {
    setDeviceModel(Device.modelName || 'Unknown');
    setDeviceBrand(Device.brand || 'Unknown');
    const mem = (Device as any).totalMemory;
    if (mem) setTotalMemory(`${(mem / 1073741824).toFixed(1)} GB`);
  };

  const handleAcceleratorToggle = (value: Accelerator) => {
    setAccelState(value);
    setAccelerator(value);
  };

  const handleResponseLength = (value: ResponseLength) => {
    setRespLength(value);
    setResponseLength(value);
  };

  const handleSaveToken = () => {
    setHuggingFaceToken(hfToken);
    Alert.alert('Saved', 'HuggingFace token saved.');
  };

  const handleClearData = () => {
    Alert.alert('Clear All Data', 'This will remove all history and settings. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => { await clearAllData(); navigation.popToTop(); },
      },
    ]);
  };

  const OptionBtn = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.optionBtn, { borderColor: theme.border }, selected && { backgroundColor: theme.accent }]}
      onPress={onPress}
    >
      <Text style={[styles.optionText, { color: selected ? theme.accentFg : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );

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

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Performance</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Accelerator</Text>
            <View style={styles.optionsRow}>
              <OptionBtn label="CPU" selected={accelerator === 'cpu'} onPress={() => handleAcceleratorToggle('cpu')} />
              <OptionBtn label="GPU" selected={accelerator === 'gpu'} onPress={() => handleAcceleratorToggle('gpu')} />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Response Length</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.cardRow}>
            <View style={styles.optionsRow}>
              <OptionBtn label="Short" selected={responseLength === 'short'} onPress={() => handleResponseLength('short')} />
              <OptionBtn label="Balanced" selected={responseLength === 'balanced'} onPress={() => handleResponseLength('balanced')} />
              <OptionBtn label="Detailed" selected={responseLength === 'detailed'} onPress={() => handleResponseLength('detailed')} />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>HuggingFace Token</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            value={hfToken}
            onChangeText={setHfToken}
            placeholder="hf_..."
            placeholderTextColor={theme.textSecondary}
            secureTextEntry={!showToken}
            autoCapitalize="none"
          />
          <View style={styles.tokenActions}>
            <TouchableOpacity
              style={[styles.tokenBtn, { borderColor: theme.border }]}
              onPress={() => setShowToken(!showToken)}
            >
              <Text style={[styles.tokenBtnText, { color: theme.textSecondary }]}>{showToken ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tokenBtn, { backgroundColor: theme.accent }]}
              onPress={handleSaveToken}
            >
              <Text style={[styles.tokenBtnText, { color: theme.accentFg }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

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

        <Text style={[styles.footer, { color: theme.textSecondary }]}>
          Peek v1.0 · Built with qvac · On-Device AI
        </Text>
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
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 20, marginBottom: 6,
  },
  card: { borderRadius: 14, padding: 14, gap: 8 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  optionsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  optionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  optionText: { fontSize: 13, fontWeight: '600' },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  tokenActions: { flexDirection: 'row', gap: 8 },
  tokenBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  tokenBtnText: { fontSize: 14, fontWeight: '600' },
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
