import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { loadModel, unloadModel, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme, useSidebar } from '../navigation/AppNavigator';
import { getDownloadedModels, getDefaultModelId, getSettings } from '../utils/storage';
import { ragQuery, buildRagContext } from '../utils/ragService';
import { DownloadedModel } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePath?: string;
  ragUsed?: boolean;
  streaming?: boolean;
}

const SYSTEM_PROMPT = `You are Peek, a private personal AI assistant. You run entirely on the user's device — no internet, no cloud. Help the user with any question they have. Be concise, accurate, and friendly. If you have context from the user's personal knowledge base, use it naturally.`;

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const { open: openSidebar } = useSidebar();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelLoading, setModelLoading] = useState(false);
  const [noModel, setNoModel] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const currentRunRef = useRef<any>(null);
  const modelIdRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    checkModel();
    return () => {};
  }, []));

  useEffect(() => {
    return () => {
      if (currentRunRef.current) {
        void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      }
      if (modelIdRef.current) {
        void unloadModel({ modelId: modelIdRef.current }).catch(() => {});
        modelIdRef.current = null;
      }
    };
  }, []);

  const checkModel = async () => {
    const models = await getDownloadedModels();
    if (models.length === 0) { setNoModel(true); return; }
    setNoModel(false);
    const defaultId = await getDefaultModelId();
    const model = (defaultId ? models.find((m) => m.id === defaultId) : null) ?? models[0];
    setModelName(model.name);
  };

  const ensureModelLoaded = async (): Promise<string | null> => {
    if (modelIdRef.current) return modelIdRef.current;
    setModelLoading(true);
    try {
      const models = await getDownloadedModels();
      if (models.length === 0) return null;
      const defaultId = await getDefaultModelId();
      const model = (defaultId ? models.find((m) => m.id === defaultId) : null) ?? models[0];
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 4096, device };
      if (model.projectionModelSrc) modelConfig.projectionModelSrc = model.projectionModelSrc;
      const mid = await loadModel({ modelSrc: model.modelSrc, modelType: 'llm', modelConfig });
      modelIdRef.current = mid;
      setLoadedModelId(mid);
      return mid;
    } catch { return null; }
    finally { setModelLoading(false); }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;
    setInput('');
    const imgPath = attachedImage;
    setAttachedImage(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      imagePath: imgPath ?? undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const mid = await ensureModelLoaded();
    if (!mid) {
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: 'err-' + Date.now(), role: 'assistant', text: 'No model loaded. Download one from the sidebar.' }]);
      return;
    }

    // RAG search
    let ragContext = '';
    let ragUsed = false;
    if (text) {
      try {
        const docs = await ragQuery(mid, text, 3);
        if (docs.length > 0) { ragContext = buildRagContext(docs); ragUsed = true; }
      } catch {}
    }

    const history: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + ragContext },
      ...messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.text,
        ...(m.imagePath ? { attachments: [{ path: m.imagePath }] } : {}),
      })),
      {
        role: 'user',
        content: text || 'Analyze this image.',
        ...(imgPath ? { attachments: [{ path: imgPath }] } : {}),
      },
    ];

    const placeholderId = 'ai-' + Date.now();
    setMessages((prev) => [...prev, { id: placeholderId, role: 'assistant', text: '', ragUsed, streaming: true }]);

    try {
      const run = completion({ modelId: mid, history, stream: true });
      currentRunRef.current = run;
      let streamed = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          streamed += event.text;
          setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, text: streamed } : m));
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }
      await run.final;
      currentRunRef.current = null;
      setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, streaming: false } : m));
    } catch (err) {
      currentRunRef.current = null;
      if (!(err instanceof InferenceCancelledError)) {
        setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, text: 'Something went wrong. Try again.', streaming: false } : m));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleAttach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAttachedImage(result.assets[0].uri);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openSidebar} style={styles.menuBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={styles.menuLines}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.menuLine, { backgroundColor: theme.text, width: i === 1 ? 18 : 22 }]} />
            ))}
          </View>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Peek</Text>
          {modelLoading && <Text style={[styles.headerSub, { color: theme.accent }]}>Loading model...</Text>}
          {!modelLoading && modelName && <Text style={[styles.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>{modelName}</Text>}
        </View>

        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={() => setMessages([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearText, { color: theme.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {noModel ? (
        <NoModelState theme={theme} onGoModels={() => navigation.navigate('Models')} />
      ) : messages.length === 0 ? (
        <EmptyState theme={theme} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.msgList}
          contentContainerStyle={styles.msgListContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} theme={theme} />)}
          {isTyping && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator theme={theme} />}
        </ScrollView>
      )}

      {/* Input bar */}
      {!noModel && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {attachedImage && (
            <View style={[styles.attachPreviewBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
              <Image source={{ uri: attachedImage }} style={styles.attachThumb} />
              <Text style={[styles.attachLabel, { color: theme.textSecondary }]}>Image attached</Text>
              <TouchableOpacity onPress={() => setAttachedImage(null)}>
                <Text style={[styles.attachRemove, { color: theme.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttach} activeOpacity={0.7}>
              <Text style={[styles.attachIcon, { color: theme.textSecondary }]}>+</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Ask anything..."
              placeholderTextColor={theme.textSecondary}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: (input.trim() || attachedImage) ? theme.accent : theme.border }]}
              onPress={handleSend}
              disabled={(!input.trim() && !attachedImage) || isTyping}
              activeOpacity={0.8}
            >
              <Text style={[styles.sendIcon, { color: (input.trim() || attachedImage) ? theme.accentFg : theme.textSecondary }]}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function MessageBubble({ msg, theme }: { msg: Message; theme: any }) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 9, tension: 120 }),
    ]).start();
  }, []);

  const isUser = msg.role === 'user';

  return (
    <Animated.View style={[styles.bubbleRow, isUser && styles.bubbleRowUser, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {!isUser && (
        <View style={[styles.aiBubble, { backgroundColor: theme.card }]}>
          {msg.ragUsed && (
            <View style={[styles.ragBadge, { backgroundColor: theme.accent + '22' }]}>
              <View style={[styles.ragDot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.ragText, { color: theme.accent }]}>From memory</Text>
            </View>
          )}
          {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={styles.bubbleImage} />}
          <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}{msg.streaming ? '▍' : ''}</Text>
        </View>
      )}
      {isUser && (
        <View style={[styles.userBubble, { backgroundColor: theme.accent }]}>
          {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={styles.bubbleImage} />}
          {msg.text ? <Text style={[styles.bubbleText, { color: theme.accentFg }]}>{msg.text}</Text> : null}
        </View>
      )}
    </Animated.View>
  );
}

function TypingIndicator({ theme }: any) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 140),
        Animated.timing(dot, { toValue: -7, duration: 280, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.delay(500),
      ])).start();
    });
  }, []);
  return (
    <View style={styles.bubbleRow}>
      <View style={[styles.typingBubble, { backgroundColor: theme.card }]}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { backgroundColor: theme.textSecondary, transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

function EmptyState({ theme }: any) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 1600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
    ])).start();
  }, []);

  const chips = ['What is this?', 'Summarize this text', 'What are the calories?', 'Explain this to me'];

  return (
    <View style={styles.emptyState}>
      <Animated.Image source={require('../../peeklogo.png')} style={[styles.emptyLogo, { transform: [{ scale: pulse }] }]} resizeMode="contain" />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Ask me anything</Text>
      <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Type a question or attach an image.</Text>
      <View style={styles.chipsRow}>
        {chips.map((c) => (
          <View key={c} style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.chipText, { color: theme.textSecondary }]}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NoModelState({ theme, onGoModels }: any) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No model yet</Text>
      <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Download an AI model to start chatting.</Text>
      <TouchableOpacity style={[styles.goModelBtn, { backgroundColor: theme.accent }]} onPress={onGoModels}>
        <Text style={[styles.goModelText, { color: theme.accentFg }]}>Download Model</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  menuBtn: { padding: 4 },
  menuLines: { gap: 4 },
  menuLine: { height: 2, borderRadius: 1 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerRight: { width: 60, alignItems: 'flex-end' },
  clearText: { fontSize: 13, fontWeight: '600' },
  msgList: { flex: 1 },
  msgListContent: { padding: 16, gap: 12, paddingBottom: 24 },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  aiBubble: { maxWidth: '82%', borderRadius: 18, borderTopLeftRadius: 4, padding: 14, gap: 8 },
  userBubble: { maxWidth: '82%', borderRadius: 18, borderTopRightRadius: 4, padding: 14, gap: 8 },
  ragBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  ragDot: { width: 5, height: 5, borderRadius: 2.5 },
  ragText: { fontSize: 11, fontWeight: '700' },
  bubbleImage: { width: 180, height: 120, borderRadius: 10 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 14, borderRadius: 18, borderTopLeftRadius: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 12 },
  emptyLogo: { width: 90, height: 90, borderRadius: 22, marginBottom: 8 },
  emptyTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  goModelBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  goModelText: { fontSize: 15, fontWeight: '800' },
  attachPreviewBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderTopWidth: 1 },
  attachThumb: { width: 40, height: 40, borderRadius: 8 },
  attachLabel: { flex: 1, fontSize: 13 },
  attachRemove: { fontSize: 16, padding: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 32, gap: 8, borderTopWidth: 1 },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 24, fontWeight: '300', lineHeight: 28 },
  textInput: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  sendIcon: { fontSize: 18, fontWeight: '700' },
});
