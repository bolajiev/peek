import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Keyboard, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';

function mapsIframeHtml(location: string): string {
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;display:block}</style></head><body><iframe src="${src}" allowfullscreen></iframe></body></html>`;
}

function CautionModal({ visible, onContinue, theme }: { visible: boolean; onContinue: () => void; theme: any }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modal.overlay}>
        <View style={[modal.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[modal.title, { color: theme.text }]}>Before you continue</Text>

          <View style={[modal.row, { borderColor: theme.border }]}>
            <Text style={[modal.rowIcon, { color: theme.accent }]}>!</Text>
            <Text style={[modal.rowText, { color: theme.textSecondary }]}>
              Map Search uses Google Maps. Your search query is sent to Google's servers to display the map.
            </Text>
          </View>

          <View style={[modal.row, { borderColor: theme.border }]}>
            <Text style={[modal.rowIcon, { color: theme.text }]}>+</Text>
            <Text style={[modal.rowText, { color: theme.textSecondary }]}>
              No GPS data is collected from your device. Peek does not know your physical location.
            </Text>
          </View>

          <View style={[modal.row, { borderColor: theme.border }]}>
            <Text style={[modal.rowIcon, { color: theme.text }]}>+</Text>
            <Text style={[modal.rowText, { color: theme.textSecondary }]}>
              Peek itself does not log, store, or share your map searches. This notice shows every time as a reminder.
            </Text>
          </View>

          <TouchableOpacity
            style={[modal.btn, { backgroundColor: theme.accent }]}
            onPress={onContinue}
            activeOpacity={0.85}
          >
            <Text style={[modal.btnText, { color: theme.accentFg }]}>I understand — Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function NearbyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialQuery: string = route.params?.query ?? '';
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [showCaution, setShowCaution] = useState(true);
  const [input, setInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState('');

  const mapHtml = activeQuery.trim() ? mapsIframeHtml(activeQuery.trim()) : null;

  const handleContinue = () => {
    setShowCaution(false);
    if (initialQuery.trim()) setActiveQuery(initialQuery.trim());
  };

  const doSearch = () => {
    const q = input.trim();
    if (!q) return;
    Keyboard.dismiss();
    setActiveQuery(q);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <CautionModal visible={showCaution} onContinue={handleContinue} theme={theme} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
        >
          <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Map</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={[styles.searchRow, { borderBottomColor: theme.border }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="Search any place..."
          placeholderTextColor={theme.textSecondary}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={doSearch}
          returnKeyType="search"
          autoCorrect={false}
          editable={!showCaution}
        />
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: theme.accent, opacity: showCaution ? 0.4 : 1 }]}
          onPress={doSearch}
          activeOpacity={0.8}
          disabled={showCaution}
        >
          <Text style={[styles.searchBtnText, { color: theme.accentFg }]}>Go</Text>
        </TouchableOpacity>
      </View>

      {mapHtml ? (
        <WebView
          source={{ html: mapHtml }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />
      ) : (
        <View style={styles.center}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Type any place, city, or address above.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1,
  },
  back: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1, height: 42, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, fontSize: 15,
  },
  searchBtn: {
    height: 42, paddingHorizontal: 18, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  hint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', borderRadius: 20, borderWidth: 1,
    padding: 22, gap: 14,
  },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12,
  },
  rowIcon: { fontSize: 16, fontWeight: '900', width: 18, textAlign: 'center', marginTop: 1 },
  rowText: { flex: 1, fontSize: 13, lineHeight: 19 },
  btn: {
    marginTop: 4, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '800' },
});
