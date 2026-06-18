import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { initModelsDirectory, syncModelsFromDisk, hasOnboarded } from '../utils/storage';

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

      navigation.replace('Main');
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.Image
        source={require('../../peeklogo.png')}
        style={[styles.logo, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
  },
});
