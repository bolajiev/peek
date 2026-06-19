import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView,
  Alert, AppState, Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { transcribeStream, completion, InferenceCancelledError } from '@qvac/sdk';
import { whisperManager, llmManager } from '../utils/modelManager';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, toPath, syncModelsFromDisk } from '../utils/storage';
import { MODEL_KEYS } from '../utils/models';
import { Paths, File, Directory } from 'expo-file-system';
import {
  V2Message, V2Conversation, newId, stripThink,
  listConversations, saveConversation, getMessages, appendMessage, deleteConversation,
} from '../utils/v2storage';
import PeekLoader from '../components/PeekLoader';
import ResultActions from '../components/ResultActions';
import MarkdownText from '../components/MarkdownText';
import { useNavigation } from '@react-navigation/native';

type Phase = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'summarizing' | 'done';

const BAR_COUNT = 7;
const WAVE_PERIODS = [320, 260, 200, 280, 240, 300, 220];

const EXPLAIN_SYSTEM = `You are a helpful assistant. Read the following transcript and explain the key ideas clearly and directly in 3-5 sentences. Do not use bullet points. Write as flowing prose. Be informative and concise.`;

export default function V2VoiceScreen() {
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const navigation = useNavigation<any>();

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [explanation, setExplanation] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [whisperReady, setWhisperReady] = useState(false);
  const [loaderLabel, setLoaderLabel] = useState('Transcribing…');
  const [histVisible, setHistVisible] = useState(false);
  const [histList, setHistList] = useState<V2Conversation[]>([]);
  const [currentConvId] = useState(() => newId());

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopsRef = useRef<Animated.CompositeAnimation[]>([]);
  const chunkQueueRef = useRef<string[]>([]);
  const chunkProcessingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const liveScrollRef = useRef<ScrollView>(null);
  const phaseRef = useRef<Phase>('idle');
  const autoExplainRef = useRef(false);
  const transcriptRef = useRef('');

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    whisperManager.ensure().then(() => setWhisperReady(true)).catch(() => {});
    return () => {
      clearTimers();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Auto-explain when transcript phase is set
  useEffect(() => {
    if (phase === 'transcript' && autoExplainRef.current && transcriptRef.current) {
      autoExplainRef.current = false;
      handleExplain();
    }
  }, [phase]);

  const clearTimers = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
  };

  // ── Waveform ──────────────────────────────────────────────
  const startWave = () => {
    waveLoopsRef.current = waveAnims.map((anim, i) => {
      const period = WAVE_PERIODS[i];
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(anim, { toValue: 0.15 + (i % 3) * 0.3, duration: period, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5 + (i % 2) * 0.4, duration: period, useNativeDriver: true }),
      ]));
      loop.start();
      return loop;
    });
  };

  const stopWave = () => {
    waveLoopsRef.current.forEach(l => l.stop());
    waveAnims.forEach(a => a.setValue(0.3));
  };

  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    pulseLoopRef.current.start();
  };

  const stopPulse = () => { pulseLoopRef.current?.stop(); pulseAnim.setValue(1); };

  // ── Chunk handling ────────────────────────────────────────
  const saveChunkToDir = async (cacheUri: string): Promise<string | null> => {
    try {
      const dir = new Directory(Paths.document, 'peek', 'v2-recordings');
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, `chunk_${Date.now()}.m4a`);
      new File(cacheUri).copy(dest);
      return dest.exists ? dest.uri : cacheUri;
    } catch { return cacheUri; }
  };

  const processChunkQueue = useCallback(async () => {
    if (chunkProcessingRef.current) return;
    chunkProcessingRef.current = true;
    const wId = await whisperManager.ensure().catch(() => null);
    if (!wId) { chunkProcessingRef.current = false; return; }
    while (chunkQueueRef.current.length > 0) {
      const uri = chunkQueueRef.current.shift()!;
      try {
        const gen = transcribeStream({ modelId: wId, audioChunk: toPath(uri) });
        let text = '';
        for await (const chunk of gen) { text += chunk; }
        if (text.trim()) {
          setTranscript(prev => {
            const next = (prev ? prev + ' ' : '') + text.trim();
            transcriptRef.current = next;
            return next;
          });
          setTimeout(() => liveScrollRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } catch {}
    }
    chunkProcessingRef.current = false;
    if (isStoppingRef.current && chunkQueueRef.current.length === 0) {
      isStoppingRef.current = false;
      setPhase('transcript');
    }
  }, []);

  const rotateChunk = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    await rec.stopAndUnloadAsync().catch(() => {});
    const cacheUri = rec.getURI();
    recordingRef.current = null;
    try {
      const newRec = new Audio.Recording();
      await newRec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRec.startAsync();
      recordingRef.current = newRec;
    } catch {}
    if (cacheUri) {
      const saved = await saveChunkToDir(cacheUri);
      if (saved) { chunkQueueRef.current.push(saved); processChunkQueue(); }
    }
  };

  // ── Record ────────────────────────────────────────────────
  const handleRecord = async () => {
    if (phase === 'recording') { await stopRecording(); return; }
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { Alert.alert('Permission needed', 'Microphone access required.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    recordingRef.current = rec;
    chunkQueueRef.current = [];
    chunkProcessingRef.current = false;
    isStoppingRef.current = false;
    setTranscript('');
    setExplanation('');
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    chunkTimerRef.current = setInterval(rotateChunk, 5000);
    setPhase('recording');
    startPulse();
    startWave();
  };

  const stopRecording = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopPulse();
    stopWave();
    clearTimers();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      await rec.stopAndUnloadAsync().catch(() => {});
      const cacheUri = rec.getURI();
      if (cacheUri) {
        const saved = await saveChunkToDir(cacheUri);
        if (saved) chunkQueueRef.current.push(saved);
      }
    }
    autoExplainRef.current = true;
    isStoppingRef.current = true;
    setLoaderLabel('Finalizing transcript…');
    if (chunkQueueRef.current.length === 0 && !chunkProcessingRef.current) {
      isStoppingRef.current = false;
      if (!transcriptRef.current) autoExplainRef.current = false;
      setPhase('transcript');
    } else {
      setPhase('transcribing');
      processChunkQueue();
    }
  };

  // ── Upload ────────────────────────────────────────────────
  const handleUpload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    setPhase('transcribing');
    setLoaderLabel('Transcribing…');
    setTranscript('');
    setExplanation('');
    autoExplainRef.current = true;
    try {
      const dir = new Directory(Paths.document, 'peek', 'v2-recordings');
      dir.create({ intermediates: true, idempotent: true });
      const ext = picked.name?.split('.').pop() ?? 'm4a';
      const destFile = new File(dir, `upload_${Date.now()}.${ext}`);
      new File(picked.uri).copy(destFile);
      const uri = destFile.exists ? destFile.uri : picked.uri;
      const wId = await whisperManager.ensure();
      let text = '';
      const gen = transcribeStream({ modelId: wId, audioChunk: toPath(uri) });
      for await (const chunk of gen) { text += chunk; }
      const clean = text.trim() || '(No speech detected)';
      transcriptRef.current = clean;
      setTranscript(clean);
      setPhase('transcript');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Transcription failed', err?.message || 'Unknown error');
      setPhase('idle');
    }
  };

  // ── Explain ───────────────────────────────────────────────
  const handleExplain = async () => {
    const tx = transcriptRef.current;
    if (!tx || tx === '(No speech detected)') return;
    setPhase('summarizing');
    setExplanation('');
    try {
      const synced = await syncModelsFromDisk();
      const textModel = synced.find(m => m.id === MODEL_KEYS.TEXT_HEALTH)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_FAST)
        ?? synced.find(m => m.modelType === 'text');
      if (!textModel) { setPhase('done'); return; }
      const settings = await getSettings();
      const mid = await llmManager.ensure(textModel, { ctx_size: 1024, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' });
      let out = '';
      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: EXPLAIN_SYSTEM },
          { role: 'user', content: tx },
        ],
        stream: true, captureThinking: false,
        generationParams: { predict: 200, temp: 0.4 },
      });
      for await (const ev of run.events) {
        const e = ev as any;
        if (e.type === 'contentDelta') {
          out += e.text;
          const { text: clean } = stripThink(out);
          setExplanation(clean + '▍');
        }
      }
      const { text: final } = stripThink(out);
      setExplanation(final.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // persist
      await persistSession(tx, final.trim());
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setPhase('done');
    }
  };

  const persistSession = async (tx: string, expl: string) => {
    const t1: V2Message = { id: newId(), role: 'user', content: `[Voice transcript]\n${tx}`, createdAt: new Date().toISOString() };
    const t2: V2Message = { id: newId(), role: 'assistant', content: expl, createdAt: new Date().toISOString() };
    await appendMessage(currentConvId, t1);
    await appendMessage(currentConvId, t2);
    const conv: V2Conversation = {
      id: currentConvId, screen: 'voice',
      title: tx.slice(0, 60) || 'Voice session',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await saveConversation(conv);
  };

  const reset = () => {
    stopPulse(); stopWave(); clearTimers();
    setTranscript(''); setExplanation('');
    transcriptRef.current = ''; autoExplainRef.current = false;
    setPhase('idle');
  };

  const openHistory = async () => {
    const list = await listConversations('voice');
    setHistList(list);
    setHistVisible(true);
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerBrand}>
          <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.brandName, { color: theme.text }]}>Peek Voice</Text>
        </View>
        <View style={styles.headerRight}>
          {phase !== 'idle' && (
            <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }]}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openHistory} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[{ color: theme.textSecondary, fontSize: 18 }]}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <View style={styles.idleBody}>
          <View style={styles.idleHero}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Voice AI</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              Record or upload audio. Get a live transcript and AI explanation.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={handleRecord}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, { color: theme.accentFg }]}>
              {whisperReady ? '⏺ Record Now' : 'Loading Whisper…'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: theme.border }]}
            onPress={handleUpload}
            activeOpacity={0.75}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>⬆ Upload Audio File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Recording ── */}
      {phase === 'recording' && (
        <View style={styles.recordPane}>
          <View style={[styles.recBar, { borderBottomColor: theme.border }]}>
            <Animated.View style={[styles.recDot, { backgroundColor: theme.error ?? '#e44', transform: [{ scale: pulseAnim }] }]} />
            <Text style={[styles.recLabel, { color: theme.error ?? '#e44' }]}>REC</Text>
            <Text style={[styles.recTimer, { color: theme.text }]}>{fmtTime(recordingTime)}</Text>
            <View style={styles.waveBox}>
              {waveAnims.map((anim, i) => (
                <Animated.View key={i} style={[styles.waveBar, { backgroundColor: theme.accent, transform: [{ scaleY: anim }] }]} />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.stopBtn, { backgroundColor: theme.error ?? '#e44' }]}
              onPress={stopRecording}
            >
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </View>
          <ScrollView ref={liveScrollRef} style={styles.liveScroll} contentContainerStyle={styles.liveContent}>
            {transcript ? (
              <Text style={[styles.liveText, { color: theme.text }]}>{transcript}<Text style={{ color: theme.accent }}>▍</Text></Text>
            ) : (
              <Text style={[styles.liveEmpty, { color: theme.textSecondary }]}>Speak now — transcript appears here</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Transcribing ── */}
      {phase === 'transcribing' && (
        <View style={styles.loaderPane}>
          <PeekLoader label={loaderLabel} />
        </View>
      )}

      {/* ── Transcript + Explanation (transcript / summarizing / done) ── */}
      {(phase === 'transcript' || phase === 'summarizing' || phase === 'done') && (
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
          {/* Transcript */}
          <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>TRANSCRIPT</Text>
          <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text selectable style={[styles.resultText, { color: theme.text }]}>{transcript}</Text>
          </View>
          <ResultActions text={transcript} title={`peek-voice-transcript-${Date.now()}`} theme={theme} />

          {/* Explanation */}
          <View style={[styles.sectionRow, { marginTop: 24 }]}>
            <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>EXPLANATION</Text>
            {phase === 'summarizing' && (
              <Text style={[styles.genLabel, { color: theme.accent }]}>Generating…</Text>
            )}
          </View>

          {phase === 'done' && explanation ? (
            <>
              <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text selectable style={[styles.resultText, { color: theme.text }]}>{explanation}</Text>
              </View>
              <ResultActions text={explanation} title={`peek-voice-explain-${Date.now()}`} theme={theme} />
            </>
          ) : phase === 'done' && !explanation ? (
            <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.resultText, { color: theme.textSecondary }]}>Download a text model to enable AI explanations.</Text>
            </View>
          ) : phase === 'summarizing' ? (
            <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.resultText, { color: theme.text }]}>
                {explanation || ''}
                <Text style={{ color: theme.accent }}>▍</Text>
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.chatBtn, { borderColor: theme.border }]}
            onPress={() => navigation.navigate('V2Chat', { seedText: transcript })}
            activeOpacity={0.75}
          >
            <Text style={[styles.chatBtnText, { color: theme.accent }]}>Continue in Chat →</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* History modal */}
      <Modal visible={histVisible} animationType="slide" onRequestClose={() => setHistVisible(false)}>
        <View style={[styles.histRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.histHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.histTitle, { color: theme.text }]}>Voice History</Text>
            <TouchableOpacity onPress={() => setHistVisible(false)}>
              <Text style={{ color: theme.accent, fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {histList.length === 0 && (
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No sessions yet</Text>
            )}
            {histList.map(c => (
              <View key={c.id} style={[styles.histRow, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{c.title}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity onPress={async () => { await deleteConversation(c.id); setHistList(prev => prev.filter(x => x.id !== c.id)); }}>
                  <Text style={{ color: theme.error ?? '#e44', fontSize: 13 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 13, borderBottomWidth: 1,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 3.5 },
  brandName: { fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  // idle
  idleBody: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  idleHero: { marginBottom: 12 },
  heroTitle: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  heroSub: { fontSize: 14, lineHeight: 21 },
  primaryBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  // recording
  recordPane: { flex: 1 },
  recBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  recTimer: { fontSize: 17, fontWeight: '300', letterSpacing: 1, minWidth: 52 },
  waveBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 34, gap: 3 },
  waveBar: { width: 3, height: 30, borderRadius: 2 },
  stopBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  stopBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  liveScroll: { flex: 1 },
  liveContent: { padding: 20, flexGrow: 1 },
  liveText: { fontSize: 17, lineHeight: 28 },
  liveEmpty: { marginTop: 80, textAlign: 'center', fontSize: 14 },
  // loader
  loaderPane: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  // result
  resultScroll: { flex: 1 },
  resultContent: { padding: 20, paddingTop: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionHead: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  genLabel: { fontSize: 11, fontWeight: '600' },
  resultBox: { borderRadius: 14, borderWidth: 1, padding: 16 },
  resultText: { fontSize: 15, lineHeight: 23 },
  chatBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  chatBtnText: { fontSize: 14, fontWeight: '700' },
  // history
  histRoot: { flex: 1 },
  histHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  histTitle: { fontSize: 18, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
});
