import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Image, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { markOnboarded } from '../utils/storage';

const { width: SW } = Dimensions.get('window');

const FEATURES = [
  { emoji: '📷', title: 'Lens', desc: 'Scan food, labels, and images instantly' },
  { emoji: '🎙️', title: 'Voice', desc: 'Transcribe and summarize any audio' },
  { emoji: '✍️', title: 'Scribe', desc: 'Write, draft, and chat with AI' },
  { emoji: '🔬', title: 'Deep', desc: 'Research your own files privately' },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const btnScale = useRef(new Animated.Value(1)).current;

  const goNext = () => {
    const next = page + 1;
    scrollRef.current?.scrollTo({ x: SW * next, animated: true });
    setPage(next);
  };

  const handleGetStarted = async () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    await markOnboarded();
    navigation.replace('V2Home');
  };

  const onScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (idx !== page) setPage(idx);
  };

  const topPad = Math.max(insets.top, 32);
  const botPad = Math.max(insets.bottom, 20);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.pager}
        bounces={false}
      >
        {/* ── Slide 1: Welcome ── */}
        <View style={[styles.slide, { paddingTop: topPad }]}>
          <View style={styles.s1Center}>
            <Image
              source={require('../../peeklogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: theme.accent }]}>Peek</Text>
            <Text style={[styles.tagline, { color: theme.text }]}>
              AI that runs on your phone.
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              Private · Offline · Free
            </Text>
          </View>
        </View>

        {/* ── Slide 2: Features ── */}
        <View style={[styles.slide, { paddingTop: topPad }]}>
          <Text style={[styles.slideTitle, { color: theme.text }]}>What Peek does</Text>
          <Text style={[styles.slideSub, { color: theme.textSecondary }]}>
            Four powerful tools, all on-device
          </Text>
          <View style={styles.featureList}>
            {FEATURES.map(f => (
              <View key={f.title} style={[styles.featureRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { color: theme.text }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Slide 3: Privacy ── */}
        <View style={[styles.slide, { paddingTop: topPad }]}>
          <View style={styles.s3Center}>
            <Text style={styles.lockEmoji}>🔒</Text>
            <Text style={[styles.slideTitle, { color: theme.text }]}>Your data, your rules</Text>
            <Text style={[styles.privacyLine, { color: theme.textSecondary }]}>
              No cloud. No tracking.{'\n'}Nothing ever leaves your phone.
            </Text>
            <View style={[styles.downloadNote, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.downloadNoteText, { color: theme.textSecondary }]}>
                You'll download one AI model to start — free and one-time.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Footer: dots + button ── */}
      <View style={[styles.footer, { paddingBottom: botPad, borderTopColor: theme.border }]}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                i === page
                  ? { backgroundColor: theme.accent, width: 20 }
                  : { backgroundColor: theme.border, width: 7 },
              ]}
            />
          ))}
        </View>

        {/* CTA button */}
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          {page < 2 ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.accent }]}
              onPress={goNext}
              activeOpacity={0.88}
            >
              <Text style={[styles.btnText, { color: theme.accentFg }]}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.accent }]}
              onPress={handleGetStarted}
              activeOpacity={0.88}
            >
              <Text style={[styles.btnText, { color: theme.accentFg }]}>Get Started →</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },

  slide: {
    width: SW,
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },

  // Slide 1
  s1Center: { alignItems: 'center', gap: 12 },
  logo: { width: 96, height: 96, borderRadius: 24 },
  appName: { fontSize: 58, fontWeight: '900', letterSpacing: 2, marginTop: 8 },
  tagline: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  sub: { fontSize: 15, fontWeight: '500', textAlign: 'center', letterSpacing: 1 },

  // Slide 2
  slideTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6, textAlign: 'center' },
  slideSub: { fontSize: 14, textAlign: 'center', marginBottom: 28 },
  featureList: { gap: 12 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 16, borderWidth: 1, padding: 16,
  },
  featureEmoji: { fontSize: 28 },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 16, fontWeight: '700' },
  featureDesc: { fontSize: 13, lineHeight: 18 },

  // Slide 3
  s3Center: { alignItems: 'center', gap: 16 },
  lockEmoji: { fontSize: 56, marginBottom: 4 },
  privacyLine: { fontSize: 17, lineHeight: 26, textAlign: 'center', fontWeight: '500' },
  downloadNote: {
    borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 8,
  },
  downloadNoteText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { height: 7, borderRadius: 4 },
  btn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  btnText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
});
