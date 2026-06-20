import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { IconScribe, IconBack } from '../components/Icons';
import { getConversations } from '../utils/storage';
import { Conversation } from '../types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ScribeHubScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const modelId: string | undefined = route.params?.modelId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  useFocusEffect(useCallback(() => {
    getConversations('scribe').then(list => setConversations(list.slice(0, 10))).catch(() => setConversations([]));
  }, []));

  const newChat = () => navigation.navigate('ScribeChat', { modelId, mode: 'chat' });

  const openConversation = (conv: Conversation) =>
    navigation.navigate('ScribeChat', { modelId, mode: 'chat', conversationId: conv.id });

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
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
          <View style={[styles.heroIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <IconScribe size={26} color={theme.text} strokeWidth={1.6} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Peek Scribe</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Draft, edit, and chat — no cloud needed.</Text>
        </View>

        {/* Primary action — New Chat */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          onPress={newChat}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryBtnText, { color: theme.accentFg }]}>New Chat</Text>
        </TouchableOpacity>

        {/* Recent chats */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Recent Chats</Text>

        {conversations.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Your recent chats will appear here</Text>
          </View>
        ) : (
          conversations.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={[styles.convItem, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => openConversation(conv)}
              activeOpacity={0.72}
            >
              <View style={[styles.convDot, { backgroundColor: theme.accent }]} />
              <View style={styles.convBody}>
                <Text style={[styles.convTitle, { color: theme.text }]} numberOfLines={1}>{conv.title || 'Chat'}</Text>
                <Text style={[styles.convMeta, { color: theme.textSecondary }]}>{timeAgo(conv.updatedAt || conv.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  hero: { alignItems: 'flex-start', gap: 6, marginBottom: 24 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 14 },
  primaryBtn: {
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginBottom: 28,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.1,
    textTransform: 'uppercase', marginBottom: 12,
  },
  emptyBox: {
    borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center',
  },
  emptyText: { fontSize: 13 },
  convItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10,
  },
  convDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  convBody: { flex: 1, gap: 4 },
  convTitle: { fontSize: 14, fontWeight: '600' },
  convMeta: { fontSize: 12 },
});
