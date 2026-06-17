import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { IconScribe, IconChat, IconBack } from '../components/Icons';

export default function ScribeHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const modelId: string | undefined = route.params?.modelId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
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

      <View style={[styles.hero, { borderBottomColor: theme.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
          <IconScribe size={26} color={theme.text} strokeWidth={1.6} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Peek Scribe</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Draft, edit, and chat — no cloud needed.</Text>
      </View>

      <View style={styles.body}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => navigation.navigate('ScribeChat', { modelId, mode: 'document' })}
          activeOpacity={0.72}
        >
          <View style={[styles.actionIcon, { backgroundColor: theme.cardAlt }]}>
            <IconScribe size={18} color={theme.text} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: theme.text }]}>New Document</Text>
            <Text style={[styles.actionSub, { color: theme.textSecondary }]}>Start writing with AI assistance</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => navigation.navigate('ScribeChat', { modelId, mode: 'chat' })}
          activeOpacity={0.72}
        >
          <View style={[styles.actionIcon, { backgroundColor: theme.cardAlt }]}>
            <IconChat size={18} color={theme.text} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: theme.text }]}>Open Chat</Text>
            <Text style={[styles.actionSub, { color: theme.textSecondary }]}>Ask, refine, brainstorm</Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: theme.accent }]}
        onPress={() => navigation.navigate('ScribeChat', { modelId, mode: 'document' })}
        activeOpacity={0.85}
      >
        <Text style={[styles.ctaText, { color: theme.accentFg }]}>Start Writing</Text>
      </TouchableOpacity>
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
  hero: {
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20,
    borderBottomWidth: 1, gap: 6,
  },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 14 },
  body: { flex: 1, padding: 20, gap: 12 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 14, fontWeight: '600' },
  actionSub: { fontSize: 12 },
  cta: {
    marginHorizontal: 20, marginBottom: 44, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
