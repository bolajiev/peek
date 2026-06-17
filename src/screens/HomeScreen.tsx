import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
  Dimensions, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useSidebar } from '../navigation/AppNavigator';

const { width: SW } = Dimensions.get('window');
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_W = (SW - H_PAD * 2 - CARD_GAP) / 2;

interface Module {
  id: string;
  screen: string;
  label: string;
  title: string;
  subtitle: string;
  icon: (color: string) => React.ReactNode;
  disabled?: boolean;
}

const MODULES: Module[] = [
  {
    id: 'Lens',
    screen: 'Lens',
    label: '1 Model',
    title: 'Peek Lens',
    subtitle: 'Analyze images with your camera',
    icon: (c) => <LensIcon color={c} />,
  },
  {
    id: 'Voice',
    screen: 'Voice',
    label: '2 Models',
    title: 'Peek Voice',
    subtitle: 'Transcribe and summarize audio',
    icon: (c) => <VoiceIcon color={c} />,
  },
  {
    id: 'Scribe',
    screen: 'Scribe',
    label: '1 Model',
    title: 'Peek Scribe',
    subtitle: 'Write and edit with on-device AI',
    icon: (c) => <ScribeIcon color={c} />,
  },
  {
    id: 'Deep',
    screen: 'Deep',
    label: '2 Models',
    title: 'Peek Deep',
    subtitle: 'Research any topic privately',
    icon: (c) => <DeepIcon color={c} />,
  },
  {
    id: 'Relay',
    screen: 'Relay',
    label: 'Coming Soon',
    title: 'Peek Relay',
    subtitle: 'Offload tasks to a nearby device',
    icon: (c) => <RelayIcon color={c} />,
    disabled: true,
  },
];

const ROWS: Module[][] = [
  [MODULES[0], MODULES[1]],
  [MODULES[2], MODULES[3]],
  [MODULES[4]],
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const { open: openSidebar } = useSidebar();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openSidebar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.menuBtn}>
          <View style={{ gap: 4.5 }}>
            {[22, 16, 22].map((w, i) => (
              <View key={i} style={[styles.menuLine, { backgroundColor: theme.text, width: w }]} />
            ))}
          </View>
        </TouchableOpacity>

        <View style={styles.logoWrap}>
          <Image source={require('../../peeklogo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.logoText, { color: theme.accent }]}>Peek</Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      {/* Card grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.greeting, { color: theme.textSecondary }]}>What do you want to do?</Text>

        {ROWS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((mod) => (
              <TouchableOpacity
                key={mod.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border, width: CARD_W },
                  mod.disabled && styles.cardDisabled,
                ]}
                onPress={() => !mod.disabled && navigation.navigate(mod.screen)}
                activeOpacity={mod.disabled ? 1 : 0.72}
              >
                <View style={[styles.iconCircle, { backgroundColor: theme.cardAlt }]}>
                  {mod.icon(mod.disabled ? theme.textSecondary : theme.text)}
                </View>
                <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
                  {mod.label}
                </Text>
                <Text style={[styles.cardTitle, { color: mod.disabled ? theme.textSecondary : theme.text }]}>
                  {mod.title}
                </Text>
                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
                  {mod.subtitle}
                </Text>
                {!mod.disabled && (
                  <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </Animated.View>
  );
}

// ---- Icons (pure View, no icon library) ----

function LensIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: color, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

function VoiceIcon({ color }: { color: string }) {
  const bars = [6, 12, 18, 12, 6];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 }}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function ScribeIcon({ color }: { color: string }) {
  return (
    <View style={{ gap: 5 }}>
      {[20, 14, 20].map((w, i) => (
        <View key={i} style={{ width: w, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
      ))}
    </View>
  );
}

function DeepIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 26, height: 26 }}>
      <View style={{
        width: 17, height: 17, borderRadius: 8.5,
        borderWidth: 2.5, borderColor: color,
        position: 'absolute', top: 0, left: 0,
      }} />
      <View style={{
        width: 2.5, height: 10, borderRadius: 1.5,
        backgroundColor: color,
        position: 'absolute', bottom: 0, right: 1,
        transform: [{ rotate: '-45deg' }],
      }} />
    </View>
  );
}

function RelayIcon({ color }: { color: string }) {
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <View style={{ width: 16, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
        <Text style={{ color, fontSize: 14, fontWeight: '700', lineHeight: 14, marginTop: -1 }}>›</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={{ color, fontSize: 14, fontWeight: '700', lineHeight: 14, marginTop: -1 }}>‹</Text>
        <View style={{ width: 16, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 58,
    paddingHorizontal: H_PAD,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  menuBtn: { width: 44, height: 44, justifyContent: 'center' },
  menuLine: { height: 2, borderRadius: 1 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 28, height: 28 },
  logoText: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 24 },
  greeting: { fontSize: 14, fontWeight: '500', marginBottom: 20, letterSpacing: 0.2 },
  row: { flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    overflow: 'hidden',
    minHeight: 166,
  },
  cardDisabled: { opacity: 0.45 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  cardSubtitle: { fontSize: 12, lineHeight: 17 },
  accentBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5 },
});
