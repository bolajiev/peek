import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, useColorScheme,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { ThemeMode } from '../types';
import { getTheme } from '../theme';
import { getThemeOverride, setThemeOverride } from '../utils/storage';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ChatScreen from '../screens/ChatScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';
import VoiceScreen from '../screens/VoiceScreen';
import DeepScreen from '../screens/DeepScreen';
import ResultScreen from '../screens/ResultScreen';
import ModelsScreen from '../screens/ModelsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import Sidebar from '../components/Sidebar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const { width: SW } = Dimensions.get('window');
const SIDEBAR_W = SW * 0.78;

type ThemeCtx = { mode: ThemeMode; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ mode: 'dark', toggle: () => {} });
export const useTheme = () => useContext(ThemeContext).mode;
export const useThemeToggle = () => useContext(ThemeContext).toggle;

type SidebarCtx = { open: () => void; close: () => void };
const SidebarContext = createContext<SidebarCtx>({ open: () => {}, close: () => {} });
export const useSidebar = () => useContext(SidebarContext);

function PeekTabBar({ state, navigation }: any) {
  const theme = getTheme(useTheme());
  const scanScale = useRef(new Animated.Value(1)).current;

  const handleScan = () => {
    Animated.sequence([
      Animated.timing(scanScale, { toValue: 0.86, duration: 70, useNativeDriver: true }),
      Animated.spring(scanScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 200 }),
    ]).start();
    navigation.navigate('Scan');
  };

  const activeTab = state.routes[state.index]?.name;

  const Tab = ({ name, label, children }: { name: string; label: string; children: (active: boolean) => React.ReactNode }) => {
    const active = activeTab === name;
    return (
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate(name)} activeOpacity={0.7}>
        <View style={[styles.tabIcon, active && { backgroundColor: theme.accent + '22' }]}>
          {children(active)}
        </View>
        <Text style={[styles.tabLabel, { color: active ? theme.accent : theme.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.tabBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
      <Tab name="Chat" label="Chat">
        {(active) => (
          <View style={[styles.chatIcon, { borderColor: active ? theme.accent : theme.textSecondary }]}>
            <View style={[styles.chatDot, { backgroundColor: active ? theme.accent : theme.textSecondary }]} />
          </View>
        )}
      </Tab>

      <Tab name="Voice" label="Voice">
        {(active) => (
          <View style={[styles.micIconSmall, { borderColor: active ? theme.accent : theme.textSecondary }]}>
            <View style={[styles.micDot, { backgroundColor: active ? theme.accent : theme.textSecondary }]} />
          </View>
        )}
      </Tab>

      <View style={styles.fabWrap}>
        <Animated.View style={{ transform: [{ scale: scanScale }] }}>
          <TouchableOpacity style={[styles.fab, { backgroundColor: theme.accent }]} onPress={handleScan} activeOpacity={0.85}>
            <View style={styles.fabLensOuter}>
              <View style={styles.fabLensInner} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Tab name="Deep" label="Deep">
        {(active) => (
          <View style={styles.deepLines}>
            {[10, 16, 10].map((w, i) => (
              <View key={i} style={[styles.deepLine, { backgroundColor: active ? theme.accent : theme.textSecondary, width: w }]} />
            ))}
          </View>
        )}
      </Tab>

      <Tab name="History" label="History">
        {(active) => (
          <View style={styles.historyLines}>
            {[12, 18, 10].map((w, i) => (
              <View key={i} style={[styles.historyLine, { backgroundColor: active ? theme.accent : theme.textSecondary, width: w }]} />
            ))}
          </View>
        )}
      </Tab>
    </View>
  );
}

function MainScreen() {
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const navigation = useNavigation<any>();
  const translateX = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const open = useCallback(() => {
    setSidebarVisible(true);
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: -SIDEBAR_W, useNativeDriver: true, friction: 10, tension: 80 }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setSidebarVisible(false));
  }, []);

  const handleNavigate = useCallback((screen: string) => {
    close();
    setTimeout(() => navigation.navigate(screen), 250);
  }, [close, navigation]);

  return (
    <SidebarContext.Provider value={{ open, close }}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <PeekTabBar {...props} />}>
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Voice" component={VoiceScreen} />
          <Tab.Screen name="Scan" component={ScanScreen} />
          <Tab.Screen name="Deep" component={DeepScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
        </Tab.Navigator>

        {sidebarVisible && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, zIndex: 10 }]} pointerEvents="box-none">
            <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={close} activeOpacity={1} />
          </Animated.View>
        )}

        <Animated.View style={[styles.sidebar, { width: SIDEBAR_W, transform: [{ translateX }], zIndex: 11, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 4, height: 0 }, elevation: 20 }]}>
          <Sidebar onClose={close} onNavigate={handleNavigate} />
        </Animated.View>
      </View>
    </SidebarContext.Provider>
  );
}

export default function AppNavigator() {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    getThemeOverride().then((override) => {
      if (override) setThemeMode(override);
      else setThemeMode(systemScheme === 'light' ? 'light' : 'dark');
    });
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    setThemeOverride(next);
  }, [themeMode]);

  const theme = getTheme(themeMode);

  return (
    <ThemeContext.Provider value={{ mode: themeMode, toggle }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Main" component={MainScreen} />
          <Stack.Screen name="Result" component={ResultScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="Models" component={ModelsScreen} options={{ headerShown: true, title: 'Models', animation: 'slide_from_right', headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerShadowVisible: false, headerBackTitle: '' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Settings', animation: 'slide_from_right', headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerShadowVisible: false, headerBackTitle: '' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 28, paddingTop: 10, paddingHorizontal: 24, borderTopWidth: 1 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabIcon: { width: 44, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  chatIcon: { width: 20, height: 16, borderRadius: 5, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  chatDot: { width: 4, height: 4, borderRadius: 2 },
  historyLines: { gap: 3, alignItems: 'flex-start' },
  historyLine: { height: 2, borderRadius: 1 },
  micIconSmall: { width: 14, height: 18, borderRadius: 7, borderWidth: 1.5, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 2 },
  micDot: { width: 4, height: 4, borderRadius: 2 },
  deepLines: { gap: 3, alignItems: 'center' },
  deepLine: { height: 2, borderRadius: 1 },
  fabWrap: { flex: 1, alignItems: 'center', marginTop: -24 },
  fab: { width: 62, height: 62, borderRadius: 31, justifyContent: 'center', alignItems: 'center', shadowColor: '#FFC200', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabLensOuter: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fabLensInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#000' },
  sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
