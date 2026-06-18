import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform,
  Image, Keyboard,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { llmManager } from '../utils/modelManager';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import {
  syncModelsFromDisk, getSettings, getDefaultModelId,
  getConversations, saveConversation, getMessages,
  appendMessage, updateLastMessage, createConversationId, toPath,
} from '../utils/storage';
import { SYSTEM_PROMPTS, MODEL_KEYS } from '../utils/models';
import { DownloadedModel, Conversation, ChatMessage } from '../types';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePath?: string;
  streaming?: boolean;
}

const SYSTEM_CHAT = SYSTEM_PROMPTS.chat;
const SYSTEM_DOC = SYSTEM_PROMPTS.scribe;

const MODULE_ID = 'scribe';

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const resumeConvId: string | undefined = route.params?.conversationId;
  const mode: 'chat' | 'document' = route.params?.mode ?? 'chat';
  const seedQuery: string | undefined = route.params?.seedQuery;
  const seedAnswer: string | undefined = route.params?.seedAnswer;
  const seedImage: string | undefined = route.params?.seedImage;
  const SYSTEM_PROMPT = mode === 'document' ? SYSTEM_DOC : SYSTEM_CHAT;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelLoading, setModelLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [noModel, setNoModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const currentRunRef = useRef<any>(null);
  const modelIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string>(resumeConvId ?? createConversationId());

  useEffect(() => {
    loadOnMount();
    if (resumeConvId) {
      rehydrateConversation(resumeConvId);
    } else if (seedQuery || seedAnswer) {
      // Seed from a scan result — pre-populate with Q+A so user can ask follow-ups
      const seeded: Message[] = [];
      if (seedQuery) seeded.push({ id: 'seed-q', role: 'user', text: seedQuery, imagePath: seedImage });
      if (seedAnswer) seeded.push({ id: 'seed-a', role: 'assistant', text: seedAnswer });
      setMessages(seeded);
    }
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => {
      sub.remove();
      if (currentRunRef.current) {
        void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      }
    };
  }, []);

  const rehydrateConversation = async (convId: string) => {
    const stored = await getMessages(convId);
    if (stored.length > 0) {
      setMessages(stored.map(m => ({ id: m.id, role: m.role, text: m.content, imagePath: m.imagePath })));
    }
  };

  const loadOnMount = async () => {
    setModelLoading(true);
    setLoadProgress(0);
    try {
      const synced = await syncModelsFromDisk();
      const defaultId = await getDefaultModelId();
      const preferredId = preselectedModelId ?? defaultId ?? MODEL_KEYS.TEXT_FAST;
      const model = synced.find(m => m.id === preferredId)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_FAST)
        ?? synced.find(m => m.modelType === 'text')
        ?? synced[0];
      if (!model) { setNoModel(true); setModelLoading(false); return; }
      setModelName(model.name);
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 4096, device };
      if (model.projectionModelSrc) modelConfig.projectionModelSrc = toPath(model.projectionModelSrc);
      const mid = await llmManager.ensure(model, modelConfig, setLoadProgress);
      modelIdRef.current = mid;
    } catch (err: any) {
      const raw = err?.message || err?.toString() || 'Unknown error';
      setLoadError(raw.replace(/file:\/\/[^\s,]*/g, '[model]'));
      setNoModel(true);
    } finally {
      setModelLoading(false);
    }
  };

  const persistMessage = async (msg: Message) => {
    const convId = convIdRef.current;
    const cm: ChatMessage = {
      id: msg.id,
      conversationId: convId,
      role: msg.role,
      content: msg.text,
      imagePath: msg.imagePath,
      createdAt: new Date().toISOString(),
    };
    await appendMessage(cm);
    const conv: Conversation = {
      id: convId,
      moduleId: MODULE_ID,
      title: msg.role === 'user' && msg.text ? msg.text.slice(0, 60) : 'Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveConversation(conv);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;
    setInput('');
    const imgPath = attachedImage;
    setAttachedImage(null);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, imagePath: imgPath ?? undefined };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    persistMessage(userMsg);
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    const mid = modelIdRef.current;
    if (!mid) {
      setIsTyping(false);
      return;
    }

    const history: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...allMsgs.slice(-20).map(m => ({
        role: m.role,
        content: m.text,
        ...(m.imagePath ? { attachments: [{ path: m.imagePath }] } : {}),
      })),
    ];

    const placeholderId = 'ai-' + Date.now();
    setMessages(prev => [...prev, { id: placeholderId, role: 'assistant', text: '', streaming: true }]);

    try {
      const run = completion({ modelId: mid, history, stream: true });
      currentRunRef.current = run;
      let streamed = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          streamed += event.text;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: streamed } : m));
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }
      await run.final;
      currentRunRef.current = null;
      setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, streaming: false } : m));
      const aiMsg: Message = { id: placeholderId, role: 'assistant', text: streamed };
      persistMessage(aiMsg);
      await updateLastMessage(convIdRef.current, streamed);
    } catch (err) {
      currentRunRef.current = null;
      if (!(err instanceof InferenceCancelledError)) {
        setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: 'Something went wrong. Try again.', streaming: false } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, streaming: false } : m));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleStop = () => {
    if (currentRunRef.current) {
      void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      currentRunRef.current = null;
    }
  };

  const handleAttach = async () => {
    if (mode === 'document') {
      // Document mode: pick a text file and send its content as a message
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'application/json', 'text/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      try {
        const content = await new File(asset.uri).text();
        if (content && content.trim().length > 0) {
          const truncated = content.slice(0, 12000);
          setInput(prev =>
            prev
              ? prev + `\n\n[Document: ${asset.name}]\n${truncated}`
              : `[Document: ${asset.name}]\n${truncated}`
          );
        }
      } catch {
        setInput(prev => prev + `\n\n[Could not read ${asset.name}]`);
      }
    } else {
      // Chat mode: attach an image
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setAttachedImage(result.assets[0].uri);
      }
    }
  };

  const handleNewConversation = () => {
    convIdRef.current = createConversationId();
    setMessages([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.menuBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.backBtn, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{mode === 'document' ? 'Document' : 'Scribe'}</Text>
          <Text style={[styles.headerSub, { color: modelLoading ? theme.accent : theme.textSecondary }]} numberOfLines={1}>
            {modelLoading ? `Loading${loadProgress > 0 ? ` ${Math.round(loadProgress)}%` : '...'}` : modelName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={handleNewConversation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearText, { color: theme.textSecondary }]}>New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {modelLoading && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${loadProgress || 8}%` }]} />
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {noModel ? (
          <NoModelState theme={theme} error={loadError}
            onGoModels={() => navigation.navigate('Download', { modelId: 'text-fast', returnTo: 'Scribe', returnParams: {} })}
            onRetry={() => { setNoModel(false); setLoadError(null); loadOnMount(); }} />
        ) : messages.length === 0 ? (
          <EmptyState theme={theme} mode={mode} />
        ) : (
          <ScrollView ref={scrollRef} style={styles.msgList} contentContainerStyle={styles.msgListContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} theme={theme} />)}
            {isTyping && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator theme={theme} />}
            <View style={{ height: 8 }} />
          </ScrollView>
        )}

        {!noModel && (
          <>
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
                <Text style={[styles.attachIcon, { color: theme.textSecondary }]}>{mode === 'document' ? '📄' : '+'}</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder={modelLoading ? 'Loading model...' : 'Ask anything...'}
                placeholderTextColor={theme.textSecondary}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                returnKeyType="default"
                editable={!modelLoading && !isTyping}
              />
              {isTyping ? (
                <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.error }]} onPress={handleStop}>
                  <View style={[styles.stopSquare, { backgroundColor: '#fff' }]} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: (input.trim() || attachedImage) && !modelLoading ? theme.accent : theme.border }]}
                  onPress={handleSend}
                  disabled={(!input.trim() && !attachedImage) || modelLoading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sendIcon, { color: (input.trim() || attachedImage) ? theme.accentFg : theme.textSecondary }]}>↑</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageBubble({ msg, theme }: { msg: Message; theme: any }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser ? (
        <View style={styles.aiBubbleWrap}>
          <View style={[styles.aiBubble, { backgroundColor: theme.card }]}>
            {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={styles.bubbleImage} />}
            {msg.streaming ? (
              <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}▍</Text>
            ) : (
              <MarkdownText color={theme.text} fontSize={15} lineHeight={22}>
                {msg.text}
              </MarkdownText>
            )}
          </View>
          {!msg.streaming && msg.text ? (
            <View style={styles.bubbleActions}>
              <CopyButton text={msg.text} color={theme.textSecondary} size={11} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.userBubble, { backgroundColor: theme.accent }]}>
          {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={styles.bubbleImage} />}
          {msg.text ? <Text selectable style={[styles.bubbleText, { color: theme.accentFg }]}>{msg.text}</Text> : null}
        </View>
      )}
    </View>
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

function EmptyState({ theme, mode }: { theme: any; mode: string }) {
  const chips = mode === 'document'
    ? ['Draft a paragraph', 'Improve this text', 'Continue my story', 'Write a summary']
    : ['Explain quantum computing', 'Write a cover letter', 'Summarize this idea', 'Help me brainstorm'];
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{mode === 'document' ? 'Start Writing' : 'Ask me anything'}</Text>
      <Text style={[styles.emptySub, { color: theme.textSecondary }]}>{mode === 'document' ? 'Describe what you want to write.' : 'Type a question or attach an image.'}</Text>
      <View style={styles.chipsRow}>
        {chips.map(c => (
          <View key={c} style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.chipText, { color: theme.textSecondary }]}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NoModelState({ theme, error, onGoModels, onRetry }: any) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{error ? 'Load Failed' : 'No text model yet'}</Text>
      <Text selectable style={[styles.emptySub, { color: error ? theme.error : theme.textSecondary }]}>
        {error ?? 'Download a text model (Qwen3-1.7B Chat or similar) to start chatting.'}
      </Text>
      {error && (
        <TouchableOpacity style={[styles.goModelBtn, { backgroundColor: theme.accent }]} onPress={onRetry}>
          <Text style={[styles.goModelText, { color: theme.accentFg }]}>Retry</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.goModelBtn, { backgroundColor: error ? theme.card : theme.accent, borderWidth: error ? 1 : 0, borderColor: theme.border }]} onPress={onGoModels}>
        <Text style={[styles.goModelText, { color: error ? theme.text : theme.accentFg }]}>Get Text Model</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardFlex: { flex: 1 },
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  menuBtn: { padding: 4, justifyContent: 'center' },
  backBtn: { fontSize: 24, fontWeight: '300' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerRight: { width: 60, alignItems: 'flex-end' },
  clearText: { fontSize: 13, fontWeight: '600' },
  msgList: { flex: 1 },
  msgListContent: { padding: 16, gap: 10, paddingBottom: 24 },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  aiBubbleWrap: { maxWidth: '84%', gap: 4 },
  aiBubble: { borderRadius: 18, borderTopLeftRadius: 4, padding: 14, gap: 6 },
  bubbleActions: { flexDirection: 'row', paddingHorizontal: 4 },
  userBubble: { maxWidth: '84%', borderRadius: 18, borderTopRightRadius: 4, padding: 14 },
  bubbleImage: { width: 180, height: 120, borderRadius: 10 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 14, borderRadius: 18, borderTopLeftRadius: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 12 },
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
  stopSquare: { width: 14, height: 14, borderRadius: 2 },
});
