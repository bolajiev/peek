import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { transcribe, completion, InferenceCancelledError } from '@qvac/sdk';
import { whisperManager, llmManager } from '../utils/modelManager';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getDownloadedModels, getSettings } from '../utils/storage';
import { IconVoice, IconUpload, IconMic, IconBack } from '../components/Icons';

type Phase = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'summarizing';

export default function VoiceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedModelId: string | undefined = route.params?.modelId;
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [initError, setInitError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    whisperManager.ensure().catch(() => {});
    return () => { cleanupRecording(); };
  }, []);

  const cleanupRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
  };

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

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await doTranscribe(result.assets[0].uri);
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
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    setPhase('recording');
    startPulse();
  };

  const stopRecording = async () => {
    stopPulse();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const rec = recordingRef.current;
    if (!rec) return;
    await rec.stopAndUnloadAsync().catch(() => {});
    const uri = rec.getURI() ?? '';
    recordingRef.current = null;
    if (uri) await doTranscribe(uri);
  };

  const doTranscribe = async (uri: string) => {
    setPhase('transcribing');
    setTranscript('');
    setSummary('');
    try {
      const wId = await whisperManager.ensure();
      const text: string = await transcribe({ modelId: wId, audioChunk: uri });
      setTranscript(text.trim() || '(No speech detected)');
      setPhase('transcript');
    } catch (err: any) {
      setInitError(err?.message || 'Transcription failed');
      setPhase('idle');
    }
  };

  const handleSummarize = async () => {
    if (!transcript) return;
    setPhase('summarizing');
    try {
      const models = await getDownloadedModels();
      if (!models.length) {
        Alert.alert('No model', 'Download an LLM model from Models to use summarization.');
        setPhase('transcript');
        return;
      }
      const m = (preselectedModelId ? models.find(x => x.id === preselectedModelId) : null) ?? models[0];
      const settings = await getSettings();
      const modelConfig: any = { ctx_size: 2048, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
      if (m.projectionModelSrc) modelConfig.projectionModelSrc = m.projectionModelSrc;
      const mid = await llmManager.ensure(m, modelConfig);
      let out = '';
      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: 'Summarize the following transcript concisely in 2-4 bullet points.' },
          { role: 'user', content: transcript },
        ],
        stream: true,
      });
      for await (const ev of run.events) {
        if ((ev as any).type === 'contentDelta') out += (ev as any).text;
      }
      setSummary(out.trim() || 'Could not generate summary.');
      setPhase('transcript');
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) setSummary('Summarization failed.');
      setPhase('transcript');
    }
  };

  const reset = () => {
    setTranscript(''); setSummary(''); setInitError(null); setPhase('idle');
  };

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
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Upload audio. Get a transcript and summary.</Text>
            {initError
              ? <Text selectable style={[styles.errText, { color: theme.error }]}>{initError}</Text>
              : null}
          </View>

          <View style={styles.body}>
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
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

            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handleRecord}
              activeOpacity={0.72}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.cardAlt }]}>
                <IconMic size={18} color={theme.text} />
              </View>
              <View style={styles.actionText}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Record Now</Text>
                <Text style={[styles.actionSub, { color: theme.textSecondary }]}>Transcribe in real-time on-device</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.accent }]}
            onPress={handleUpload}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaText, { color: theme.accentFg }]}>Upload Audio</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Recording ── */}
      {phase === 'recording' && (
        <View style={styles.centeredPane}>
          <Animated.View style={[styles.recordRing, { borderColor: theme.error, transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.recordSquare, { backgroundColor: theme.error }]} />
          </Animated.View>
          <Text style={[styles.recordTime, { color: theme.text }]}>{fmtTime(recordingTime)}</Text>
          <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>Recording...</Text>
          <TouchableOpacity
            style={[styles.stopBtn, { backgroundColor: theme.error }]}
            onPress={stopRecording}
            activeOpacity={0.85}
          >
            <Text style={[styles.stopBtnText, { color: '#fff' }]}>Stop & Transcribe</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Transcribing ── */}
      {phase === 'transcribing' && (
        <View style={styles.centeredPane}>
          <ThinkDots color={theme.accent} />
          <Text style={[styles.spinLabel, { color: theme.text }]}>Transcribing...</Text>
          <Text style={[styles.spinSub, { color: theme.textSecondary }]}>Running Whisper on-device</Text>
        </View>
      )}

      {/* ── Summarizing ── */}
      {phase === 'summarizing' && (
        <View style={styles.centeredPane}>
          <ThinkDots color={theme.accent} />
          <Text style={[styles.spinLabel, { color: theme.text }]}>Summarizing...</Text>
        </View>
      )}

      {/* ── Transcript ── */}
      {phase === 'transcript' && (
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionHead, { color: theme.textSecondary }]}>TRANSCRIPT</Text>
          <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text selectable style={[styles.resultText, { color: theme.text }]}>{transcript}</Text>
          </View>

          {summary ? (
            <>
              <Text style={[styles.sectionHead, { color: theme.textSecondary, marginTop: 20 }]}>SUMMARY</Text>
              <View style={[styles.resultBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text selectable style={[styles.resultText, { color: theme.text }]}>{summary}</Text>
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
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 14, fontWeight: '600' },
  actionSub: { fontSize: 12 },
  cta: {
    marginHorizontal: 20, marginBottom: 44, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700' },
  centeredPane: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
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
  sectionHead: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  resultBox: { borderRadius: 14, borderWidth: 1, padding: 16 },
  resultText: { fontSize: 15, lineHeight: 23 },
  summarizeBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
  },
  summarizeBtnText: { fontSize: 15, fontWeight: '700' },
});
