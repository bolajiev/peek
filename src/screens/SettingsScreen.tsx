import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
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
} from '../utils/storage';
import { ThemeMode, Accelerator, ResponseLength } from '../types';

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

        <View style={styles.licenseSection}>
          <Text style={[styles.licenseText, { color: theme.textSecondary }]}>
            Peek is open source under the Apache 2.0 License.{'\n'}
            All AI inference runs on-device via QVAC SDK.{'\n'}
            No cloud AI APIs are used.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
});
