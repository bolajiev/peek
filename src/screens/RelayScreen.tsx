import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';

export default function RelayScreen() {
  const navigation = useNavigation<any>();
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
          <Text style={[styles.back, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Relay</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: theme.cardAlt }]}>
          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: theme.textSecondary }} />
              <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '700' }}>›</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '700' }}>‹</Text>
              <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: theme.textSecondary }} />
            </View>
          </View>
        </View>
        <Text style={[styles.comingSoon, { color: theme.text }]}>Coming Soon</Text>
        <Text style={[styles.desc, { color: theme.textSecondary }]}>
          Peek Relay will let you offload AI tasks to a nearby device over a local network — no cloud required.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  back: { fontSize: 24, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 18 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  comingSoon: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  desc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
