import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { markOnboarded } from '../utils/storage';

const FEATURES = [
  {
    icon: '🔒',
    title: 'Fully Private',
    body: 'AI runs on your phone. Photos never leave your device.',
  },
  {
    icon: '📡',
    title: 'Works Offline',
    body: 'No internet needed after you download a model.',
  },
  {
    icon: '⚡',
    title: 'Instant Results',
    body: 'Point, snap, and get analysis in seconds.',
  },
];

const SCANS = [
  { emoji: '🍎', label: 'Food' },
  { emoji: '🌿', label: 'Plants' },
  { emoji: '📄', label: 'Text' },
  { emoji: '💊', label: 'Health' },
  { emoji: '💻', label: 'Code' },
  { emoji: '🔍', label: 'Objects' },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const btnScale = useRef(new Animated.Value(1)).current;

  const handleGetStarted = async () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    await markOnboarded();
    navigation.replace('Main');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={require('../../peeklogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.appName, { color: theme.accent }]}>Peek</Text>
          <Text style={[styles.tagline, { color: theme.text }]}>
            AI that sees what you see
          </Text>
          <Text style={[styles.subTagline, { color: theme.textSecondary }]}>
            Point your camera at anything and get instant AI-powered insights — all running privately on your phone.
          </Text>
        </View>

        {/* Feature cards */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View
              key={f.title}
              style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={[styles.featureTitle, { color: theme.text }]}>{f.title}</Text>
              <Text style={[styles.featureBody, { color: theme.textSecondary }]}>{f.body}</Text>
            </View>
          ))}
        </View>

        {/* Scan categories */}
        <View style={[styles.scanSection, { borderColor: theme.border }]}>
          <Text style={[styles.scanHeading, { color: theme.text }]}>
            What can you scan?
          </Text>
          <View style={styles.scanGrid}>
            {SCANS.map((s) => (
              <View
                key={s.label}
                style={[styles.scanChip, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <Text style={styles.scanEmoji}>{s.emoji}</Text>
                <Text style={[styles.scanLabel, { color: theme.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Privacy notice */}
        <View style={[styles.privacyBanner, { backgroundColor: theme.accent + '12', borderColor: theme.accent + '40' }]}>
          <Text style={[styles.privacyText, { color: theme.accent }]}>
            👁️  Your photos are never uploaded. Everything stays on your device.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.cta, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Text style={[styles.ctaHint, { color: theme.textSecondary }]}>
          You'll download one AI model to get started — free.
        </Text>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: theme.accent }]}
            onPress={handleGetStarted}
            activeOpacity={0.9}
          >
            <Text style={[styles.ctaBtnText, { color: theme.background }]}>
              Get Started  →
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 24 },
  hero: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 32,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 28,
  },
  appName: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 20,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  subTagline: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  features: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 28,
  },
  featureCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  featureIcon: { fontSize: 26, marginBottom: 8 },
  featureTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  featureBody: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  scanSection: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
  },
  scanHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  scanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  scanChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 80,
  },
  scanEmoji: { fontSize: 24, marginBottom: 4 },
  scanLabel: { fontSize: 12, fontWeight: '600' },
  privacyBanner: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  privacyText: { fontSize: 13, fontWeight: '600', lineHeight: 18, textAlign: 'center' },
  cta: {
    padding: 20,
    paddingBottom: 44,
    borderTopWidth: 1,
    gap: 12,
  },
  ctaHint: { fontSize: 13, textAlign: 'center' },
  ctaBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaBtnText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
});
