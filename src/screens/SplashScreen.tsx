import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { isModelDownloaded, initModelsDirectory, syncModelsFromDisk, hasOnboarded } from '../utils/storage';
import { PeekLogo } from '../components/PeekLogo';

export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const theme = getTheme(useTheme());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(async () => {
      await initModelsDirectory();
      await syncModelsFromDisk();

      const onboarded = await hasOnboarded();
      if (!onboarded) {
        navigation.replace('Onboarding');
        return;
      }

      const hasModel = await isModelDownloaded();
      navigation.replace('MainTabs', { screen: hasModel ? 'Home' : 'Models' });
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View
        style={[
          styles.inner,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <PeekLogo size={100} color={theme.accent} pulse />
        <Text style={[styles.title, { color: theme.accent }]}>Peek</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          AI-Powered Camera
        </Text>
      </Animated.View>

      <Animated.Text style={[styles.footer, { color: theme.textSecondary, opacity: fadeAnim }]}>
        Powered by qvac · On-Device AI
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    alignItems: 'center',
  },
  title: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
    fontWeight: '500',
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
