import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Linking, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { IconBack } from '../components/Icons';

const DOWNLOAD_URL = 'https://linktr.ee/peekapp';

const FEATURES = [
  { emoji: '📷', title: 'Peek Lens', desc: 'Scan documents and images with on-device vision AI.' },
  { emoji: '🎙️', title: 'Peek Voice', desc: 'Record speech and get live transcripts and AI summaries.' },
  { emoji: '✍️', title: 'Peek Scribe', desc: 'Chat privately with a powerful language model.' },
  { emoji: '🔬', title: 'Peek Deep', desc: 'Upload files and ask questions about their content.' },
];

export default function AboutScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
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
          <Image source={require('../../peeklogo.png')} style={styles.logo} />
          <Text style={[styles.appName, { color: theme.text }]}>Peek</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>AI that runs on your phone.</Text>
          <View style={[styles.badgeRow]}>
            {['Private', 'Offline', 'Free'].map(b => (
              <View key={b} style={[styles.badge, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={[styles.badgeText, { color: theme.textSecondary }]}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* About */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>What is Peek?</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Peek is a private AI assistant that runs entirely on your device. No internet connection, no data collection, no subscriptions. Everything stays on your phone.
          </Text>
        </View>

        {/* Features */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Features</Text>
        {FEATURES.map(f => (
          <View key={f.title} style={[styles.featureRow, { borderColor: theme.border }]}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <View style={styles.featureBody}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>{f.title}</Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>{f.desc}</Text>
            </View>
          </View>
        ))}

        {/* Download */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 8 }]}>Get the App</Text>
        <TouchableOpacity
          style={[styles.downloadBtn, { backgroundColor: theme.accent }]}
          onPress={() => Linking.openURL(DOWNLOAD_URL)}
          activeOpacity={0.85}
        >
          <Text style={[styles.downloadBtnText, { color: theme.accentFg }]}>Download Peek →</Text>
        </TouchableOpacity>
        <Text style={[styles.urlHint, { color: theme.textSecondary }]}>{DOWNLOAD_URL}</Text>

        {/* Privacy */}
        <View style={[styles.privacyCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
            Your data never leaves your device. AI processing happens 100% on-device using QVAC SDK.
          </Text>
        </View>

        <Text style={[styles.version, { color: theme.textSecondary }]}>Peek v1.0 · Built with QVAC SDK</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 28 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 28 },
  logo: { width: 72, height: 72, borderRadius: 20, marginBottom: 8 },
  appName: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  tagline: { fontSize: 15 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 21 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 10,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderBottomWidth: 1, paddingVertical: 13,
  },
  featureEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  featureBody: { flex: 1, gap: 3 },
  featureTitle: { fontSize: 14, fontWeight: '700' },
  featureDesc: { fontSize: 13, lineHeight: 19 },
  downloadBtn: {
    borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 8, marginTop: 4,
  },
  downloadBtnText: { fontSize: 16, fontWeight: '800' },
  urlHint: { fontSize: 11, textAlign: 'center', marginBottom: 16 },
  privacyCard: {
    borderRadius: 14, borderWidth: 1, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  lockEmoji: { fontSize: 24 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
  version: { fontSize: 11, textAlign: 'center', marginBottom: 8 },
});
