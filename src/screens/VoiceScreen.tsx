import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert, AppState,
} from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { transcribeStream, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { whisperManager, llmManager } from '../utils/modelManager';
import { showRunningNotification, showDoneNotification, clearInferenceNotifications, registerInferenceCancel, unregisterInferenceCancel } from '../utils/bgNotification';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, getGenParams, toPath, syncModelsFromDisk, saveVoiceSession } from '../utils/storage';
import { SYSTEM_PROMPTS, MODEL_KEYS, stripThink, splitStream } from '../utils/models';
import { Paths, File, Directory } from 'expo-file-system';
import { IconVoice, IconUpload, IconMic, IconBack } from '../components/Icons';
import MarkdownText from '../components/MarkdownText';
import PeekLoader from '../components/PeekLoader';
import ResultActions from '../components/ResultActions';
import TypingDots from '../components/TypingDots';

type Phase = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'explaining' | 'done';

// Number of waveform bars
const BAR_COUNT = 7;

export default function VoiceScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [initError, setInitError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [whisperReady, setWhisperReady] = useState(false);
  const [loaderLabel, setLoaderLabel] = useState('Finalizing transcript…');
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const currentRunRef = useRef<any>(null);
  const liveScrollRef = useRef<ScrollView>(null);
  const phaseRef = useRef<Phase>('idle');
  const autoSummarizeRef = useRef(false);
  const transcriptRef = useRef('');

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    whisperManager.ensure().then(() => setWhisperReady(true)).catch(() => {});
    const sub = AppState.addEventListener('change', state => {
      const p = phaseRef.current;
      if (state === 'background' && (p === 'recording' || p === 'transcribing' || p === 'explaining')) {
        showRunningNotification('Peek Voice');
      } else if (state === 'active') {
        clearInferenceNotifications();
      }
    });
    return () => {
      clearTimers();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      sub.remove();
      clearInferenceNotifications();
      void llmManager.release().catch(() => {});
    };
  }, []);

  // Auto-explain when transcript phase is set and flag is armed
  useEffect(() => {
    if (phase === 'transcript' && autoSummarizeRef.current && transcriptRef.current) {
      autoSummarizeRef.current = false;
      handleSummarize();
    }
  }, [phase]);

  const clearTimers = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
    if (phaseTimerRef.current) { clearInterval(phaseTimerRef.current); phaseTimerRef.current = null; }
  };

  const startPhaseTimer = () => {
    if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    setPhaseElapsed(0);
    phaseTimerRef.current = setInterval(() => setPhaseElapsed(s => s + 1), 1000);
  };

  const stopPhaseTimer = () => {
    if (phaseTimerRef.current) { clearInterval(phaseTimerRef.current); phaseTimerRef.current = null; }
  };

  // ── Waveform ──────────────────────────────────────────────
  const WAVE_PERIODS = [320, 260, 200, 280, 240, 300, 220];

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

  // ── REC pulse ─────────────────────────────────────────────
  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    pulseLoopRef.current.start();
  };

  const stopPulse = () => {
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
  };

  // ── Chunk handling ────────────────────────────────────────
  const saveChunkToDir = async (cacheUri: string): Promise<string | null> => {
    try {
      const dir = new Directory(Paths.document, 'peek', 'recordings');
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

    try {
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

      if (isStoppingRef.current && chunkQueueRef.current.length === 0) {
        isStoppingRef.current = false;
        setPhase('transcript');
      }
    } finally {
      chunkProcessingRef.current = false;
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
    if (!cacheUri) return;
    const saved = await saveChunkToDir(cacheUri);
    if (saved) { chunkQueueRef.current.push(saved); processChunkQueue(); }
  };

  // ── Record ────────────────────────────────────────────────
  const handleRecord = async () => {
    if (phase === 'recording') { await stopRecording(); return; }
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission needed', 'Microphone access is required to record.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
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
    setSummary('');
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    chunkTimerRef.current = setInterval(rotateChunk, 3000);
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
    autoSummarizeRef.current = true;
    isStoppingRef.current = true;
    setLoaderLabel('Finalizing transcript…');
    if (chunkQueueRef.current.length === 0 && !chunkProcessingRef.current) {
      isStoppingRef.current = false;
      // If nothing was captured, disarm so the summary section doesn't show a pending cursor
      if (!transcriptRef.current) autoSummarizeRef.current = false;
      setPhase('transcript');
    } else {
      setPhase('transcribing');
      startPhaseTimer();
      processChunkQueue();
    }
  };

  // ── Upload ────────────────────────────────────────────────
  const handleUpload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    try {
      const dir = new Directory(Paths.document, 'peek', 'recordings');
      dir.create({ intermediates: true, idempotent: true });
      const ext = picked.name?.split('.').pop() ?? 'm4a';
      const destFile = new File(dir, `upload_${Date.now()}.${ext}`);
      new File(picked.uri).copy(destFile);
      await doTranscribeFile(destFile.exists ? destFile.uri : picked.uri);
    } catch {
      await doTranscribeFile(picked.uri);
    }
  };

  const doTranscribeFile = async (uri: string) => {
    setPhase('transcribing');
    setLoaderLabel('Transcribing…');
    startPhaseTimer();
    setTranscript('');
    setSummary('');
    autoSummarizeRef.current = true;
    try {
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
      setInitError(err?.message || 'Transcription failed');
      setPhase('idle');
    }
  };

  // ── Summarize (auto-triggered) ────────────────────────────
  const handleSummarize = async () => {
    const currentTranscript = transcriptRef.current;
    if (!currentTranscript || currentTranscript === '(No speech detected)') return;
    setPhase('explaining');
    setSummary('');
    startPhaseTimer();
    try {
      const synced = await syncModelsFromDisk();
      // SmolVLM2 500M can explain text without vision (load without mmproj).
      // Prefer it because it's already downloaded by Lens users.
      const explainModel = synced.find(m => m.id === MODEL_KEYS.VISION)
        ?? synced.find(m => m.id === MODEL_KEYS.TEXT_FAST)
        ?? synced.find(m => m.modelType === 'text');
      if (!explainModel) {
        setSummary('Download SmolVLM2 500M (via Lens) or Qwen3 1.7B to get explanations.');
        setPhase('done');
        return;
      }
      const settings = await getSettings();
      // Do NOT include projectionModelSrc — text-only task, no image input needed
      const modelConfig: any = { ctx_size: 1024, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
      const mid = await llmManager.ensure(explainModel, modelConfig);
      const gp = await getGenParams();
      let out = '';
      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: SYSTEM_PROMPTS.voice },
          { role: 'user', content: currentTranscript },
        ],
        stream: true,
        captureThinking: false,
        generationParams: { predict: gp.maxTokens, temp: gp.temp, top_k: gp.top_k, top_p: gp.top_p, repeat_penalty: gp.repeat_penalty, reasoning_budget: 0 as 0 },
      });
      currentRunRef.current = run;
      registerInferenceCancel(() => { if (currentRunRef.current) cancel({ requestId: currentRunRef.current.requestId }).catch(() => {}); });
      showRunningNotification('Peek Voice');
      for await (const ev of run.events) {
        if ((ev as any).type === 'contentDelta') {
          out += (ev as any).text;
          const { answer: visible, inThink } = splitStream(out);
          setSummary(inThink ? '' : (visible || ''));
        }
      }
      const { text: finalOut } = stripThink(out);
      const summaryText = finalOut.trim() || '';
      setSummary(summaryText);
      // Persist session
      const tx = transcriptRef.current;
      if (tx && summaryText) {
        const title = tx.slice(0, 60).replace(/\s+/g, ' ').trim() || 'Voice session';
        try {
          await saveVoiceSession({ id: Date.now().toString(), title, transcript: tx, summary: summaryText, createdAt: new Date().toISOString() });
        } catch {}
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (AppState.currentState !== 'active') showDoneNotification('Peek Voice');
      else clearInferenceNotifications();
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      clearInferenceNotifications();
    } finally {
      unregisterInferenceCancel();
      stopPhaseTimer();
      setPhase('done');
    }
  };

  const reset = () => {
    stopPulse();
    stopWave();
    clearTimers();
    setTranscript('');
    setSummary('');
    setInitError(null);
    transcriptRef.current = '';
    autoSummarizeRef.current = false;
    setPhase('idle');
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const isWorking = phase === 'recording' || phase === 'transcribing' || phase === 'explaining';

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <IconBack size={18} color={theme.accent} />
        </TouchableOpacity>
        <View style={styles.brand}>
          <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.brandName, { color: theme.text }]}>Peek Voice</Text>
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
            <Text style={[styles.heroTitle, { color: theme.text }]}>Peek Voice</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              Record or upload audio — get a transcript and explanation automatically.
            </Text>
            {initError && <Text style={[styles.errText, { color: theme.error }]}>{initError}</Text>}
          </View>

          <View style={styles.body}>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: theme.accent }]}
              onPress={handleRecord}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                <IconMic size={20} color={theme.accentFg} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: theme.accentFg }]}>Record Now</Text>
                <Text style={[styles.actionSub, { color: theme.accentFg + 'BB' }]}>
                  {whisperReady ? 'Whisper ready · tap to start' : 'Loading Whisper…'}
                </Text>
              </View>
              {whisperReady && <View style={[styles.readyDot, { backgroundColor: theme.accentFg }]} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryAction, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handleUpload}
              activeOpacity={0.72}
            >
              <View style={[styles.actionIconBox, { backgroundColor: theme.cardAlt }]}>
                <IconUpload size={18} color={theme.text} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Upload Audio</Text>
                <Text style={[styles.actionSub, { color: theme.textSecondary }]}>MP3, WAV, M4A supported</Text>
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Recording ── */}
      {phase === 'recording' && (
        <View style={styles.recordingPane}>
          {/* Top bar with timer + stop */}
          <View style={[styles.recordBar, { borderBottomColor: theme.border }]}>
            <View style={styles.recIndicator}>
              <Animated.View
                style={[styles.recDot, { backgroundColor: theme.error, transform: [{ scale: pulseAnim }] }]}
              />
              <Text style={[styles.recLabel, { color: theme.error }]}>REC</Text>
            </View>
            <Text style={[styles.recTimer, { color: theme.text }]}>{fmtTime(recordingTime)}</Text>
            <View style={styles.waveformBox}>
              {waveAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveBar,
                    { backgroundColor: theme.accent, transform: [{ scaleY: anim }] },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.stopBtn, { backgroundColor: theme.error }]}
              onPress={stopRecording}
              activeOpacity={0.85}
            >
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </View>

          {/* Live transcript */}
          <ScrollView
            ref={liveScrollRef}
            style={styles.liveScroll}
            contentContainerStyle={styles.liveContent}
            showsVerticalScrollIndicator={false}
          >
            {transcript ? (
              <View>
                <Text style={[styles.liveText, { color: theme.text }]}>{transcript}</Text>
                <TypingDots color={theme.accent} size={6} />
              </View>
            ) : (
              <View style={styles.liveEmpty}>
                <Text style={[styles.liveEmptyText, { color: theme.textSecondary }]}>
                  Speak now — transcript appears here
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Processing (transcribing only) ── */}
      {phase === 'transcribing' && (
        <View style={styles.centeredPane}>
          <PeekLoader label={loaderLabel} />
          <Text style={[styles.phaseTimer, { color: theme.textSecondary }]}>
            {fmtTime(phaseElapsed)}
          </Text>
        </View>
      )}

      {/* ── Result — transcript + explanation ── */}
      {(phase === 'transcript' || phase === 'explaining' || phase === 'done') && (
        <ScrollView
          style={styles.resultScroll}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Transcript section */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>TRANSCRIPT</Text>
            <Text style={[styles.wordCount, { color: theme.textSecondary }]}>
              {transcript.split(/\s+/).filter(Boolean).length} words
            </Text>
          </View>
          <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text selectable style={[styles.resultText, { color: theme.text }]}>{transcript}</Text>
          </View>
          <ResultActions
            text={transcript}
            title={`peek-transcript-${Date.now()}`}
            theme={theme}
          />

          {/* Explanation section */}
          <View style={[styles.sectionRow, { marginTop: 24 }]}>
            <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>EXPLANATION</Text>
            {phase === 'explaining' && (
              <Text style={[styles.wordCount, { color: theme.accent }]}>{fmtTime(phaseElapsed)}</Text>
            )}
            {phase === 'done' && !summary && (
              <Text style={[styles.wordCount, { color: theme.textSecondary }]}>No model</Text>
            )}
          </View>

          {phase === 'done' && summary ? (
            <>
              <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <MarkdownText color={theme.text} fontSize={15} lineHeight={23}>{summary}</MarkdownText>
              </View>
              <ResultActions
                text={summary}
                title={`peek-explanation-${Date.now()}`}
                theme={theme}
              />
            </>
          ) : phase === 'done' && !summary ? (
            <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.resultText, { color: theme.textSecondary }]}>
                Download SmolVLM2 500M (via Peek Lens) or Qwen3 1.7B to get explanations.
              </Text>
            </View>
          ) : phase === 'explaining' ? (
            // Streaming explanation — tokens arrive live
            <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {summary ? (
                <Text style={[styles.resultText, { color: theme.text }]}>{summary}</Text>
              ) : (
                <TypingDots color={theme.accent} size={7} />
              )}
            </View>
          ) : null}

          {/* Continue in Chat */}
          <TouchableOpacity
            style={[styles.chatBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('AIChat', { seedMessage: `Transcript:\n\n${transcript}` })}
            activeOpacity={0.75}
          >
            <Text style={[styles.chatBtnText, { color: theme.accent }]}>Continue in Chat →</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  resetBtn: { fontSize: 13, fontWeight: '600' },
  hero: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20, borderBottomWidth: 1, gap: 6 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  heroTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  heroSub: { fontSize: 14, lineHeight: 20 },
  errText: { fontSize: 12, marginTop: 4 },
  body: { flex: 1, padding: 20, gap: 12 },
  primaryAction: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, padding: 18,
  },
  secondaryAction: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  actionIconBox: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionSub: { fontSize: 12 },
  readyDot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.8 },
  // Recording
  recordingPane: { flex: 1 },
  recordBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  recTimer: { fontSize: 17, fontWeight: '300', letterSpacing: 1, minWidth: 52 },
  waveformBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', height: 34, gap: 3,
  },
  waveBar: {
    width: 3, height: 30, borderRadius: 2, transformOrigin: 'center',
  },
  stopBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, flexShrink: 0 },
  stopBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  liveScroll: { flex: 1 },
  liveContent: { padding: 20, flexGrow: 1 },
  liveText: { fontSize: 17, lineHeight: 28 },
  liveEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  liveEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  // Processing
  centeredPane: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  phaseTimer: { fontSize: 13, fontWeight: '500', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  // Result
  resultScroll: { flex: 1 },
  resultContent: { padding: 20, paddingTop: 16 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  sectionHead: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  wordCount: { fontSize: 10, fontWeight: '500' },
  resultBox: { borderRadius: 14, borderWidth: 1, padding: 16 },
  resultText: { fontSize: 15, lineHeight: 23 },
  chatBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 12,
    alignItems: 'center', marginTop: 20,
  },
  chatBtnText: { fontSize: 14, fontWeight: '700' },
});
