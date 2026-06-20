import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Keyboard, AppState, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { llmManager } from '../utils/modelManager';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import {
  syncModelsFromDisk, getSettings, getDefaultModelId, getGenParams,
  getConversations, saveConversation, getMessages,
  appendMessage, createConversationId,
} from '../utils/storage';
import { SYSTEM_PROMPTS, MODEL_KEYS, AVAILABLE_MODELS, stripThink, splitStream } from '../utils/models';
import { DownloadedModel, Conversation, ChatMessage } from '../types';
import { showRunningNotification, showDoneNotification, clearInferenceNotifications } from '../utils/bgNotification';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';
import { setDefaultModelId } from '../utils/storage';
import { IconBack } from '../components/Icons';
import ModelGalleryPicker from '../components/ModelGalleryPicker';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  inThink?: boolean;
  thinking?: string;
  showThinking?: boolean;
}

const SYSTEM_PROMPT = SYSTEM_PROMPTS.chat;
const MODULE_ID = 'aichat';

export default function AIChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const resumeConvId: string | undefined = route.params?.conversationId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();
  const inputPadBot = useRef(new Animated.Value(0)).current;
  const insetBottomRef = useRef(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelLoading, setModelLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [noModel, setNoModel] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [activeStorageModelId, setActiveStorageModelId] = useState<string | null>(null);
  const [attachedDoc, setAttachedDoc] = useState<{ name: string; content: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const currentRunRef = useRef<any>(null);
  const isInferringRef = useRef(false);
  const convIdRef = useRef<string>('');
  const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelIdRef = useRef<string | null>(null);

  insetBottomRef.current = insets.bottom;

  // ── keyboard avoidance ──────────────────────────────────
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(inputPadBot, { toValue: e.endCoordinates.height - insetBottomRef.current, duration: 200, useNativeDriver: false }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(inputPadBot, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── model init ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setModelLoading(true);
      try {
        const synced = await syncModelsFromDisk();
        const textModels = synced.filter(m => m.modelType === 'text');
        setDownloadedModels(textModels);
        if (textModels.length === 0) { setNoModel(true); setModelLoading(false); return; }

        let targetId = preselectedModelId ?? await getDefaultModelId();
        let target = textModels.find(m => m.id === targetId) ?? textModels[0];
        setActiveStorageModelId(target.id);

        const settings = await getSettings();
        const cfg: any = { ctx_size: 4096, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
        const mid = await llmManager.ensure(target, cfg, p => setLoadProgress(p));
        modelIdRef.current = mid;
        setModelName(target.name);
      } catch (e: any) {
        setNoModel(true);
      } finally {
        setModelLoading(false);
      }
    })();
  }, []);

  // ── resume conversation ─────────────────────────────────
  useEffect(() => {
    if (!resumeConvId) { convIdRef.current = createConversationId(); return; }
    convIdRef.current = resumeConvId;
    getMessages(resumeConvId).then(msgs => {
      const hydrated = msgs.map(m => ({
        id: m.id, role: m.role as 'user' | 'assistant', text: m.content,
        thinking: m.thinking, showThinking: false,
      }));
      setMessages(hydrated);
    });
  }, [resumeConvId]);

  // ── save conversation ───────────────────────────────────
  const persistMessage = async (msg: Message) => {
    const convId = convIdRef.current;
    const cm: ChatMessage = {
      id: msg.id, conversationId: convId,
      role: msg.role, content: msg.text,
      thinking: msg.thinking, createdAt: new Date().toISOString(),
    };
    await appendMessage(cm);
    const existing = (await getConversations('aichat')).find(c => c.id === convId);
    if (existing) {
      await saveConversation({ ...existing, updatedAt: new Date().toISOString() });
    } else if (msg.role === 'user') {
      const conv: Conversation = {
        id: convId, moduleId: 'aichat',
        title: msg.text.slice(0, 60) || 'AI Chat',
        modelId: activeStorageModelId ?? '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await saveConversation(conv);
    }
  };

  // ── doc attach ─────────────────────────────────────────
  const handleDocAttach = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri);
      setAttachedDoc({ name: asset.name ?? 'document', content });
    } catch {
      Alert.alert('Could not read file', 'The file could not be opened.');
    }
  };

  // ── send ────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isInferringRef.current || modelLoading || noModel) return;
    const messageText = attachedDoc
      ? `${trimmed}\n\n[Document: ${attachedDoc.name}]\n${attachedDoc.content}`
      : trimmed;
    setAttachedDoc(null);
    isInferringRef.current = true;
    setIsTyping(true);
    setGenElapsed(0);
    setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userId = `u-${Date.now()}`;
    const placeholderId = `a-${Date.now()}`;
    const userMsg: Message = { id: userId, role: 'user', text: messageText };
    setMessages(prev => [...prev, userMsg, { id: placeholderId, role: 'assistant', text: '', streaming: true }]);
    await persistMessage(userMsg);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    genTimerRef.current = setInterval(() => setGenElapsed(s => s + 1), 1000);

    if (AppState.currentState !== 'active') showRunningNotification('AI Chat');

    try {
      const history = messages.slice(-16).map(m => ({ role: m.role, content: m.text }));
      history.push({ role: 'user', content: messageText });

      const mid = modelIdRef.current;
      if (!mid) throw new Error('No model loaded');
      const gp = await getGenParams();
      const run = completion({
        modelId: mid,
        history: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        stream: true,
        captureThinking: false,
        generationParams: {
          predict: fastMode ? 256 : gp.maxTokens,
          temp: fastMode ? 0.7 : gp.temp,
          top_k: fastMode ? 10 : gp.top_k,
          top_p: gp.top_p,
          repeat_penalty: gp.repeat_penalty,
          reasoning_budget: 0 as 0,
        },
      });
      currentRunRef.current = run;
      let streamed = '';
      let thinkingText = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          streamed += event.text;
          const { answer: visible, thinking: thinkLive, inThink } = splitStream(streamed);
          setMessages(prev => prev.map(m => m.id === placeholderId
            ? { ...m, text: visible, thinking: thinkingText || thinkLive, inThink }
            : m));
          scrollRef.current?.scrollToEnd({ animated: false });
        } else if (event.type === 'thinkingDelta') {
          thinkingText += event.text;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, thinking: thinkingText, inThink: true } : m));
        }
      }
      await run.final;
      currentRunRef.current = null;

      const { text: displayText, thinking: thinkFallback } = stripThink(streamed);
      const finalThinking = thinkingText || thinkFallback || undefined;

      setMessages(prev => prev.map(m => m.id === placeholderId
        ? { ...m, text: displayText, streaming: false, thinking: finalThinking }
        : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const aiMsg: Message = { id: placeholderId, role: 'assistant', text: displayText, thinking: finalThinking };
      await persistMessage(aiMsg);
    } catch (err) {
      currentRunRef.current = null;
      if (!(err instanceof InferenceCancelledError)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: 'Something went wrong. Try again.', streaming: false } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, streaming: false } : m));
      }
    } finally {
      isInferringRef.current = false;
      setIsTyping(false);
      setGenElapsed(0);
      if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
      if (AppState.currentState !== 'active') showDoneNotification('AI Chat');
      else clearInferenceNotifications();
    }
  };

  const handleStop = () => {
    if (currentRunRef.current) {
      void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      currentRunRef.current = null;
    }
  };

  const toggleThinking = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, showThinking: !m.showThinking } : m));
  };

  // ── model switch ────────────────────────────────────────
  const handleModelSelect = async (model: DownloadedModel) => {
    setPickerVisible(false);
    if (model.id === activeStorageModelId) return;
    setModelLoading(true);
    try {
      const settings = await getSettings();
      const cfg: any = { ctx_size: 4096, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
      const mid = await llmManager.ensure(model, cfg, p => setLoadProgress(p));
      modelIdRef.current = mid;
      setModelName(model.name);
      setActiveStorageModelId(model.id);
      await setDefaultModelId(model.id);
    } catch (e: any) {
      Alert.alert('Load failed', e?.message ?? 'Could not load model');
    } finally {
      setModelLoading(false);
    }
  };

  const headerPad = insets.top + 8;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: headerPad, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <IconBack size={22} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.modelPillBtn} onPress={() => setPickerVisible(true)} activeOpacity={0.7}>
          <View style={[styles.modelDot, { backgroundColor: !modelLoading && !noModel ? theme.accent : theme.border }]} />
          <Text style={[styles.modelPillText, { color: theme.text }]} numberOfLines={1}>
            {modelLoading ? `Loading... ${Math.round(loadProgress * 100)}%` : noModel ? 'No model' : modelName}
          </Text>
          <Text style={[styles.modelPillChevron, { color: theme.textSecondary }]}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* ── Model picker sheet ── */}
      <ModelGalleryPicker
        visible={pickerVisible}
        moduleLabel="AI Chat"
        moduleSubtitle="Text models for general questions and answers"
        allModels={AVAILABLE_MODELS.filter(m => m.modelType === 'text')}
        downloadedModels={downloadedModels}
        activeModelId={activeStorageModelId}
        onSelect={handleModelSelect}
        onDownload={(modelId) => {
          setPickerVisible(false);
          navigation.navigate('Download', { modelId, returnTo: 'AIChat', returnParams: {} });
        }}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />

      {/* ── Empty state ── */}
      {messages.length === 0 && !modelLoading && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>AI Chat</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Ask me anything — questions, explanations, ideas, code, analysis.{'\n'}All on-device, completely private.
          </Text>
        </View>
      )}

      {/* ── Messages ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            theme={theme}
            onToggleThinking={() => toggleThinking(msg.id)}
            showThinkToggle={false}
          />
        ))}
        {isTyping && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator theme={theme} />}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ── Input bar ── */}
      <Animated.View style={{ paddingBottom: inputPadBot }}>
        {attachedDoc && (
          <View style={[styles.docChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.docChipText, { color: theme.text }]} numberOfLines={1}>{attachedDoc.name}</Text>
            <TouchableOpacity onPress={() => setAttachedDoc(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>x</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          {isTyping ? (
            <TouchableOpacity style={[styles.stopBtn, { borderColor: theme.border }]} onPress={handleStop} activeOpacity={0.7}>
              <Text style={[styles.stopBtnText, { color: theme.text }]}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setFastMode(f => !f)}
                style={[styles.modeToggle, { backgroundColor: fastMode ? theme.accent + '22' : theme.card, borderColor: fastMode ? theme.accent : theme.border }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.modeToggleText, { color: fastMode ? theme.accent : theme.textSecondary }]}>
                  {fastMode ? 'Fast' : 'Long'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachBtn} onPress={handleDocAttach} activeOpacity={0.7}>
                <Text style={[styles.attachBtnText, { color: theme.textSecondary }]}>+</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                placeholder={noModel ? 'Download a model first...' : 'Ask anything...'}
                placeholderTextColor={theme.textSecondary}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={4000}
                editable={!modelLoading && !noModel}
                returnKeyType="default"
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: input.trim() && !modelLoading && !noModel ? theme.accent : theme.border }]}
                onPress={handleSend}
                disabled={!input.trim() || isTyping || modelLoading || noModel}
                activeOpacity={0.8}
              >
                <Text style={[styles.sendBtnText, { color: input.trim() ? theme.accentFg : theme.textSecondary }]}>↑</Text>
              </TouchableOpacity>
            </>
          )}
          {isTyping && (
            <Text style={[styles.genTimer, { color: theme.textSecondary }]}>{genElapsed}s</Text>
          )}
        </View>
      </Animated.View>

      {/* bottom safe area */}
      <View style={{ height: insets.bottom, backgroundColor: theme.background }} />
    </View>
  );
}

// ── MessageBubble ──────────────────────────────────────────
function MessageBubble({ msg, theme, onToggleThinking, showThinkToggle }: {
  msg: Message; theme: any; onToggleThinking: () => void; showThinkToggle: boolean;
}) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser ? (
        <View style={styles.aiBubbleWrap}>
          <View style={[styles.aiBubble, { backgroundColor: theme.card }]}>
            {msg.streaming ? (
              msg.inThink ? (
                <View style={styles.thinkingLive}>
                  <Text style={[styles.thinkingLiveLabel, { color: theme.accent }]}>Thinking...</Text>
                  {msg.thinking ? <Text style={[styles.thinkingLiveText, { color: theme.textSecondary }]} numberOfLines={6}>{msg.thinking}|</Text> : null}
                </View>
              ) : msg.text ? (
                <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}|</Text>
              ) : (
                <Text style={[styles.bubbleText, { color: theme.textSecondary }]}>|</Text>
              )
            ) : msg.text ? (
              <MarkdownText color={theme.text} fontSize={15} lineHeight={22}>
                {msg.text}
              </MarkdownText>
            ) : null}
          </View>

          {/* Thinking toggle — only in Deep mode */}
          {!msg.streaming && msg.thinking && showThinkToggle ? (
            <>
              <TouchableOpacity style={[styles.thinkingToggle, { borderColor: theme.border }]} onPress={onToggleThinking} activeOpacity={0.7}>
                <Text style={[styles.thinkingToggleText, { color: theme.textSecondary }]}>
                  {msg.showThinking ? 'Hide thoughts' : 'View thoughts'}
                </Text>
              </TouchableOpacity>
              {msg.showThinking && (
                <View style={[styles.thinkingBox, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <Text selectable style={[styles.thinkingText, { color: theme.textSecondary }]}>{msg.thinking}</Text>
                </View>
              )}
            </>
          ) : null}

          {!msg.streaming && msg.text ? (
            <View style={styles.bubbleActions}>
              <CopyButton text={msg.text} color={theme.textSecondary} size={11} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.userBubble, { backgroundColor: theme.accent }]}>
          {msg.text ? <Text selectable style={[styles.bubbleText, { color: theme.accentFg }]}>{msg.text}</Text> : null}
        </View>
      )}
    </View>
  );
}

function TypingIndicator({ theme }: { theme: any }) {
  return (
    <View style={styles.bubbleRow}>
      <View style={[styles.aiBubble, { backgroundColor: theme.card }]}>
        <Text style={[styles.bubbleText, { color: theme.textSecondary }]}>|</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  modelPillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  modelDot: { width: 7, height: 7, borderRadius: 3.5 },
  modelPillText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  modelPillChevron: { fontSize: 10 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, paddingTop: 60 },
  emptyTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, letterSpacing: -0.4 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  tipRow: { gap: 8, alignItems: 'stretch', width: '100%' },
  tipChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  tipText: { fontSize: 13, fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12, gap: 10, flexGrow: 1 },
  bubbleRow: { maxWidth: '88%', alignSelf: 'flex-start' },
  bubbleRowUser: { alignSelf: 'flex-end' },
  aiBubbleWrap: { gap: 4 },
  aiBubble: { borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  userBubble: { borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  thinkingLive: { gap: 4 },
  thinkingLiveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  thinkingLiveText: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  thinkingToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  thinkingToggleText: { fontSize: 12, fontWeight: '600' },
  thinkingBox: { padding: 10, borderRadius: 10, borderWidth: 1 },
  thinkingText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  bubbleActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { fontSize: 18, fontWeight: '700' },
  stopBtn: { flex: 1, borderRadius: 20, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  stopBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },
  genTimer: { fontSize: 12, alignSelf: 'flex-end', paddingBottom: 12 },
  modeToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, marginRight: 4 },
  modeToggleText: { fontSize: 12, fontWeight: '600' },
  attachBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 4 },
  attachBtnText: { fontSize: 18, fontWeight: '400' },
  docChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 12, marginBottom: 6, gap: 8 },
  docChipText: { fontSize: 12, flex: 1 },
});
