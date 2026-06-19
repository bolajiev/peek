import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView,
  Image, Keyboard, AppState, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { llmManager } from '../utils/modelManager';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import {
  syncModelsFromDisk, getSettings, getDefaultModelId,
  getConversations, saveConversation, getMessages,
  appendMessage, updateLastMessage, createConversationId, toPath,
} from '../utils/storage';
import { SYSTEM_PROMPTS, MODEL_KEYS, AVAILABLE_MODELS, stripThink, detectArtifact } from '../utils/models';
import { DownloadedModel, Conversation, ChatMessage } from '../types';
import { showRunningNotification, showDoneNotification, clearInferenceNotifications } from '../utils/bgNotification';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';
import ModelGalleryPicker from '../components/ModelGalleryPicker';
import MdPreviewPanel from '../components/MdPreviewPanel';
import { setDefaultModelId } from '../utils/storage';

interface GeneratedFile { name: string; fileUri: string; artifactType: 'md' | 'html'; }

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePath?: string;
  streaming?: boolean;
  thinking?: string;
  showThinking?: boolean;
  generatedFile?: GeneratedFile;
}

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
  const SYSTEM_PROMPT = SYSTEM_DOC;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();
  const inputPadBot = useRef(new Animated.Value(0)).current;
  const insetBottomRef = useRef(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelLoading, setModelLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [noModel, setNoModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [activeStorageModelId, setActiveStorageModelId] = useState<string | null>(null);
  const [mdPanelVisible, setMdPanelVisible] = useState(false);
  const [mdPanelSource, setMdPanelSource] = useState('');
  const [mdPanelFile, setMdPanelFile] = useState<GeneratedFile | undefined>();

  const scrollRef = useRef<ScrollView>(null);
  const currentRunRef = useRef<any>(null);
  const modelIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string>(resumeConvId ?? createConversationId());
  const isInferringRef = useRef(false);
  const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    insetBottomRef.current = insets.bottom;
    inputPadBot.setValue(Math.max(insets.bottom, 8));
  }, [insets.bottom]);

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
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(inputPadBot, { toValue: 8, duration: e.duration || 250, useNativeDriver: false }).start();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(inputPadBot, { toValue: Math.max(insetBottomRef.current, 8), duration: 200, useNativeDriver: false }).start();
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'background' && isInferringRef.current) {
        showRunningNotification('Peek Scribe');
      } else if (state === 'active') {
        clearInferenceNotifications();
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      appStateSub.remove();
      clearInferenceNotifications();
      if (currentRunRef.current) {
        void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      }
    };
  }, []);

  const rehydrateConversation = async (convId: string) => {
    const stored = await getMessages(convId);
    if (stored.length > 0) {
      setMessages(stored.map(m => ({ id: m.id, role: m.role, text: m.content, imagePath: m.imagePath, thinking: m.thinking })));
    }
  };

  const loadTextModel = async (forceModelId?: string) => {
    setModelLoading(true);
    setLoadProgress(0);
    setNoModel(false);
    setLoadError(null);
    try {
      const synced = await syncModelsFromDisk();
      setDownloadedModels(synced);
      const defaultId = forceModelId ?? await getDefaultModelId();
      const preferredId = preselectedModelId ?? defaultId ?? MODEL_KEYS.TEXT_HEALTH;
      const model = synced.find(m => m.id === preferredId)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_HEALTH)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_FAST)
        ?? synced.find(m => m.modelType === 'text')
        ?? synced[0];
      if (!model) { setNoModel(true); setModelLoading(false); return; }
      setModelName(model.name);
      setActiveStorageModelId(model.id);
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

  const loadOnMount = () => loadTextModel();

  const persistMessage = async (msg: Message) => {
    const convId = convIdRef.current;
    const cm: ChatMessage = {
      id: msg.id,
      conversationId: convId,
      role: msg.role,
      content: msg.text,
      imagePath: msg.imagePath,
      thinking: msg.thinking,
      createdAt: new Date().toISOString(),
    };
    await appendMessage(cm);
    // Only update conversation title from user messages (assistant has no meaningful title)
    if (msg.role === 'user') {
      const conv: Conversation = {
        id: convId,
        moduleId: MODULE_ID,
        title: msg.text ? msg.text.slice(0, 60) : 'Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveConversation(conv);
    } else {
      // Update updatedAt timestamp on the conversation without changing title
      const existing = (await getConversations(MODULE_ID)).find(c => c.id === convId);
      if (existing) await saveConversation({ ...existing, updatedAt: new Date().toISOString() });
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    const imgPath = attachedImage;
    setAttachedImage(null);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, imagePath: imgPath ?? undefined };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    persistMessage(userMsg);
    setIsTyping(true);
    isInferringRef.current = true;
    setGenElapsed(0);
    genTimerRef.current = setInterval(() => setGenElapsed(s => s + 1), 1000);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    const mid = modelIdRef.current;
    if (!mid) {
      setIsTyping(false);
      if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
      return;
    }

    const fastSuffix = fastMode ? '\n\nAnswer directly and concisely in 1-3 sentences. No reasoning preamble.' : '';
    const history: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + fastSuffix },
      ...allMsgs.slice(-20).map(m => ({
        role: m.role,
        content: m.text,
        ...(m.imagePath ? { attachments: [{ path: toPath(m.imagePath) }] } : {}),
      })),
    ];

    const placeholderId = 'ai-' + Date.now();
    setMessages(prev => [...prev, { id: placeholderId, role: 'assistant', text: '', streaming: true }]);

    try {
      const run = completion({
        modelId: mid, history, stream: true,
        captureThinking: !fastMode,
        generationParams: { predict: fastMode ? 256 : 600, temp: 0.7, top_k: 40 },
      });
      currentRunRef.current = run;
      let streamed = '';
      let thinkingText = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          streamed += event.text;
          const { text: visible } = stripThink(streamed);
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: visible } : m));
          scrollRef.current?.scrollToEnd({ animated: false });
        } else if (event.type === 'thinkingDelta') {
          thinkingText += event.text;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, thinking: thinkingText } : m));
        }
      }
      await run.final;
      currentRunRef.current = null;

      // Strip <think> and detect fenced artifact blocks
      const { text: displayText, thinking: thinkFallback } = stripThink(streamed);
      const finalThinking = thinkingText || thinkFallback || undefined;
      const artifact = detectArtifact(displayText);
      let generatedFile: GeneratedFile | undefined;
      if (artifact) {
        generatedFile = await saveArtifact(artifact.type, artifact.source);
        if (generatedFile) {
          if (artifact.type === 'md') {
            // Open MD preview panel in-app
            setMdPanelSource(artifact.source);
            setMdPanelFile(generatedFile);
            setTimeout(() => setMdPanelVisible(true), 300);
          } else {
            // HTML → share sheet so user can open in browser
            Sharing.shareAsync(generatedFile.fileUri, {
              mimeType: 'text/html',
              dialogTitle: 'Open or save HTML file',
              UTI: 'public.html',
            }).catch(() => {});
          }
        }
      }

      setMessages(prev => prev.map(m => m.id === placeholderId
        ? { ...m, text: displayText, streaming: false, generatedFile, thinking: finalThinking }
        : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const aiMsg: Message = { id: placeholderId, role: 'assistant', text: displayText, thinking: finalThinking, generatedFile };
      persistMessage(aiMsg);
      await updateLastMessage(convIdRef.current, displayText);
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
      if (AppState.currentState !== 'active') {
        showDoneNotification('Peek Scribe');
      } else {
        clearInferenceNotifications();
      }
    }
  };

  const handleStop = () => {
    if (currentRunRef.current) {
      void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      currentRunRef.current = null;
    }
  };

  const saveArtifact = async (type: 'md' | 'html', source: string): Promise<GeneratedFile | undefined> => {
    try {
      const artifactsDir = new Directory(Paths.document, 'artifacts');
      artifactsDir.create({ intermediates: true, idempotent: true });
      const ts = Date.now();
      const tryMd = type === 'md';
      const preferredExt = tryMd ? 'md' : 'html';
      let file = new File(artifactsDir, `peek-scribe-${ts}.${preferredExt}`);
      try {
        file.write(source);
      } catch {
        // Fallback: save as html if md write failed
        file = new File(artifactsDir, `peek-scribe-${ts}.html`);
        file.write(source);
      }
      return { name: file.uri.split('/').pop() ?? `peek-scribe-${ts}.${preferredExt}`, fileUri: file.uri, artifactType: type };
    } catch {
      return undefined;
    }
  };

  const shareArtifact = async (file: GeneratedFile) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.fileUri, {
          mimeType: file.artifactType === 'html' ? 'text/html' : 'text/markdown',
          dialogTitle: `Share ${file.artifactType.toUpperCase()} file`,
          UTI: file.artifactType === 'html' ? 'public.html' : 'net.daringfireball.markdown',
        });
      } else {
        Alert.alert('File saved', `Saved as: ${file.name}`);
      }
    } catch {}
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

  const toggleThinking = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, showThinking: !m.showThinking } : m));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.menuBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.backBtn, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => !modelLoading && !isTyping && setPickerVisible(true)}
          activeOpacity={modelLoading || isTyping ? 1 : 0.65}
        >
          <Text style={[styles.headerTitle, { color: theme.text }]}>{mode === 'document' ? 'Document' : 'Scribe'}</Text>
          <Text style={[styles.headerSub, { color: modelLoading ? theme.accent : isTyping ? theme.accent : theme.textSecondary }]} numberOfLines={1}>
            {modelLoading
              ? `Loading${loadProgress > 0 ? ` ${Math.round(loadProgress)}%` : '...'}`
              : isTyping
              ? `Generating… ${genElapsed}s`
              : `${modelName} ▾`}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.modeToggle, { backgroundColor: fastMode ? theme.accent + '22' : theme.card, borderColor: fastMode ? theme.accent : theme.border }]}
            onPress={() => setFastMode(f => !f)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.modeToggleText, { color: fastMode ? theme.accent : theme.textSecondary }]}>
              {fastMode ? '⚡ Fast' : '🧠 Deep'}
            </Text>
          </TouchableOpacity>
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
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {noModel ? (
          <NoModelState theme={theme} error={loadError}
            onGoModels={() => navigation.navigate('Download', { modelId: MODEL_KEYS.TEXT_HEALTH, returnTo: 'Scribe', returnParams: {} })}
            onRetry={() => { setNoModel(false); setLoadError(null); loadOnMount(); }} />
        ) : messages.length === 0 ? (
          <EmptyState theme={theme} mode={mode} />
        ) : (
          <ScrollView ref={scrollRef} style={styles.msgList} contentContainerStyle={styles.msgListContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                theme={theme}
                onToggleThinking={() => toggleThinking(msg.id)}
                onShareFile={msg.generatedFile ? () => shareArtifact(msg.generatedFile!) : undefined}
              />
            ))}
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
            <Animated.View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: inputPadBot }]}>
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
            </Animated.View>
          </>
        )}
      </KeyboardAvoidingView>

      <ModelGalleryPicker
        visible={pickerVisible}
        moduleLabel="Peek Scribe"
        moduleSubtitle="Text models for writing and documents"
        allModels={AVAILABLE_MODELS.filter(m => m.modelType === 'text')}
        downloadedModels={downloadedModels.filter(m => m.modelType === 'text')}
        activeModelId={activeStorageModelId}
        onSelect={async (model) => {
          await setDefaultModelId(model.id);
          loadTextModel(model.id);
        }}
        onDownload={(modelId) => {
          navigation.navigate('Download', { modelId, returnTo: 'Scribe', returnParams: {} });
        }}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />

      <MdPreviewPanel
        visible={mdPanelVisible}
        source={mdPanelSource}
        fileName={mdPanelFile?.name ?? 'document.md'}
        fileUri={mdPanelFile?.fileUri}
        onClose={() => setMdPanelVisible(false)}
        theme={theme}
      />
    </View>
  );
}

function MessageBubble({ msg, theme, onToggleThinking, onShareFile }: {
  msg: Message; theme: any; onToggleThinking: () => void; onShareFile?: () => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser ? (
        <View style={styles.aiBubbleWrap}>
          <View style={[styles.aiBubble, { backgroundColor: theme.card }]}>
            {msg.imagePath && <Image source={{ uri: msg.imagePath }} style={styles.bubbleImage} />}
            {msg.streaming ? (
              msg.text ? (
                // Content is streaming — show it
                <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}▍</Text>
              ) : msg.thinking ? (
                // Still in thinking phase — show thinking live so user sees activity
                <View style={styles.thinkingLive}>
                  <Text style={[styles.thinkingLiveLabel, { color: theme.accent }]}>Thinking…</Text>
                  <Text style={[styles.thinkingLiveText, { color: theme.textSecondary }]} numberOfLines={6}>{msg.thinking}▍</Text>
                </View>
              ) : (
                <Text style={[styles.bubbleText, { color: theme.textSecondary }]}>▍</Text>
              )
            ) : msg.text ? (
              <MarkdownText color={theme.text} fontSize={15} lineHeight={22}>
                {msg.text}
              </MarkdownText>
            ) : null}
          </View>

          {/* Generated file card — Save & Share */}
          {!msg.streaming && msg.generatedFile ? (
            <View style={[styles.fileCard, { backgroundColor: theme.cardAlt, borderColor: theme.accent + '55' }]}>
              <Text style={styles.fileCardIcon}>{msg.generatedFile.artifactType === 'html' ? '🌐' : '📄'}</Text>
              <View style={styles.fileCardBody}>
                <Text style={[styles.fileCardName, { color: theme.text }]} numberOfLines={1}>{msg.generatedFile.name}</Text>
                <Text style={[styles.fileCardMeta, { color: theme.textSecondary }]}>{msg.generatedFile.artifactType === 'html' ? 'HTML page' : 'Markdown file'} · saved to device</Text>
              </View>
              {onShareFile && (
                <TouchableOpacity onPress={onShareFile} style={[styles.shareBtn, { backgroundColor: theme.accent }]} activeOpacity={0.8}>
                  <Text style={[styles.shareBtnText, { color: '#000' }]}>Share ↗</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Thinking toggle */}
          {!msg.streaming && msg.thinking ? (
            <>
              <TouchableOpacity style={[styles.thinkingToggle, { borderColor: theme.border }]} onPress={onToggleThinking} activeOpacity={0.7}>
                <Text style={[styles.thinkingToggleText, { color: theme.textSecondary }]}>
                  {msg.showThinking ? '▼ Hide thoughts' : '▶ View thoughts'}
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
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{mode === 'document' ? 'Start Writing' : 'Ask me anything'}</Text>
      <Text style={[styles.emptySub, { color: theme.textSecondary }]}>{mode === 'document' ? 'Describe what you want to write.' : 'Type a question or attach an image.'}</Text>
    </View>
  );
}

function NoModelState({ theme, error, onGoModels, onRetry }: any) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{error ? 'Load Failed' : 'No text model yet'}</Text>
      <Text selectable style={[styles.emptySub, { color: error ? theme.error : theme.textSecondary }]}>
        {error ?? 'Download a text model (Qwen 2.5 or MedPsy) to start chatting.'}
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
  headerRight: { alignItems: 'flex-end', gap: 6 },
  clearText: { fontSize: 13, fontWeight: '600' },
  modeToggle: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  modeToggleText: { fontSize: 11, fontWeight: '700' },
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
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, gap: 8, borderTopWidth: 1 },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 24, fontWeight: '300', lineHeight: 28 },
  textInput: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  sendIcon: { fontSize: 18, fontWeight: '700' },
  stopSquare: { width: 14, height: 14, borderRadius: 2 },
  thinkingLive: { gap: 6 },
  thinkingLiveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  thinkingLiveText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4,
  },
  fileCardIcon: { fontSize: 22 },
  fileCardBody: { flex: 1, gap: 2 },
  fileCardName: { fontSize: 13, fontWeight: '700' },
  fileCardMeta: { fontSize: 11 },
  fileCardArrow: { fontSize: 18, fontWeight: '600' },
  shareBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  shareBtnText: { fontSize: 12, fontWeight: '700' },
  thinkingToggle: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2 },
  thinkingToggleText: { fontSize: 11, fontWeight: '600' },
  thinkingBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4 },
  thinkingText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
});
