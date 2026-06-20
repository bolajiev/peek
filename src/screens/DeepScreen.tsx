import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { Paths, File, Directory } from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { unzipSync, strFromU8 } from 'fflate';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { ragIngestText, ragQuery, buildRagContext, newRagWorkspace, closeRagWorkspace } from '../utils/ragService';
import { syncModelsFromDisk, getSettings, getTemperature, getDefaultModelId, setDefaultModelId, toPath, saveDeepSession, appendMessage, saveConversation, createConversationId, getMessages } from '../utils/storage';
import { ChatMessage, Conversation } from '../types';
import { completion, cancel, loadModel, unloadModel, InferenceCancelledError, EMBEDDINGGEMMA_300M_Q8_0 } from '@qvac/sdk';
import { llmManager } from '../utils/modelManager';
import { SYSTEM_PROMPTS, MODEL_KEYS, AVAILABLE_MODELS, stripThink, splitStream } from '../utils/models';
import { showRunningNotification, showDoneNotification, clearInferenceNotifications } from '../utils/bgNotification';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';
import ResultActions from '../components/ResultActions';
import PeekLoader from '../components/PeekLoader';
import ModelGalleryPicker from '../components/ModelGalleryPicker';
import { DownloadedModel } from '../types';

type Phase = 'idle' | 'ingesting' | 'ready' | 'thinking';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  showSources?: boolean;
}

export default function DeepScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const resumeConvId: string | undefined = route.params?.resumeConvId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('idle');
  const [sourceTitle, setSourceTitle] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [llmModelId, setLlmModelId] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmProgress, setLlmProgress] = useState(0);
  const [noModel, setNoModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [activeStorageModelId, setActiveStorageModelId] = useState<string | null>(null);
  const [llmModelName, setLlmModelName] = useState('');
  const embedIdRef = useRef<string>('');
  const ragWorkspaceRef = useRef<string>('');
  const currentRunRef = useRef<any>(null);
  const sessionSavedRef = useRef(false);
  const isInferringRef = useRef(false);
  const convIdRef = useRef<string>(resumeConvId ?? createConversationId());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    loadLlm();
    // Rehydrate previous conversation if resuming from history
    if (resumeConvId) {
      sessionSavedRef.current = true; // don't re-save the session header
      getMessages(resumeConvId).then(msgs => {
        setMessages(msgs.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', text: m.content })));
        setPhase('ready');
        setSourceTitle('Previous session');
      });
    }
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'background' && isInferringRef.current) {
        showRunningNotification('Peek Deep');
      } else if (state === 'active') {
        clearInferenceNotifications();
      }
    });
    return () => {
      sub.remove();
      appStateSub.remove();
      clearInferenceNotifications();
      if (embedIdRef.current) {
        unloadModel({ modelId: embedIdRef.current }).catch(() => {});
        embedIdRef.current = '';
      }
      if (ragWorkspaceRef.current) {
        closeRagWorkspace(ragWorkspaceRef.current).catch(() => {});
        ragWorkspaceRef.current = '';
      }
    };
  }, []);

  const loadLlm = async (forceModelId?: string) => {
    setLlmLoading(true);
    setLlmProgress(0);
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
      if (!model) { setNoModel(true); setLlmLoading(false); return; }
      setLlmModelName(model.name);
      setActiveStorageModelId(model.id);
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 4096, device };
      if (model.projectionModelSrc) modelConfig.projectionModelSrc = toPath(model.projectionModelSrc);
      const mid = await llmManager.ensure(model, modelConfig, setLlmProgress);
      setLlmModelId(mid);
    } catch (err: any) {
      const raw = err?.message || err?.toString() || 'Unknown error';
      setLoadError(raw.replace(/file:\/\/[^\s,]*/g, '[model]'));
      setNoModel(true);
    } finally {
      setLlmLoading(false);
    }
  };

  const extractDocxText = async (uri: string): Promise<string> => {
    const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const zipped = unzipSync(bytes);
    const docXml = zipped['word/document.xml'];
    if (!docXml) throw new Error('Not a valid .docx file — missing word/document.xml');
    const xml = strFromU8(docXml);
    const matches = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/markdown', 'application/json',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.name ?? '').split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'doc') {
      Alert.alert('Old .doc format not supported', 'Open the file in Word or Google Docs and save as .docx or .txt, then try again.');
      return;
    }

    setPhase('ingesting');
    sessionSavedRef.current = false;
    try {
      const docsDir = new Directory(Paths.document, 'peek', 'deep');
      docsDir.create({ intermediates: true, idempotent: true });
      const destFile = new File(docsDir, `doc_${Date.now()}_${asset.name}`);
      new File(asset.uri).copy(destFile);
      const workingUri = destFile.exists ? destFile.uri : asset.uri;

      let content: string;
      if (ext === 'docx') {
        content = await extractDocxText(workingUri);
      } else {
        content = await new File(workingUri).text();
      }

      if (!content || content.length < 50) {
        throw new Error('File appears empty or too short to analyze.');
      }

      const truncated = content.slice(0, 40000);

      if (ragWorkspaceRef.current) {
        await closeRagWorkspace(ragWorkspaceRef.current).catch(() => {});
        ragWorkspaceRef.current = '';
      }
      if (embedIdRef.current) {
        await unloadModel({ modelId: embedIdRef.current }).catch(() => {});
        embedIdRef.current = '';
      }
      const workspace = newRagWorkspace();
      ragWorkspaceRef.current = workspace;
      const embedId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
      embedIdRef.current = embedId;
      await ragIngestText(embedId, truncated, workspace);

      setSourceTitle(asset.name ?? 'Document');
      setMessages([{ id: 'init', role: 'assistant', text: `Ready. I've read "${asset.name ?? 'your document'}". Ask me anything about it.` }]);
      setPhase('ready');
    } catch (e: any) {
      setPhase('idle');
      Alert.alert('Could not read file', e.message || 'Make sure the file contains readable text.');
    }
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || phase === 'thinking') return;
    if (!llmModelId) { Alert.alert('No model', 'Download a model from the Models screen first.'); return; }

    setQuestion('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: q };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPhase('thinking');
    isInferringRef.current = true;

    if (!sessionSavedRef.current) {
      sessionSavedRef.current = true;
      const sesId = Date.now().toString();
      saveDeepSession({ id: sesId, docName: sourceTitle, firstQuestion: q, createdAt: new Date().toISOString() });
      const conv: Conversation = {
        id: convIdRef.current, moduleId: 'deep',
        title: q.slice(0, 60),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      saveConversation(conv);
    }
    const userCm: ChatMessage = { id: userMsg.id, conversationId: convIdRef.current, role: 'user', content: q, createdAt: new Date().toISOString() };
    appendMessage(userCm);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const placeholderId = 'ai-' + Date.now();

    try {
      const docs = await ragQuery(embedIdRef.current, q, 5, ragWorkspaceRef.current);
      const ctx = buildRagContext(docs);
      const sysPrompt = `${SYSTEM_PROMPTS.deep}\n\n${ctx}`;

      const msgs = [
        { role: 'system', content: sysPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.text })),
      ];

      const aiMsg: Message = { id: placeholderId, role: 'assistant', text: '', sources: docs.length > 0 ? docs : undefined };
      setMessages([...newMessages, aiMsg]);

      let full = '';
      const run = completion({
        modelId: llmModelId, history: msgs, stream: true,
        captureThinking: false,
        generationParams: { predict: 1024, temp: await getTemperature(), top_k: 30 },
      });
      currentRunRef.current = run;
      for await (const ev of run.events) {
        if ((ev as any).type === 'contentDelta') {
          full += (ev as any).text;
          const { answer: visible } = splitStream(full);
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: visible || '▍' } : m));
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }
      currentRunRef.current = null;

      const { text: cleanFull } = stripThink(full);
      const finalText = cleanFull.trim() || 'No response.';
      setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: finalText } : m));
      const aiCm: ChatMessage = { id: placeholderId, conversationId: convIdRef.current, role: 'assistant', content: finalText, createdAt: new Date().toISOString() };
      appendMessage(aiCm);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        setMessages(prev => prev.map(m => m.id === placeholderId
          ? { ...m, text: 'Something went wrong. Try again.' }
          : m));
      }
    } finally {
      isInferringRef.current = false;
      setPhase('ready');
      if (AppState.currentState !== 'active') {
        showDoneNotification('Peek Deep');
      } else {
        clearInferenceNotifications();
      }
    }
  };

  const toggleSources = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, showSources: !m.showSources } : m));
  };

  const reset = () => { setPhase('idle'); setMessages([]); setSourceTitle(''); };

  const isBusy = phase === 'ingesting' || phase === 'thinking';
  const inputBarPadBot = Math.max(insets.bottom, 12);

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.backBtn, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => !llmLoading && setPickerVisible(true)}
          activeOpacity={llmLoading ? 1 : 0.65}
        >
          <Text style={[styles.headerTitle, { color: theme.text }]}>Peek Deep</Text>
          <Text style={[styles.headerSub, { color: llmLoading ? theme.accent : sourceTitle ? theme.accent : theme.textSecondary }]} numberOfLines={1}>
            {llmLoading
              ? `Loading${llmProgress > 0 ? ` ${Math.round(llmProgress)}%` : '...'}`
              : sourceTitle || `${llmModelName} ▾`}
          </Text>
        </TouchableOpacity>
        {phase !== 'idle'
          ? <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearBtn, { color: theme.textSecondary }]}>Reset</Text>
            </TouchableOpacity>
          : <View style={{ width: 48 }} />}
      </View>

      {llmLoading && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${llmProgress || 8}%` }]} />
        </View>
      )}

      {noModel ? (
        <View style={styles.centeredPane}>
          <Text style={[styles.loadingText, { color: theme.text }]}>{loadError ? 'Load Failed' : 'No model found'}</Text>
          <Text selectable style={[styles.loadingSub, { color: loadError ? theme.error : theme.textSecondary }]}>
            {loadError || 'Download a model from Models first'}
          </Text>
          {loadError && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent, marginTop: 12 }]} onPress={() => { setNoModel(false); setLoadError(null); loadLlm(); }}>
              <Text style={[styles.actionBtnText, { color: theme.accentFg }]}>Retry</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]} onPress={() => navigation.navigate('Download', { modelId: MODEL_KEYS.TEXT_FAST, returnTo: 'Deep', returnParams: {} })}>
            <Text style={[styles.actionBtnText, { color: theme.text }]}>Download Model</Text>
          </TouchableOpacity>
        </View>
      ) : phase === 'idle' ? (
        <View style={styles.idlePane}>
          <View style={[styles.idleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.idleTitle, { color: theme.text }]}>Research your files</Text>
            <Text style={[styles.idleSub, { color: theme.textSecondary }]}>
              Pick a text file from your device. Peek reads it locally — nothing leaves your phone — then answers your questions about it.
            </Text>
            <View style={[styles.supportedBox, { backgroundColor: theme.cardAlt, borderRadius: 10 }]}>
              <Text style={[styles.supportedLabel, { color: theme.textSecondary }]}>Supported: TXT, MD, JSON, and other plain-text formats</Text>
            </View>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: llmLoading ? theme.border : theme.accent }]}
              onPress={handlePickFile}
              disabled={llmLoading}
            >
              <Text style={[styles.pickBtnText, { color: llmLoading ? theme.textSecondary : theme.accentFg }]}>{llmLoading ? 'Loading model…' : 'Choose File'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : phase === 'ingesting' ? (
        <View style={styles.centeredPane}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>Reading document…</Text>
          <Text style={[styles.loadingSub, { color: theme.textSecondary }]}>Building your private knowledge base</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardFlex}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {messages.map((msg) => (
              <View key={msg.id} style={[styles.turn, msg.role === 'user' ? styles.turnRight : styles.turnLeft]}>
                <View style={[
                  styles.bubble,
                  msg.role === 'user'
                    ? { backgroundColor: theme.accent, borderBottomRightRadius: 4 }
                    : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                ]}>
                  {msg.role === 'assistant' ? (
                    <MarkdownText color={theme.text} fontSize={15} lineHeight={22}>{msg.text}</MarkdownText>
                  ) : (
                    <Text selectable style={[styles.bubbleText, { color: theme.accentFg }]}>{msg.text}</Text>
                  )}
                </View>
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                  <>
                    <TouchableOpacity
                      style={[styles.sourcesToggle, { borderColor: theme.border }]}
                      onPress={() => toggleSources(msg.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.sourcesToggleText, { color: theme.textSecondary }]}>
                        {msg.showSources ? '▼ Hide sources' : `▶ ${msg.sources.length} source${msg.sources.length > 1 ? 's' : ''}`}
                      </Text>
                    </TouchableOpacity>
                    {msg.showSources && (
                      <View style={[styles.sourcesBox, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                        {msg.sources.map((src, si) => (
                          <View key={si} style={styles.sourceItem}>
                            <Text style={[styles.sourceNum, { color: theme.accent }]}>[{si + 1}]</Text>
                            <Text selectable style={[styles.sourceText, { color: theme.textSecondary }]}>{src.slice(0, 300)}{src.length > 300 ? '…' : ''}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : null}
                {msg.role === 'assistant' && msg.text ? (
                  <View style={styles.bubbleActions}>
                    <CopyButton text={msg.text} color={theme.textSecondary} size={11} />
                    <ResultActions text={msg.text} title={`peek-deep-${Date.now()}`} theme={theme} compact />
                  </View>
                ) : null}
              </View>
            ))}
            {phase === 'thinking' && messages[messages.length - 1]?.role !== 'assistant' && (
              <View style={[styles.turn, styles.turnLeft]}>
                <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                  <PeekLoader size={32} />
                </View>
              </View>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: inputBarPadBot }]}>
            <TextInput
              style={[styles.questionInput, { backgroundColor: theme.card, color: theme.text }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about this document…"
              placeholderTextColor={theme.textSecondary}
              onSubmitEditing={handleAsk}
              returnKeyType="send"
              editable={!isBusy}
            />
            {phase === 'thinking' ? (
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: theme.error }]}
                onPress={() => { if (currentRunRef.current) void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {}); }}
              >
                <View style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: '#fff' }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: question.trim() ? theme.accent : theme.cardAlt }]}
                onPress={handleAsk}
                disabled={!question.trim() || isBusy}
              >
                <Text style={[styles.sendBtnText, { color: question.trim() ? theme.accentFg : theme.textSecondary }]}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
      <ModelGalleryPicker
        visible={pickerVisible}
        moduleLabel="Peek Deep"
        moduleSubtitle="Text models for document analysis"
        allModels={AVAILABLE_MODELS.filter(m => m.modelType === 'text')}
        downloadedModels={downloadedModels.filter(m => m.modelType === 'text')}
        activeModelId={activeStorageModelId}
        onSelect={async (model) => {
          await setDefaultModelId(model.id);
          loadLlm(model.id);
        }}
        onDownload={(modelId) => {
          navigation.navigate('Download', { modelId, returnTo: 'Deep', returnParams: {} });
        }}
        onClose={() => setPickerVisible(false)}
        theme={theme}
      />
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { fontSize: 24, fontWeight: '300' },
  headerTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerSub: { fontSize: 11, fontWeight: '600', textAlign: 'center', maxWidth: 200 },
  clearBtn: { fontSize: 14, fontWeight: '600' },
  centeredPane: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  loadingText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  loadingSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  actionBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12, minWidth: 160, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '700' },
  idlePane: { flex: 1, padding: 20, justifyContent: 'center' },
  idleCard: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  idleTitle: { fontSize: 20, fontWeight: '800' },
  idleSub: { fontSize: 14, lineHeight: 20 },
  supportedBox: { padding: 12 },
  supportedLabel: { fontSize: 12, lineHeight: 18 },
  pickBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  pickBtnText: { fontSize: 15, fontWeight: '700' },
  keyboardFlex: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 10, flexGrow: 1 },
  turn: { maxWidth: '85%', gap: 4 },
  turnLeft: { alignSelf: 'flex-start' },
  turnRight: { alignSelf: 'flex-end' },
  bubbleActions: { flexDirection: 'row', paddingHorizontal: 4 },
  bubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  sourcesToggle: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  sourcesToggleText: { fontSize: 11, fontWeight: '600' },
  sourcesBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  sourceItem: { flexDirection: 'row', gap: 6 },
  sourceNum: { fontSize: 12, fontWeight: '700', minWidth: 20 },
  sourceText: { flex: 1, fontSize: 12, lineHeight: 18 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  questionInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { fontSize: 24, fontWeight: '800', marginTop: -2 },
});
