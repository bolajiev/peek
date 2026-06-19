import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated,
  Modal, ScrollView, Image,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
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
const DOC_SYSTEM = `Answer based only on the provided context. If the answer is not in the context, say so clearly. Never fabricate information.\n\nCONTEXT:\n`;

// ── mdStyles used for assistant bubbles ───────────────────
const getMdStyles = (theme: any) => ({
  body: { color: theme.text, fontSize: 15, lineHeight: 22 } as any,
  heading1: { color: theme.text, fontWeight: '700', fontSize: 20, marginBottom: 6 } as any,
  heading2: { color: theme.text, fontWeight: '700', fontSize: 17, marginBottom: 4 } as any,
  heading3: { color: theme.text, fontWeight: '600', fontSize: 15, marginBottom: 2 } as any,
  paragraph: { color: theme.text, marginBottom: 4 } as any,
  code_block: { backgroundColor: theme.cardAlt, borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 12 } as any,
  code_inline: { backgroundColor: theme.cardAlt, borderRadius: 3, fontFamily: 'monospace', fontSize: 12 } as any,
  fence: { backgroundColor: theme.cardAlt, borderRadius: 6, padding: 10 } as any,
  blockquote: { backgroundColor: theme.cardAlt, borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 10 } as any,
  bullet_list_icon: { color: theme.accent } as any,
  strong: { fontWeight: '700', color: theme.text } as any,
  em: { fontStyle: 'italic', color: theme.text } as any,
  link: { color: theme.accent } as any,
  table: { borderColor: theme.border, borderWidth: 1, borderRadius: 4 } as any,
  th: { backgroundColor: theme.cardAlt, fontWeight: '700' } as any,
  td: { color: theme.text } as any,
  tr: { borderBottomColor: theme.border } as any,
});

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
  const [loadedModelId, setLoadedModelId] = useState('');
  const [loadedModelInfo, setLoadedModelInfo] = useState<DownloadedModel | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [noModelReady, setNoModelReady] = useState(true);

  // ── generation ────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const currentRunRef = useRef<{ requestId: string } | null>(null);

  // ── mode ──────────────────────────────────────────────────
  const [mode, setMode] = useState<FastDeep>('deep');

  // ── vision ────────────────────────────────────────────────
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const visionModelIdRef = useRef('');

  // ── RAG doc ───────────────────────────────────────────────
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

  // ── init ──────────────────────────────────────────────────
  useEffect(() => {
    syncModelsFromDisk().then(synced => {
      const textModels = synced.filter(m => m.modelType === 'text');
      setDownloadedModels(textModels);
      if (textModels.length > 0) {
        setModelPickerVisible(true);
      } else {
        setNoModelReady(false);
      }
    });
    return () => {
      if (embedIdRef.current) unloadModel({ modelId: embedIdRef.current }).catch(() => {});
      if (ragWsRef.current) ragCloseWorkspace({ workspace: ragWsRef.current }).catch(() => {});
      if (visionModelIdRef.current) unloadModel({ modelId: visionModelIdRef.current }).catch(() => {});
    };
  }, []);

  // ── load text model ───────────────────────────────────────
  const loadTextModel = useCallback(async (info: DownloadedModel) => {
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

  // ── load vision model ─────────────────────────────────────
  const ensureVisionModel = async (): Promise<string> => {
    if (visionModelIdRef.current) return visionModelIdRef.current;
    const allModels = await syncModelsFromDisk();
    const visionModel = allModels.find(m => m.id === MODEL_KEYS.VISION);
    if (!visionModel) throw new Error('Vision model not downloaded.\n\nGo to Model Manager and download SmolVLM2 to use image analysis.');
    if (!visionModel.projectionModelSrc) throw new Error('Vision model files incomplete. Try re-downloading.');
    const settings = await getSettings();
    const cfg: any = {
      ctx_size: 2048,
      device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu',
      projectionModelSrc: toPath(visionModel.projectionModelSrc),
    };
    const mid = await llmManager.ensure(visionModel, cfg);
    visionModelIdRef.current = mid;
    return mid;
  };

  // ── image attach ──────────────────────────────────────────
  const handleImageAttach = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const imgDir = new Directory(Paths.document, 'peek', 'chat-images');
      imgDir.create({ intermediates: true, idempotent: true });
      const ext = (asset.name ?? 'img').split('.').pop() ?? 'jpg';
      const dest = new File(imgDir, `img_${Date.now()}.${ext}`);
      new File(asset.uri).copy(dest);
      setPendingImageUri(dest.exists ? dest.uri : asset.uri);
    } catch {
      setPendingImageUri(asset.uri);
    }
  };

  // ── send ──────────────────────────────────────────────────
  const handleSend = () => {
    const t = inputText.trim();
    if (!t && !pendingImageUri) return;
    if (ragWsRef.current && !pendingImageUri) {
      sendWithRag(t || '(What does this document say?)');
    } else {
      sendMessage(t || '(Describe this image)', pendingImageUri ?? undefined);
    }
    setPendingImageUri(null);
  };

  const sendMessage = useCallback(async (text: string, imageUri?: string) => {
    if ((!loadedModelId && !imageUri) || generating) return;
    const userMsgId = newId();
    const assistantMsgId = newId();
    const userMsg: V2Message = {
      id: userMsgId, role: 'user', content: text,
      imagePath: imageUri, createdAt: new Date().toISOString(),
    };
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
      await persistConv(userMsg, text);

      let modelId = loadedModelId;
      if (imageUri) {
        try {
          modelId = await ensureVisionModel();
        } catch (e: any) {
          Alert.alert('Vision model needed', e?.message || 'Download SmolVLM2 first');
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
          return;
        }
      }

      const sysPrompt = imageUri
        ? 'You are Peek, a private on-device vision assistant. Describe and analyze the image clearly.'
        : SYSTEM_BASE + (mode === 'fast' ? FAST_SUFFIX : DEEP_SUFFIX);

      const history: any[] = messages.slice(-16).map(m => ({
        role: m.role,
        content: m.content.replace(/▍$/, ''),
        ...(m.imagePath ? { attachments: [{ path: toPath(m.imagePath) }] } : {}),
      }));
      const userEntry: any = { role: 'user', content: text };
      if (imageUri) userEntry.attachments = [{ path: toPath(imageUri) }];
      history.push(userEntry);

      let out = '';
      let thinking = '';
      const run = completion({
        modelId,
        history: [{ role: 'system', content: sysPrompt }, ...history],
        stream: true,
        captureThinking: mode === 'deep' && !imageUri,
        generationParams: { predict: imageUri ? 400 : (mode === 'fast' ? 256 : 600), temp: 0.7 },
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
        thinking: (finalThink && mode === 'deep') ? finalThink : undefined,
        artifactType: artifact?.type,
        artifactSource: artifact?.source,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? finalMsg : m));
      await persistConv(finalMsg, undefined);

      if (artifact) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => openArtifact(artifact.type, artifact.source), 400);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: 'Generation failed — tap to retry.' } : m));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        // Remove the empty assistant bubble on cancel
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === assistantMsgId && !last.content) return prev.slice(0, -1);
          return prev;
        });
      }
    } finally {
      setGenerating(false);
      currentRunRef.current = null;
    }
  }, [loadedModelId, generating, mode, messages]);

  // ── RAG send ──────────────────────────────────────────────
  const sendWithRag = useCallback(async (text: string) => {
    if (!loadedModelId || generating) return;
    const userMsgId = newId();
    const assistantMsgId = newId();
    const userMsg: V2Message = { id: userMsgId, role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg, { id: assistantMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString() }]);
    setInputText('');
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await persistConv(userMsg, text);
      const ctx = await ragSearch({ modelId: embedIdRef.current, query: text, workspace: ragWsRef.current, topK: 5 });
      const contextText = ctx.map((c: any) => c.text ?? c.content ?? c.chunk ?? '').join('\n\n');
      const sysPrompt = DOC_SYSTEM + contextText;
      let out = '';
      const run = completion({
        modelId: loadedModelId,
        history: [{ role: 'system', content: sysPrompt }, { role: 'user', content: text }],
        stream: true, captureThinking: false,
        generationParams: { predict: 400, temp: 0.3 },
      });
      currentRunRef.current = run;
      for await (const ev of run.events) {
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
      await persistConv(finalMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: 'Generation failed.' } : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
      currentRunRef.current = null;
    }
  }, [loadedModelId, generating]);

  // ── doc attach ────────────────────────────────────────────
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
    if (ext === 'doc') { Alert.alert('Format not supported', 'Save as .docx or .txt first.'); return; }

    setDocIngesting(true);
    try {
      const dir = new Directory(Paths.document, 'peek', 'chat-docs');
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, `doc_${Date.now()}_${asset.name}`);
      new File(asset.uri).copy(dest);
      const uri = dest.exists ? dest.uri : asset.uri;

      let content = '';
      if (ext === 'docx') content = await extractDocx(uri);
      else if (ext === 'pdf') content = await extractPdf(uri);
      else content = await new File(uri).text();
      if (!content || content.trim().length < 20) throw new Error('File too short or empty.');

      if (ragWsRef.current) { await ragCloseWorkspace({ workspace: ragWsRef.current }).catch(() => {}); }
      if (!embedIdRef.current) {
        embedIdRef.current = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
      }
      const wsName = `v2doc-${Date.now()}`;
      ragWsRef.current = wsName;
      const chunks = chunkText(content, 500, 50);
      await ragIngest({ modelId: embedIdRef.current, documents: chunks, workspace: wsName, chunk: false });
      setDocName(asset.name ?? 'document');
      const notice: V2Message = {
        id: newId(), role: 'assistant',
        content: `**${asset.name}** loaded (${chunks.length} chunks). Ask me anything about it.`,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, notice]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Load failed', e?.message || 'Unknown error');
    } finally {
      setDocIngesting(false);
    }
  };

  // ── artifact helpers ──────────────────────────────────────
  const openArtifact = (type: 'html' | 'md', source: string, title?: string) => {
    setArtifactType(type);
    setArtifactSource(source);
    setArtifactTitle(title ?? `peek-${type}-${Date.now()}`);
    setArtifactVisible(true);
  };

  // ── persistence ───────────────────────────────────────────
  const persistConv = async (msg: V2Message, firstUserText?: string) => {
    await appendMessage(convId, msg);
    const title = firstUserText?.slice(0, 60) ?? 'Chat';
    const conv: V2Conversation = {
      id: convId, screen: 'chat', title,
      modelId: loadedModelInfo?.id,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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
    try {
      const raw = await new File(uri).text();
      const matches = raw.match(/BT[\s\S]*?ET/g) || [];
      const texts = matches.flatMap(block =>
        (block.match(/\(([^)]*)\)/g) || []).map(s => s.slice(1, -1))
      );
      if (texts.join('').trim().length > 0) return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {}
    throw new Error('PDF text extraction failed. Use TXT or DOCX for best results.');
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

  // ── render message ────────────────────────────────────────
  const renderMessage = useCallback(({ item }: { item: V2Message }) => {
    const isUser = item.role === 'user';
    const isStreaming = item.content.endsWith('▍');
    const displayContent = isStreaming ? item.content.slice(0, -1) : item.content;
    const artifact = item.artifactType && item.artifactSource
      ? { type: item.artifactType, source: item.artifactSource } : null;
    const mdStyles = getMdStyles(theme);

    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: theme.accent }]
            : [styles.bubbleAssistant, { backgroundColor: theme.card, borderColor: theme.border }],
        ]}>
          {/* Image thumbnail (user only) */}
          {item.imagePath && isUser && (
            <Image source={{ uri: item.imagePath }} style={styles.imgThumb} resizeMode="cover" />
          )}

          {/* Content */}
          {!displayContent && !item.imagePath ? (
            <ActivityIndicator size="small" color={isUser ? theme.accentFg : theme.accent} />
          ) : isUser ? (
            displayContent ? <Text style={[styles.bubbleTextUser, { color: theme.accentFg }]}>{displayContent}</Text> : null
          ) : (
            <View>
              {displayContent ? (
                <Markdown style={mdStyles}>{displayContent}</Markdown>
              ) : null}
              {isStreaming && <Text style={{ color: theme.accent }}>▍</Text>}
            </View>
          )}

          {/* Thinking toggle — Deep mode only */}
          {item.thinking && !isUser && mode === 'deep' && (
            <ThinkToggle thinking={item.thinking} theme={theme} />
          )}

          {/* Artifact button */}
          {artifact && !isUser && (
            <TouchableOpacity
              style={[styles.artifactBtn, { backgroundColor: theme.accent + '18', borderColor: theme.accent }]}
              onPress={() => openArtifact(artifact.type as 'html' | 'md', artifact.source)}
            >
              <Text style={[styles.artifactBtnText, { color: theme.accent }]}>
                {artifact.type === 'html' ? '⬜ Open HTML Artifact' : '📄 Open MD Artifact'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Copy on long-press: handled via selectable text */}
        </View>
      </View>
    );
  }, [theme, mode]);

  // ── no models gate ────────────────────────────────────────
  if (noModelReady && !modelPickerVisible && downloadedModels.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.gateCenter}>
          <Text style={[styles.gateTitle, { color: theme.text }]}>No Models Downloaded</Text>
          <Text style={[styles.gateSub, { color: theme.textSecondary }]}>
            Download a text model to start chatting.
          </Text>
          <TouchableOpacity style={[styles.gateBtn, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('Models')}>
            <Text style={[styles.gateBtnText, { color: theme.accentFg }]}>Go to Model Manager</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const canSend = (inputText.trim() || pendingImageUri) && !generating && (loadedModelId || !!pendingImageUri);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openHistory} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.headerMenuIcon, { color: theme.textSecondary }]}>☰</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setModelPickerVisible(true)} style={styles.modelPill}>
          <View style={[styles.modelDot, { backgroundColor: loadedModelId ? theme.accent : theme.border }]} />
          <Text style={[styles.modelPillText, { color: theme.text }]} numberOfLines={1}>
            {loadedModelInfo?.name ?? 'Pick a model'} ▾
          </Text>
          {docName && <Text style={[styles.docBadge, { color: theme.accent }]}> · {docName}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeBtn, { backgroundColor: mode === 'fast' ? theme.accent + '22' : theme.cardAlt }]}
          onPress={() => setMode(m => m === 'fast' ? 'deep' : 'fast')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.modeBtnText]}>{mode === 'fast' ? '⚡' : '🧠'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={flatRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.msgList, messages.length === 0 && styles.msgListEmpty]}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Peek Chat</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              {loadedModelId
                ? `${loadedModelInfo?.name} ready. Attach a doc 📎 or image 📷, or just ask.`
                : 'Pick a model above to start.'}
            </Text>
            {loadedModelId && (
              <View style={styles.tipRow}>
                {['BMI calculator', 'Meal plan table', 'Budget tracker'].map(tip => (
                  <TouchableOpacity
                    key={tip}
                    style={[styles.tipChip, { borderColor: theme.border, backgroundColor: theme.card }]}
                    onPress={() => { setInputText(`Create a ${tip} as an HTML artifact`); }}
                  >
                    <Text style={[styles.tipText, { color: theme.textSecondary }]}>{tip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        }
      />

      {/* Pending image preview strip */}
      {pendingImageUri && (
        <View style={[styles.pendingImgStrip, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Image source={{ uri: pendingImageUri }} style={styles.pendingThumb} resizeMode="cover" />
          <Text style={[styles.pendingLabel, { color: theme.textSecondary }]}>Image ready — tap ↑ to send</Text>
          <TouchableOpacity onPress={() => setPendingImageUri(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Doc ingesting */}
      {docIngesting && (
        <View style={[styles.docLoaderBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <PeekLoader label="Indexing document…" size={28} />
        </View>
      )}

      {/* ── Input bar ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={handleDocAttach} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.attachIcon, { color: theme.textSecondary }]}>📎</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleImageAttach} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.attachIcon, { color: theme.textSecondary }]}>📷</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.cardAlt }]}
            placeholder={pendingImageUri ? 'Ask about this image…' : 'Message…'}
            placeholderTextColor={theme.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
            blurOnSubmit={false}
          />
          {generating ? (
            <TouchableOpacity
              onPress={() => { if (currentRunRef.current) cancel({ requestId: currentRunRef.current.requestId }).catch(() => {}); }}
              style={[styles.sendBtn, { backgroundColor: '#e44' }]}
            >
              <Text style={styles.sendBtnText}>■</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.sendBtn, { backgroundColor: canSend ? theme.accent : theme.border }]}
              disabled={!canSend}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Model picker ── */}
      <ModelPickerModal
        visible={modelPickerVisible}
        models={downloadedModels}
        modelLoading={modelLoading}
        progress={modelProgress}
        theme={theme}
        onSelect={loadTextModel}
        onClose={() => { if (loadedModelId) setModelPickerVisible(false); }}
        onManage={() => { setModelPickerVisible(false); navigation.navigate('Models'); }}
      />

      {/* ── History ── */}
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

      {/* ── Artifact panel ── */}
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
    <View style={{ marginTop: 8 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
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
  visible: boolean; models: DownloadedModel[]; modelLoading: boolean;
  progress: number; theme: any;
  onSelect: (m: DownloadedModel) => void; onClose: () => void; onManage: () => void;
}
function ModelPickerModal({ visible, models, modelLoading, progress, theme, onSelect, onClose, onManage }: ModelPickerProps) {
  const slideY = useRef(new Animated.Value(500)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : 500, tension: 70, friction: 11, useNativeDriver: true }).start();
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.modelSheet, { backgroundColor: theme.card, transform: [{ translateY: slideY }] }]}>
          <View style={styles.sheetHandle}><View style={[styles.sheetHandleBar, { backgroundColor: theme.border }]} /></View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Choose a Model</Text>
          <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>No default — you pick. SmolVLM2 auto-loads with images.</Text>
          {models.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: theme.textSecondary, marginBottom: 16, textAlign: 'center' }}>No text models downloaded yet.</Text>
              <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.accent }]} onPress={onManage}>
                <Text style={{ color: theme.accentFg, fontWeight: '700' }}>Download Models →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {models.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelRow, { borderBottomColor: theme.border }]}
                  onPress={() => !modelLoading && onSelect(m)}
                  disabled={modelLoading}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modelRowName, { color: theme.text }]}>{m.name}</Text>
                    <Text style={[styles.modelRowSub, { color: theme.textSecondary }]}>{m.tagline ?? m.description ?? ''}</Text>
                  </View>
                  <Text style={[styles.modelRowSize, { color: theme.textSecondary }]}>{m.size}</Text>
                  {!modelLoading && <Text style={{ color: theme.accent, marginLeft: 8 }}>→</Text>}
                </TouchableOpacity>
              ))}
              {modelLoading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.accent} />
                  <Text style={{ color: theme.textSecondary, marginLeft: 10 }}>
                    Loading… {Math.round(progress * 100)}%
                  </Text>
                </View>
              )}
              <TouchableOpacity style={[styles.manageBtn, { borderColor: theme.border, marginTop: 8 }]} onPress={onManage}>
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
function HistoryModal({ visible, list, theme, onClose, onDelete }: {
  visible: boolean; list: V2Conversation[]; theme: any;
  onClose: () => void; onDelete: (id: string) => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.histRoot, { backgroundColor: theme.background }]}>
        <View style={[styles.histHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.histTitle, { color: theme.text }]}>Chat History</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: theme.accent, fontSize: 15 }}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView>
          {list.length === 0 && <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No history yet</Text>}
          {list.map(c => (
            <View key={c.id} style={[styles.histRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>{c.title}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity onPress={() => onDelete(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: '#e44', fontSize: 13 }}>Delete</Text>
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
  headerMenuIcon: { fontSize: 18, width: 36, textAlign: 'left' },
  modelPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingHorizontal: 8,
  },
  modelDot: { width: 7, height: 7, borderRadius: 3.5 },
  modelPillText: { fontSize: 14, fontWeight: '700' },
  docBadge: { fontSize: 11, fontWeight: '600' },
  modeBtn: { borderRadius: 8, padding: 6, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  modeBtnText: { fontSize: 16 },
  msgList: { padding: 14, gap: 10 },
  msgListEmpty: { flexGrow: 1 },
  msgRow: { maxWidth: '88%' },
  msgRowLeft: { alignSelf: 'flex-start' },
  msgRowRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 18, padding: 12 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleTextUser: { fontSize: 15, lineHeight: 22 },
  imgThumb: { width: '100%', height: 160, borderRadius: 10, marginBottom: 8 },
  artifactBtn: { marginTop: 10, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  artifactBtnText: { fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tipChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  tipText: { fontSize: 12, fontWeight: '500' },
  pendingImgStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1,
  },
  pendingThumb: { width: 44, height: 44, borderRadius: 8 },
  pendingLabel: { flex: 1, fontSize: 12 },
  docLoaderBar: { paddingVertical: 10, alignItems: 'center', borderTopWidth: 1 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1,
  },
  attachIcon: { fontSize: 20, paddingBottom: 8 },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },
  gateCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  gateTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  gateSub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  gateBtn: { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  gateBtnText: { fontSize: 15, fontWeight: '700' },
  // Modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modelSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  sheetHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  sheetHandleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  sheetSub: { fontSize: 12, paddingHorizontal: 20, paddingBottom: 10 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modelRowName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  modelRowSub: { fontSize: 12 },
  modelRowSize: { fontSize: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'center' },
  manageBtn: { marginHorizontal: 16, marginTop: 4, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  // History
  histRoot: { flex: 1 },
  histHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  histTitle: { fontSize: 18, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
