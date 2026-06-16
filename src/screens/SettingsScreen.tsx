import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import * as Device from 'expo-device';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useThemeContext } from '../navigation/AppNavigator';
import {
  getSettings,
  setThemeMode,
  setAccelerator,
  setResponseLength,
  getHuggingFaceToken,
  setHuggingFaceToken,
  clearAllData,
  getCustomSystemPrompt,
  setCustomSystemPrompt,
  clearCustomSystemPrompt,
} from '../utils/storage';
import { DEFAULT_PROMPTS } from '../utils/models';
import { ThemeMode, Accelerator, ResponseLength, UseCase } from '../types';

const PROMPT_CATEGORIES: { id: UseCase; emoji: string; label: string }[] = [
  { id: 'food', emoji: '🍎', label: 'Food & Nutrition' },
  { id: 'plant', emoji: '🌿', label: 'Plant Identifier' },
  { id: 'text', emoji: '📄', label: 'Text & Documents' },
  { id: 'health', emoji: '💊', label: 'Health & Medicine' },
  { id: 'code', emoji: '💻', label: 'Code Reader' },
  { id: 'object', emoji: '🔍', label: 'Object Identifier' },
];

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { themeMode, setThemeMode: updateTheme } = useThemeContext();
  const theme = getTheme(themeMode);
  const [accelerator, setAccelState] = useState<Accelerator>('gpu');
  const [responseLength, setRespLength] = useState<ResponseLength>('balanced');
  const [hfToken, setHfToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceBrand, setDeviceBrand] = useState('');
  const [totalMemory, setTotalMemory] = useState('N/A');
  const [editingPromptFor, setEditingPromptFor] = useState<UseCase | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [customPrompts, setCustomPrompts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSettings();
    loadDeviceInfo();
    loadCustomPromptFlags();
  }, []);

  const loadCustomPromptFlags = async () => {
    const flags: Record<string, boolean> = {};
    for (const cat of PROMPT_CATEGORIES) {
      const p = await getCustomSystemPrompt(cat.id);
      flags[cat.id] = !!p;
    }
    setCustomPrompts(flags);
  };

  const openPromptEditor = async (useCase: UseCase) => {
    const custom = await getCustomSystemPrompt(useCase);
    setPromptDraft(custom ?? DEFAULT_PROMPTS[useCase]);
    setEditingPromptFor(useCase);
  };

  const savePrompt = async () => {
    if (!editingPromptFor) return;
    const defaultPrompt = DEFAULT_PROMPTS[editingPromptFor];
    if (promptDraft.trim() === defaultPrompt.trim()) {
      await clearCustomSystemPrompt(editingPromptFor);
    } else {
      await setCustomSystemPrompt(editingPromptFor, promptDraft.trim());
    }
    await loadCustomPromptFlags();
    setEditingPromptFor(null);
  };

  const resetPrompt = async () => {
    if (!editingPromptFor) return;
    await clearCustomSystemPrompt(editingPromptFor);
    setPromptDraft(DEFAULT_PROMPTS[editingPromptFor]);
    await loadCustomPromptFlags();
  };

  const loadSettings = async () => {
    const settings = await getSettings();
    setAccelState(settings.accelerator);
    setRespLength(settings.responseLength);
    const token = await getHuggingFaceToken();
    setHfToken(token);
  };

  const loadDeviceInfo = async () => {
    setDeviceModel(Device.modelName || 'Unknown');
    setDeviceBrand(Device.brand || 'Unknown');
    const mem = (Device as any).totalMemory;
    if (mem) {
      const gb = (mem / 1073741824).toFixed(1);
      setTotalMemory(`${gb} GB`);
    }
  };

  const handleThemeToggle = () => {
    const newMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(newMode);
    updateTheme(newMode);
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
    Alert.alert(
      'Clear All Data',
      'This will remove all downloaded models, history, and settings. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Done', 'All data cleared. The app will restart.');
            navigation.popToTop();
          },
        },
      ]
    );
  };

  const OptionRow = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[
        styles.optionBtn,
        selected && { backgroundColor: theme.accent },
        { borderColor: theme.border },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.optionText,
          { color: selected ? theme.background : theme.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Appearance
          </Text>
          <TouchableOpacity
            style={[styles.settingRow, { backgroundColor: theme.card }]}
            onPress={handleThemeToggle}
          >
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              Dark Mode
            </Text>
            <View
              style={[
                styles.toggle,
                themeMode === 'dark' && { backgroundColor: theme.accent },
                { borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.toggleDot,
                  {
                    alignSelf: themeMode === 'dark' ? 'flex-end' : 'flex-start',
                    backgroundColor:
                      themeMode === 'dark' ? theme.background : theme.textSecondary,
                  },
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Performance
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              Accelerator
            </Text>
            <View style={styles.optionsRow}>
              <OptionRow
                label="CPU"
                selected={accelerator === 'cpu'}
                onPress={() => handleAcceleratorToggle('cpu')}
              />
              <OptionRow
                label="GPU"
                selected={accelerator === 'gpu'}
                onPress={() => handleAcceleratorToggle('gpu')}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Response Length
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card }]}>
            <View style={styles.optionsRow}>
              <OptionRow
                label="Short"
                selected={responseLength === 'short'}
                onPress={() => handleResponseLength('short')}
              />
              <OptionRow
                label="Balanced"
                selected={responseLength === 'balanced'}
                onPress={() => handleResponseLength('balanced')}
              />
              <OptionRow
                label="Detailed"
                selected={responseLength === 'detailed'}
                onPress={() => handleResponseLength('detailed')}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            HuggingFace Token
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card }]}>
            <View style={styles.tokenContainer}>
              <TextInput
                style={[
                  styles.tokenInput,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={hfToken}
                onChangeText={setHfToken}
                placeholder="hf_..."
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showToken}
                autoCapitalize="none"
              />
              <View style={styles.tokenActions}>
                <TouchableOpacity
                  onPress={() => setShowToken(!showToken)}
                  style={[styles.tokenActionBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.tokenActionText, { color: theme.textSecondary }]}>
                    {showToken ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveToken}
                  style={[styles.tokenActionBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.tokenActionText, { color: theme.background }]}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Hardware Info
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                Model
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {deviceModel}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                Brand
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {deviceBrand}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                RAM
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {totalMemory}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            App
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              Version
            </Text>
            <Text style={[styles.settingValue, { color: theme.textSecondary }]}>
              1.0.0
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: theme.error }]}
            onPress={handleClearData}
          >
            <Text style={[styles.dangerText, { color: theme.error }]}>
              Clear All Data
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            System Prompts
          </Text>
          <View style={[styles.settingRow, { backgroundColor: theme.card, flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
            <Text style={[styles.promptHint, { color: theme.textSecondary }]}>
              Customise how the AI analyses each category. Changes apply to future scans.
            </Text>
            {PROMPT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.promptRow, { borderTopColor: theme.border }]}
                onPress={() => openPromptEditor(cat.id)}
              >
                <Text style={styles.promptEmoji}>{cat.emoji}</Text>
                <Text style={[styles.promptLabel, { color: theme.text }]}>{cat.label}</Text>
                {customPrompts[cat.id] && (
                  <View style={[styles.customBadge, { backgroundColor: theme.accent + '25' }]}>
                    <Text style={[styles.customBadgeText, { color: theme.accent }]}>Custom</Text>
                  </View>
                )}
                <Text style={[styles.promptArrow, { color: theme.textSecondary }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Powered By
          </Text>
          <View style={[styles.qvacCard, { backgroundColor: theme.card, borderColor: theme.accent + '40' }]}>
            <View style={styles.qvacHeader}>
              <View style={[styles.qvacDot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.qvacName, { color: theme.accent }]}>qvac</Text>
              <View style={[styles.qvacBadge, { backgroundColor: theme.accent + '20' }]}>
                <Text style={[styles.qvacBadgeText, { color: theme.accent }]}>On-Device AI</Text>
              </View>
            </View>
            <Text style={[styles.qvacDesc, { color: theme.textSecondary }]}>
              All AI inference in Peek runs locally on your device using the qvac SDK — no cloud, no servers, no data leaving your phone.
            </Text>
            <View style={[styles.qvacDivider, { backgroundColor: theme.border }]} />
            <View style={styles.qvacStats}>
              <View style={styles.qvacStat}>
                <Text style={[styles.qvacStatValue, { color: theme.text }]}>100%</Text>
                <Text style={[styles.qvacStatLabel, { color: theme.textSecondary }]}>On-Device</Text>
              </View>
              <View style={[styles.qvacStatDivider, { backgroundColor: theme.border }]} />
              <View style={styles.qvacStat}>
                <Text style={[styles.qvacStatValue, { color: theme.text }]}>0</Text>
                <Text style={[styles.qvacStatLabel, { color: theme.textSecondary }]}>Cloud APIs</Text>
              </View>
              <View style={[styles.qvacStatDivider, { backgroundColor: theme.border }]} />
              <View style={styles.qvacStat}>
                <Text style={[styles.qvacStatValue, { color: theme.text }]}>6+</Text>
                <Text style={[styles.qvacStatLabel, { color: theme.textSecondary }]}>VLM Models</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.licenseSection}>
          <Text style={[styles.licenseText, { color: theme.textSecondary }]}>
            Peek · Apache 2.0 License · Built for the qvac Hackathon
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Prompt editor modal */}
      <Modal
        visible={editingPromptFor !== null}
        animationType="slide"
        onRequestClose={() => setEditingPromptFor(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalTopBar, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setEditingPromptFor(null)}>
              <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {PROMPT_CATEGORIES.find((c) => c.id === editingPromptFor)?.emoji}{' '}
              {PROMPT_CATEGORIES.find((c) => c.id === editingPromptFor)?.label}
            </Text>
            <TouchableOpacity onPress={savePrompt}>
              <Text style={[styles.modalSave, { color: theme.accent }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
              This prompt is sent to the AI before every scan in this category. Edit it to change tone, output format, or focus area.
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                {
                  backgroundColor: theme.card,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              value={promptDraft}
              onChangeText={setPromptDraft}
              multiline
              textAlignVertical="top"
              autoFocus
              placeholder="Enter system prompt…"
              placeholderTextColor={theme.textSecondary}
            />
            <TouchableOpacity
              style={[styles.resetBtn, { borderColor: theme.border }]}
              onPress={resetPrompt}
            >
              <Text style={[styles.resetText, { color: theme.textSecondary }]}>
                Reset to Default
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  settingRow: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: 14,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tokenContainer: {
    width: '100%',
    gap: 8,
  },
  tokenInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  tokenActions: {
    flexDirection: 'row',
    gap: 8,
  },
  tokenActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tokenActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  dangerButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '700',
  },
  licenseSection: {
    paddingHorizontal: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  licenseText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  qvacCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  qvacHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qvacDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  qvacName: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  qvacBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  qvacBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qvacDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  qvacDivider: {
    height: 1,
  },
  qvacStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  qvacStat: {
    alignItems: 'center',
    flex: 1,
  },
  qvacStatValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  qvacStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  qvacStatDivider: {
    width: 1,
    alignSelf: 'stretch',
  },
  promptHint: {
    fontSize: 12,
    lineHeight: 17,
    paddingBottom: 8,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  promptEmoji: { fontSize: 18 },
  promptLabel: { fontSize: 15, flex: 1 },
  promptArrow: { fontSize: 20, fontWeight: '300' },
  customBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  customBadgeText: { fontSize: 11, fontWeight: '700' },
  modalContainer: { flex: 1 },
  modalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalCancel: { fontSize: 16 },
  modalSave: { fontSize: 16, fontWeight: '700' },
  modalScroll: { flex: 1, padding: 16 },
  modalHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  promptInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 320,
  },
  resetBtn: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  resetText: { fontSize: 14, fontWeight: '600' },
});
