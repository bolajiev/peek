import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated,
  AppState, Modal, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { completion, cancel, InferenceCancelledError, ragIngest, ragSearch, ragCloseWorkspace } from '@qvac/sdk';
import { EMBEDDINGGEMMA_300M_Q8_0, loadModel, unloadModel } from '@qvac/sdk';
import { File, Directory, Paths } from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { unzipSync, strFromU8 } from 'fflate';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { llmManager } from '../utils/modelManager';
import { syncModelsFromDisk, getSettings, toPath } from '../utils/storage';
import { MODEL_KEYS } from '../utils/models';
import {
  V2Message, V2Conversation, newId, stripThink, detectArtifact,
  listConversations, saveConversation, appendMessage,
} from '../utils/v2storage';
import ArtifactPanel from '../components/ArtifactPanel';
import PeekLoader from '../components/PeekLoader';
import { DownloadedModel } from '../types';
import { useNavigation } from '@react-navigation/native';

type FastDeep = 'fast' | 'deep';

const SYSTEM_BASE = `You are Peek, a private AI assistant running fully on-device. Be helpful, accurate, and concise.`;
const FAST_SUFFIX = `\n\nRespond directly and concisely. No reasoning steps.`;
const DEEP_SUFFIX = `\n\nThink step by step before answering.`;
const DOC_PREFIX = `Answer based on the following context. If the answer is not in the context, say so clearly.\n\nCONTEXT:\n`;

export default function V2ChatScreen() {
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const navigation = useNavigation<any>();

  // ── conversation ──────────────────────────────────────────
  const [convId] = useState(() => newId());
  const [messages, setMessages] = useState<V2Message[]>([]);
  const [inputText, setInputText] = useState('');
  const flatRef = useRef<FlatList>(null);

  // ── model ─────────────────────────────────────────────────
  const [loadedModelId, setLoadedModelId] = useState<string>('');       // QVAC model ID
  const [loadedModelInfo, setLoadedModelInfo] = useState<DownloadedModel | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [noModelReady, setNoModelReady] = useState(true);

  // ── generation ────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const currentRunRef = useRef<{ requestId: string } | null>(null);
  const activeConvIdRef = useRef(convId);

  // ── mode ──────────────────────────────────────────────────
  const [mode, setMode] = useState<FastDeep>('deep');

  // ── RAG ───────────────────────────────────────────────────
  const embedIdRef = useRef('');
  const ragWsRef = useRef('');
  const [docName, setDocName] = useState<string | null>(null);
  const [docIngesting, setDocIngesting] = useState(false);

  // ── artifact ──────────────────────────────────────────────
  const [artifactVisible, setArtifactVisible] = useState(false);
  const [artifactType, setArtifactType] = useState<'html' | 'md'>('html');
  const [artifactSource, setArtifactSource] = useState('');
  const [artifactTitle, setArtifactTitle] = useState('artifact');

  // ── history ───────────────────────────────────────────────
  const [histVisible, setHistVisible] = useState(false);
  const [histList, setHistList] = useState<V2Conversation[]>([]);

  // ── on mount: sync downloaded models ──────────────────────
  useEffect(() => {
    syncModelsFromDisk().then(synced => {
      const text = synced.filter(m => m.modelType === 'text');
      setDownloadedModels(text);
      if (text.length > 0) setModelPickerVisible(true);
      else setNoModelReady(false); // no models at all → show download prompt
    });
    return () => {
      if (embedIdRef.current) unloadModel({ modelId: embedIdRef.current }).catch(() => {});
      if (ragWsRef.current) ragCloseWorkspace({ workspace: ragWsRef.current }).catch(() => {});
    };
  }, []);

  // ── load a text model ─────────────────────────────────────
  const loadModel_ = useCallback(async (info: DownloadedModel) => {
    setModelLoading(true);
    setModelProgress(0);
    try {
      const settings = await getSettings();
      const cfg: any = { ctx_size: 4096, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
      const mid = await llmManager.ensure(info, cfg, setModelProgress);
      setLoadedModelId(mid);
      setLoadedModelInfo(info);
      setNoModelReady(false);
      setModelPickerVisible(false);
    } catch (e: any) {
      Alert.alert('Load failed', e?.message || 'Could not load model');
    } finally {
      setModelLoading(false);
    }
  }, []);

  // ── send ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, imageUri?: string) => {
    if (!loadedModelId || generating) return;
    const userMsg: V2Message = {
      id: newId(), role: 'user', content: text,
      imagePath: imageUri, createdAt: new Date().toISOString(),
    };
    const assistantMsgId = newId();
    const assistantMsg: V2Message = {
      id: assistantMsgId, role: 'assistant', content: '',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInputText('');
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Save user message
      await persistConv(userMsg);

      const systemPrompt = buildSystemPrompt();
      const history = buildHistory(text, imageUri);

      let out = '';
      let thinking = '';
      const run = completion({
        modelId: loadedModelId,
        history: [{ role: 'system', content: systemPrompt }, ...history],
        stream: true,
        captureThinking: mode === 'deep',
        generationParams: {
          predict: mode === 'fast' ? 256 : 600,
          temp: 0.7, top_k: 40,
        },
      });
      currentRunRef.current = run;

      for await (const ev of run.events) {
        const e = ev as any;
        if (e.type === 'contentDelta') {
          out += e.text;
          const { text: clean } = stripThink(out);
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: clean + '▍' } : m));
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 0);
        } else if (e.type === 'thinkingDelta') {
          thinking += e.text;
        }
      }

      const { text: finalText, thinking: thinkFallback } = stripThink(out);
      const finalThink = thinking || thinkFallback;
      const artifact = detectArtifact(finalText);

      const finalMsg: V2Message = {
        id: assistantMsgId, role: 'assistant',
        content: finalText,
        thinking: finalThink || undefined,
        artifactType: artifact?.type,
        artifactSource: artifact?.source,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? finalMsg : m));
      await persistConv(finalMsg, userMsg.content);

      if (artifact) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          setArtifactType(artifact.type);
          setArtifactSource(artifact.source);
          setArtifactTitle(`peek-${artifact.type}-${Date.now()}`);
          setArtifactVisible(true);
        }, 400);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        const errText = 'Generation failed. Try again.';
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: errText } : m));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setGenerating(false);
      currentRunRef.current = null;
    }
  }, [loadedModelId, generating, mode, messages]);

  const buildSystemPrompt = () => {
    let sys = SYSTEM_BASE;
    if (docName && ragWsRef.current) sys = DOC_PREFIX;
    sys += mode === 'fast' ? FAST_SUFFIX : DEEP_SUFFIX;
    return sys;
  };

  const buildHistory = (newText: string, imageUri?: string) => {
    const hist: any[] = messages.slice(-18).map(m => ({
      role: m.role,
      content: m.content.replace(/▍$/, ''),
      ...(m.imagePath ? { attachments: [{ path: toPath(m.imagePath) }] } : {}),
    }));
    const userEntry: any = { role: 'user', content: newText };
    if (imageUri) userEntry.attachments = [{ path: toPath(imageUri) }];
    hist.push(userEntry);
    return hist;
  };

  // ── RAG doc attach ────────────────────────────────────────
  const handleDocAttach = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'doc') { Alert.alert('Format not supported', 'Save as .docx or .txt and retry.'); return; }

    setDocIngesting(true);
    try {
      // Copy to sandbox
      const dir = new Directory(Paths.document, 'peek', 'chat-docs');
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, `doc_${Date.now()}_${asset.name}`);
      new File(asset.uri).copy(dest);
      const uri = dest.exists ? dest.uri : asset.uri;

      // Extract text
      let content = '';
      if (ext === 'docx') {
        content = await extractDocx(uri);
      } else if (ext === 'pdf') {
        content = await extractPdf(uri);
      } else {
        content = await new File(uri).text();
      }
      if (!content || content.trim().length < 20) throw new Error('File too short or empty');

      // RAG ingest via QVAC embedding
      const wsName = `v2chat-${Date.now()}`;
      if (ragWsRef.current) { await ragCloseWorkspace({ workspace: ragWsRef.current }).catch(() => {}); }
      if (!embedIdRef.current) {
        embedIdRef.current = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
      }
      ragWsRef.current = wsName;
      const chunks = chunkText(content, 500, 50);
      await ragIngest({
        modelId: embedIdRef.current,
        documents: chunks,
        workspace: wsName,
        chunk: false,
      });
      setDocName(asset.name ?? 'document');
      const sysMsg: V2Message = {
        id: newId(), role: 'assistant',
        content: `Document loaded: **${asset.name}** (${chunks.length} chunks). Ask me anything about it.`,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, sysMsg]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Doc load failed', e?.message || 'Unknown error');
    } finally {
      setDocIngesting(false);
    }
  };

  // RAG-augmented send (override buildHistory for doc mode)
  const sendWithRag = useCallback(async (text: string) => {
    if (!ragWsRef.current || !loadedModelId || generating) return;
    const userMsg: V2Message = { id: newId(), role: 'user', content: text, createdAt: new Date().toISOString() };
    const assistantMsgId = newId();
    setMessages(prev => [...prev, userMsg, { id: assistantMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString() }]);
    setInputText('');
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await persistConv(userMsg);
      const ctx = await ragSearch({ modelId: embedIdRef.current, query: text, workspace: ragWsRef.current, topK: 5 });
      const contextText = ctx.map((c: any) => c.text ?? c.content ?? c.chunk ?? '').join('\n\n');
      const systemPrompt = DOC_PREFIX + contextText + '\n\nQuestion: ';
      let out = '';
      const ragRun = completion({
        modelId: loadedModelId,
        history: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        stream: true, captureThinking: false,
        generationParams: { predict: 400, temp: 0.3 },
      });
      currentRunRef.current = ragRun;
      for await (const ev of ragRun.events) {
        const e = ev as any;
        if (e.type === 'contentDelta') {
          out += e.text;
          const { text: clean } = stripThink(out);
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: clean + '▍' } : m));
        }
      }
      const { text: finalText } = stripThink(out);
      const finalMsg: V2Message = { id: assistantMsgId, role: 'assistant', content: finalText, createdAt: new Date().toISOString() };
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? finalMsg : m));
      await persistConv(finalMsg, userMsg.content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: 'Generation failed.' } : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  }, [loadedModelId, generating]);

  const handleSend = () => {
    const t = inputText.trim();
    if (!t) return;
    if (ragWsRef.current) sendWithRag(t);
    else sendMessage(t);
  };

  // ── persistence helpers ───────────────────────────────────
  const persistConv = async (msg: V2Message, firstUserText?: string) => {
    await appendMessage(convId, msg);
    const title = firstUserText?.slice(0, 60) ?? messages.find(m => m.role === 'user')?.content?.slice(0, 60) ?? 'Chat';
    const conv: V2Conversation = {
      id: convId, screen: 'chat',
      title,
      modelId: loadedModelInfo?.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveConversation(conv);
  };

  // ── history ───────────────────────────────────────────────
  const openHistory = async () => {
    const list = await listConversations('chat');
    setHistList(list);
    setHistVisible(true);
  };

  // ── doc helpers ───────────────────────────────────────────
  const extractDocx = async (uri: string): Promise<string> => {
    const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const zipped = unzipSync(bytes);
    const docXml = zipped['word/document.xml'];
    if (!docXml) throw new Error('Not a valid .docx file');
    const xml = strFromU8(docXml);
    return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
  };

  const extractPdf = async (uri: string): Promise<string> => {
    // Basic PDF text extraction: read raw bytes, find text between BT/ET markers
    try {
      const content = await new File(uri).text();
      const matches = content.match(/BT[\s\S]*?ET/g) || [];
      const texts = matches.flatMap(block =>
        (block.match(/\(([^)]*)\)/g) || []).map(s => s.slice(1, -1))
      );
      if (texts.length > 0) return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {}
    throw new Error('PDF text extraction not available. Please use TXT or DOCX.');
  };

  const chunkText = (text: string, size: number, overlap: number): string[] => {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let i = 0;
    while (i < words.length) {
      chunks.push(words.slice(i, i + size).join(' '));
      i += size - overlap;
    }
    return chunks;
  };

  // ── render ────────────────────────────────────────────────
  const renderMessage = useCallback(({ item }: { item: V2Message }) => {
    const isUser = item.role === 'user';
    const artifact = item.artifactType && item.artifactSource
      ? { type: item.artifactType, source: item.artifactSource }
      : null;
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: theme.accent }]
            : [styles.bubbleAssistant, { backgroundColor: theme.card, borderColor: theme.border }],
        ]}>
          {item.content ? (
            <Text
              selectable
              style={[styles.bubbleText, { color: isUser ? theme.accentFg : theme.text }]}
            >
              {item.content}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={theme.accent} />
          )}

          {/* Thinking toggle */}
          {item.thinking && !isUser && (
            <ThinkToggle thinking={item.thinking} theme={theme} />
          )}

          {/* Artifact button */}
          {artifact && !isUser && (
            <TouchableOpacity
              style={[styles.artifactBtn, { backgroundColor: theme.accent + '20', borderColor: theme.accent }]}
              onPress={() => {
                setArtifactType(artifact.type);
                setArtifactSource(artifact.source);
                setArtifactTitle(`peek-${artifact.type}`);
                setArtifactVisible(true);
              }}
            >
              <Text style={[styles.artifactBtnText, { color: theme.accent }]}>
                {artifact.type === 'html' ? '⬜ Open HTML Artifact' : '📄 Open MD Artifact'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [theme]);

  // ── model gate ────────────────────────────────────────────
  if (noModelReady && !modelPickerVisible && downloadedModels.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.gateCenter}>
          <Text style={[styles.gateTitle, { color: theme.text }]}>No Models Downloaded</Text>
          <Text style={[styles.gateSub, { color: theme.textSecondary }]}>
            Download a model in Model Manager to start chatting.
          </Text>
          <TouchableOpacity
            style={[styles.gateBtn, { backgroundColor: theme.accent }]}
            onPress={() => navigation.navigate('Models')}
          >
            <Text style={[styles.gateBtnText, { color: theme.accentFg }]}>Go to Model Manager</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openHistory} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.headerIcon, { color: theme.textSecondary }]}>☰</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setModelPickerVisible(true)} style={styles.modelPill}>
          <Text style={[styles.modelPillText, { color: theme.text }]}>
            {loadedModelInfo?.name ?? 'Pick a model'} ▾
          </Text>
          {docName && (
            <Text style={[styles.docBadge, { color: theme.accent }]}> · {docName}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeBtn, { backgroundColor: mode === 'fast' ? theme.accent + '22' : theme.cardAlt }]}
          onPress={() => setMode(m => m === 'fast' ? 'deep' : 'fast')}
        >
          <Text style={[styles.modeBtnText, { color: mode === 'fast' ? theme.accent : theme.textSecondary }]}>
            {mode === 'fast' ? '⚡' : '🧠'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.msgList}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Peek Chat</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              {loadedModelInfo ? `${loadedModelInfo.name} ready` : 'Choose a model to start'}
            </Text>
          </View>
        }
      />

      {/* Doc ingesting loader */}
      {docIngesting && (
        <View style={[styles.docLoader, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <PeekLoader label="Indexing document…" size={32} />
        </View>
      )}

      {/* Input bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={handleDocAttach} style={styles.attachBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.attachIcon, { color: theme.textSecondary }]}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.cardAlt }]}
            placeholder="Message…"
            placeholderTextColor={theme.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          {generating ? (
            <TouchableOpacity
              onPress={() => { if (currentRunRef.current) cancel({ requestId: currentRunRef.current.requestId }).catch(() => {}); }}
              style={[styles.sendBtn, { backgroundColor: theme.error ?? '#e44' }]}
            >
              <Text style={styles.sendBtnText}>■</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.sendBtn, { backgroundColor: inputText.trim() ? theme.accent : theme.border }]}
              disabled={!inputText.trim() || !loadedModelId}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Model picker modal */}
      <ModelPickerModal
        visible={modelPickerVisible}
        models={downloadedModels}
        loadingModelId={modelLoading ? '' : null}
        progress={modelProgress}
        theme={theme}
        onSelect={loadModel_}
        onClose={() => { if (loadedModelId) setModelPickerVisible(false); }}
        onManage={() => { setModelPickerVisible(false); navigation.navigate('Models'); }}
      />

      {/* History modal */}
      <HistoryModal
        visible={histVisible}
        list={histList}
        theme={theme}
        onClose={() => setHistVisible(false)}
        onDelete={async (id) => {
          const { deleteConversation } = await import('../utils/v2storage');
          await deleteConversation(id);
          setHistList(prev => prev.filter(c => c.id !== id));
        }}
      />

      {/* Artifact panel */}
      <ArtifactPanel
        visible={artifactVisible}
        type={artifactType}
        source={artifactSource}
        title={artifactTitle}
        theme={theme}
        onClose={() => setArtifactVisible(false)}
      />
    </View>
  );
}

// ── ThinkToggle ────────────────────────────────────────────
function ThinkToggle({ thinking, theme }: { thinking: string; theme: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 6 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)}>
        <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
          {open ? 'Hide thoughts ▲' : 'View thoughts ▼'}
        </Text>
      </TouchableOpacity>
      {open && (
        <Text selectable style={{ color: theme.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
          {thinking}
        </Text>
      )}
    </View>
  );
}

// ── ModelPickerModal ───────────────────────────────────────
interface ModelPickerProps {
  visible: boolean; models: DownloadedModel[]; loadingModelId: string | null;
  progress: number; theme: any;
  onSelect: (m: DownloadedModel) => void; onClose: () => void; onManage: () => void;
}
function ModelPickerModal({ visible, models, loadingModelId, progress, theme, onSelect, onClose, onManage }: ModelPickerProps) {
  const slideY = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : 400, tension: 70, friction: 11, useNativeDriver: true }).start();
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.modelSheet, { backgroundColor: theme.card, transform: [{ translateY: slideY }] }]}>
          <View style={styles.sheetHandle}><View style={[styles.sheetHandleBar, { backgroundColor: theme.border }]} /></View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Choose a Model</Text>
          {models.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: theme.textSecondary, marginBottom: 16 }}>No text models downloaded.</Text>
              <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.accent }]} onPress={onManage}>
                <Text style={{ color: theme.accentFg, fontWeight: '700' }}>Download Models</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {models.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelRow, { borderBottomColor: theme.border }]}
                  onPress={() => onSelect(m)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modelRowName, { color: theme.text }]}>{m.name}</Text>
                    <Text style={[styles.modelRowSub, { color: theme.textSecondary }]}>{m.tagline ?? m.description ?? ''}</Text>
                  </View>
                  <Text style={[styles.modelRowSize, { color: theme.textSecondary }]}>{m.size}</Text>
                  {loadingModelId === null && <Text style={{ color: theme.accent, marginLeft: 8 }}>→</Text>}
                </TouchableOpacity>
              ))}
              {loadingModelId === null && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.accent} />
                  <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Loading… {Math.round(progress * 100)}%</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.manageBtn, { borderColor: theme.border }]} onPress={onManage}>
                <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Manage Models</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── HistoryModal ───────────────────────────────────────────
function HistoryModal({ visible, list, theme, onClose, onDelete }: { visible: boolean; list: V2Conversation[]; theme: any; onClose: () => void; onDelete: (id: string) => void }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.histRoot, { backgroundColor: theme.background }]}>
        <View style={[styles.histHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.histTitle, { color: theme.text }]}>Chat History</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: theme.accent, fontSize: 15 }}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView>
          {list.length === 0 && (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No history yet</Text>
          )}
          {list.map(c => (
            <View key={c.id} style={[styles.histRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>{c.title}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity onPress={() => onDelete(c.id)}>
                <Text style={{ color: theme.error ?? '#e44', fontSize: 13 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerIcon: { fontSize: 18, width: 36 },
  modelPill: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  modelPillText: { fontSize: 14, fontWeight: '700' },
  docBadge: { fontSize: 12 },
  modeBtn: { borderRadius: 8, padding: 6, width: 36, alignItems: 'center' },
  modeBtnText: { fontSize: 16 },
  msgList: { padding: 16, gap: 10, flexGrow: 1 },
  msgRow: { flexDirection: 'row', maxWidth: '88%' },
  msgRowLeft: { alignSelf: 'flex-start' },
  msgRowRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 18, padding: 12, maxWidth: '100%' },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  artifactBtn: {
    marginTop: 8, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  artifactBtnText: { fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14 },
  docLoader: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1,
  },
  attachBtn: { paddingBottom: 8 },
  attachIcon: { fontSize: 20 },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  gateCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  gateTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  gateSub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  gateBtn: { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  gateBtnText: { fontSize: 15, fontWeight: '700' },
  // Modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modelSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  sheetHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  sheetHandleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  modelRowName: { fontSize: 14, fontWeight: '700' },
  modelRowSub: { fontSize: 12, marginTop: 2 },
  modelRowSize: { fontSize: 12 },
  manageBtn: {
    margin: 16, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1,
  },
  // History
  histRoot: { flex: 1 },
  histHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  histTitle: { fontSize: 18, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
});
