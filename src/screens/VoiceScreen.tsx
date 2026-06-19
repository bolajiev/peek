import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert, AppState,
} from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { transcribeStream, completion, InferenceCancelledError } from '@qvac/sdk';
import { whisperManager, llmManager } from '../utils/modelManager';
import { showRunningNotification, showDoneNotification, clearInferenceNotifications } from '../utils/bgNotification';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, toPath, syncModelsFromDisk } from '../utils/storage';
import { SYSTEM_PROMPTS, MODEL_KEYS } from '../utils/models';
import { Paths, File, Directory } from 'expo-file-system';
import { IconVoice, IconUpload, IconMic, IconBack } from '../components/Icons';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';

type Phase = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'summarizing';

export default function VoiceScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [initError, setInitError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);
  const [whisperReady, setWhisperReady] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const chunkQueueRef = useRef<string[]>([]);
  const chunkProcessingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const liveScrollRef = useRef<ScrollView>(null);
  const phaseRef = useRef<Phase>('idle');

  // Keep phaseRef in sync so AppState listener always sees current phase
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    whisperManager.ensure()
      .then(() => setWhisperReady(true))
      .catch(() => {});
    const appStateSub = AppState.addEventListener('change', state => {
      const p = phaseRef.current;
      if (state === 'background' && (p === 'recording' || p === 'transcribing' || p === 'summarizing')) {
        showRunningNotification('Peek Voice');
      } else if (state === 'active') {
        clearInferenceNotifications();
      }
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      appStateSub.remove();
      clearInferenceNotifications();
    };
  }, []);

  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    pulseLoopRef.current.start();
  };

  const stopPulse = () => {
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
  };

  const saveChunkToDir = async (cacheUri: string): Promise<string | null> => {
    try {
      const recsDir = new Directory(Paths.document, 'peek', 'recordings');
      recsDir.create({ intermediates: true, idempotent: true });
      const dest = new File(recsDir, `chunk_${Date.now()}.m4a`);
      new File(cacheUri).copy(dest);
      return dest.exists ? dest.uri : cacheUri;
    } catch {
      return cacheUri;
    }
  };

  const processChunkQueue = async () => {
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
          setTranscript(prev => (prev ? prev + ' ' : '') + text.trim());
          setTimeout(() => liveScrollRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } catch {}
    }

    chunkProcessingRef.current = false;
    if (isStoppingRef.current && chunkQueueRef.current.length === 0) {
      isStoppingRef.current = false;
      setPhase('transcript');
    }
  };

  const rotateChunk = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    // Stop current chunk
    await rec.stopAndUnloadAsync().catch(() => {});
    const cacheUri = rec.getURI();
    recordingRef.current = null;

    // Start next recording immediately
    try {
      const newRec = new Audio.Recording();
      await newRec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRec.startAsync();
      recordingRef.current = newRec;
    } catch {}

    // Queue finished chunk
    if (cacheUri) {
      const savedUri = await saveChunkToDir(cacheUri);
      if (savedUri) {
        chunkQueueRef.current.push(savedUri);
        processChunkQueue();
      }
    }
  };

  const handleRecord = async () => {
    if (phase === 'recording') { await stopRecording(); return; }
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { Alert.alert('Permission needed', 'Microphone access is required to record.'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    recordingRef.current = rec;
    chunkQueueRef.current = [];
    chunkProcessingRef.current = false;
    isStoppingRef.current = false;
    setTranscript('');
    setSummary('');
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    chunkTimerRef.current = setInterval(rotateChunk, 5000);
    setPhase('recording');
    startPulse();
  };

  const stopRecording = async () => {
    stopPulse();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }

    const rec = recordingRef.current;
    recordingRef.current = null;

    if (rec) {
      await rec.stopAndUnloadAsync().catch(() => {});
      const cacheUri = rec.getURI();
      if (cacheUri) {
        const savedUri = await saveChunkToDir(cacheUri);
        if (savedUri) chunkQueueRef.current.push(savedUri);
      }
    }

    isStoppingRef.current = true;

    if (chunkQueueRef.current.length === 0 && !chunkProcessingRef.current) {
      isStoppingRef.current = false;
      setPhase('transcript');
    } else {
      setPhase('transcribing');
      processChunkQueue();
    }
  };

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    try {
      const recsDir = new Directory(Paths.document, 'peek', 'recordings');
      recsDir.create({ intermediates: true, idempotent: true });
      const ext = picked.name?.split('.').pop() ?? 'm4a';
      const destFile = new File(recsDir, `upload_${Date.now()}.${ext}`);
      new File(picked.uri).copy(destFile);
      await doTranscribeFile(destFile.exists ? destFile.uri : picked.uri);
    } catch {
      await doTranscribeFile(picked.uri);
    }
  };

  const doTranscribeFile = async (uri: string) => {
    setPhase('transcribing');
    setTranscript('');
    setSummary('');
    setTranscribeElapsed(0);
    transcribeTimerRef.current = setInterval(() => setTranscribeElapsed(t => t + 1), 1000);
    try {
      const wId = await whisperManager.ensure();
      let text = '';
      let firstChunk = true;
      const gen = transcribeStream({ modelId: wId, audioChunk: toPath(uri) });
      for await (const chunk of gen) {
        text += chunk;
        if (firstChunk) { firstChunk = false; setPhase('transcript'); }
        setTranscript(text);
      }
      if (!text.trim()) { setTranscript('(No speech detected)'); setPhase('transcript'); }
    } catch (err: any) {
      setInitError(err?.message || 'Transcription failed');
      setPhase('idle');
    } finally {
      if (transcribeTimerRef.current) { clearInterval(transcribeTimerRef.current); transcribeTimerRef.current = null; }
    }
  };

  const handleSummarize = async () => {
    if (!transcript) return;
    setPhase('summarizing');
    setSummary('');
    try {
      const synced = await syncModelsFromDisk();
      const textModel = synced.find(m => m.id === MODEL_KEYS.TEXT_HEALTH)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_FAST)
        ?? synced.find(m => m.modelType === 'text');

      if (!textModel) {
        setPhase('transcript');
        Alert.alert(
          'Text model needed',
          'Download a text model (MedPsy or Qwen 2.5) to use AI summarization.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Download', onPress: () => navigation.navigate('Download', { modelId: MODEL_KEYS.TEXT_HEALTH, returnTo: 'Voice', returnParams: {} }) },
          ],
        );
        return;
      }

      const settings = await getSettings();
      const modelConfig: any = { ctx_size: 1024, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
      const mid = await llmManager.ensure(textModel, modelConfig);

      let out = '';
      let firstToken = true;
      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: SYSTEM_PROMPTS.voice },
          { role: 'user', content: transcript },
        ],
        stream: true,
        captureThinking: true,
        generationParams: { predict: 500, temp: 0.3, top_k: 20 },
      });

      for await (const ev of run.events) {
        if ((ev as any).type === 'contentDelta') {
          out += (ev as any).text;
          if (firstToken) {
            firstToken = false;
            setPhase('transcript');
          }
          setSummary(out + '▍');
        }
        // thinkingDelta intentionally ignored — keeps thinking out of summary
      }
      setSummary(out.trim() || "Couldn't summarize. Transcript is still saved.");
      if (AppState.currentState !== 'active') showDoneNotification('Peek Voice');
      else clearInferenceNotifications();
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) setSummary("Couldn't summarize. Transcript is still saved.");
      setPhase('transcript');
      clearInferenceNotifications();
    }
  };

  const reset = () => {
    setTranscript(''); setSummary(''); setInitError(null); setPhase('idle');
  };

  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

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
        {phase !== 'idle'
          ? <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.resetBtn, { color: theme.textSecondary }]}>Reset</Text>
            </TouchableOpacity>
          : <View style={{ width: 44 }} />}
      </View>

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <>
          <View style={[styles.hero, { borderBottomColor: theme.border }]}>
            <View style={[styles.heroIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <IconVoice size={26} color={theme.text} strokeWidth={1.6} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>Peek Voice</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Record or upload audio. Get a transcript and summary.</Text>
            {initError
              ? <Text selectable style={[styles.errText, { color: theme.error }]}>{initError}</Text>
              : null}
          </View>

          <View style={styles.body}>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: theme.accent }]}
              onPress={handleRecord}
              activeOpacity={0.85}
            >
              <View style={[styles.primaryActionIcon, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                <IconMic size={20} color={theme.accentFg} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: theme.accentFg }]}>Record Now</Text>
                <Text style={[styles.actionSub, { color: theme.accentFg + 'BB' }]}>
                  {whisperReady ? 'Whisper ready · tap to start' : 'Loading Whisper model…'}
                </Text>
              </View>
              {whisperReady && <View style={[styles.readyDot, { backgroundColor: theme.accentFg }]} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handleUpload}
              activeOpacity={0.72}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.cardAlt }]}>
                <IconUpload size={18} color={theme.text} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Upload Audio File</Text>
                <Text style={[styles.actionSub, { color: theme.textSecondary }]}>MP3, WAV, M4A supported</Text>
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Recording (with live transcript) ── */}
      {phase === 'recording' && (
        <View style={styles.recordingPane}>
          <View style={[styles.recordBar, { borderBottomColor: theme.border }]}>
            <Animated.View style={[styles.recordRingSmall, { borderColor: theme.error, transform: [{ scale: pulseAnim }] }]}>
              <View style={[styles.recordSquareSmall, { backgroundColor: theme.error }]} />
            </Animated.View>
            <Text style={[styles.recordTimeSmall, { color: theme.text }]}>{fmtTime(recordingTime)}</Text>
            <Text style={[styles.recordingLabel, { color: theme.error }]}>● REC</Text>
            <TouchableOpacity
              style={[styles.stopBtnSmall, { backgroundColor: theme.error }]}
              onPress={stopRecording}
              activeOpacity={0.85}
            >
              <Text style={[styles.stopBtnText, { color: '#fff' }]}>Stop</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={liveScrollRef}
            style={styles.liveTranscriptScroll}
            contentContainerStyle={styles.liveTranscriptContent}
            showsVerticalScrollIndicator={false}
          >
            {transcript ? (
              <Text style={[styles.liveTranscriptText, { color: theme.text }]}>
                {transcript}<Text style={{ color: theme.accent }}>▍</Text>
              </Text>
            ) : (
              <View style={styles.liveEmptyState}>
                <Text style={[styles.liveEmptyEmoji]}>🎙️</Text>
                <Text style={[styles.liveEmptyText, { color: theme.textSecondary }]}>
                  Speak now — words appear here every few seconds
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Transcribing (final processing) ── */}
      {phase === 'transcribing' && (
        <View style={styles.centeredPane}>
          <ThinkDots color={theme.accent} />
          <Text style={[styles.spinLabel, { color: theme.text }]}>Finalizing transcript…</Text>
          <Text style={[styles.spinSub, { color: theme.textSecondary }]}>
            Processing last segment · Whisper on-device
          </Text>
        </View>
      )}

      {/* ── Summarizing (waiting for first token) ── */}
      {phase === 'summarizing' && (
        <View style={styles.centeredPane}>
          <ThinkDots color={theme.accent} />
          <Text style={[styles.spinLabel, { color: theme.text }]}>Summarizing…</Text>
        </View>
      )}

      {/* ── Transcript (+ streaming summary) ── */}
      {phase === 'transcript' && (
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>TRANSCRIPT</Text>
            <View style={styles.sectionActions}>
              <Text style={[styles.wordCountText, { color: theme.textSecondary }]}>
                {wordCount(transcript)} words
              </Text>
              <CopyButton text={transcript} color={theme.textSecondary} size={11} />
            </View>
          </View>
          <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text selectable style={[styles.resultText, { color: theme.text }]}>{transcript}</Text>
          </View>

          {/* Continue in Chat */}
          <TouchableOpacity
            style={[styles.chatBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('ScribeChat', { mode: 'chat', seedQuery: `Transcript:\n\n${transcript}` })}
            activeOpacity={0.75}
          >
            <Text style={[styles.chatBtnText, { color: theme.accent }]}>Continue in Chat →</Text>
          </TouchableOpacity>

          {summary ? (
            <>
              <View style={[styles.sectionRow, { marginTop: 20 }]}>
                <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>SUMMARY</Text>
                {!summary.endsWith('▍') && <CopyButton text={summary} color={theme.textSecondary} size={11} />}
              </View>
              <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {summary.endsWith('▍') ? (
                  <Text style={[styles.resultText, { color: theme.text }]}>{summary}</Text>
                ) : (
                  <MarkdownText color={theme.text} fontSize={15} lineHeight={23}>{summary}</MarkdownText>
                )}
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.summarizeBtn, { borderColor: theme.accent, backgroundColor: theme.accent + '14' }]}
              onPress={handleSummarize}
              activeOpacity={0.75}
            >
              <Text style={[styles.summarizeBtnText, { color: theme.accent }]}>Summarize with AI</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </Animated.View>
  );
}

function ThinkDots({ color }: { color: string }) {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 140),
        Animated.timing(d, { toValue: -7, duration: 260, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.delay(540),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, transform: [{ translateY: d }] }} />
      ))}
    </View>
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
  resetBtn: { fontSize: 13, fontWeight: '600' },
  hero: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20, borderBottomWidth: 1, gap: 6 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 14 },
  errText: { fontSize: 12, marginTop: 4 },
  body: { flex: 1, padding: 20, gap: 12 },
  primaryAction: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, padding: 18,
  },
  primaryActionIcon: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  readyDot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.8 },
  secondaryAction: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionSub: { fontSize: 12 },
  centeredPane: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  recordingPane: { flex: 1 },
  recordBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  recordRingSmall: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  recordSquareSmall: { width: 10, height: 10, borderRadius: 2 },
  recordTimeSmall: { fontSize: 18, fontWeight: '300', letterSpacing: 1, flex: 1 },
  recordingLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  stopBtnSmall: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  liveTranscriptScroll: { flex: 1 },
  liveTranscriptContent: { padding: 20, flexGrow: 1 },
  liveTranscriptText: { fontSize: 17, lineHeight: 28 },
  liveEmptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  liveEmptyEmoji: { fontSize: 40 },
  liveEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 260 },
  recordRing: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  recordSquare: { width: 28, height: 28, borderRadius: 6 },
  recordTime: { fontSize: 40, fontWeight: '200', letterSpacing: 2 },
  recordLabel: { fontSize: 14 },
  stopBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 12 },
  stopBtnText: { fontSize: 15, fontWeight: '700' },
  spinLabel: { fontSize: 20, fontWeight: '700' },
  spinSub: { fontSize: 13 },
  resultScroll: { flex: 1 },
  resultContent: { padding: 20, gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionHead: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  wordCountText: { fontSize: 10, fontWeight: '500' },
  resultBox: { borderRadius: 14, borderWidth: 1, padding: 16 },
  resultText: { fontSize: 15, lineHeight: 23 },
  chatBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', marginTop: 8,
  },
  chatBtnText: { fontSize: 14, fontWeight: '700' },
  summarizeBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
  },
  summarizeBtnText: { fontSize: 15, fontWeight: '700' },
});
