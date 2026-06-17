import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { Paths, File } from 'expo-file-system';
import {
  loadModel, transcribe, completion, textToSpeech,
  WHISPER_EN_BASE_Q8_0, TTS_EN_SUPERTONIC_Q4_0, InferenceCancelledError,
} from '@qvac/sdk';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getDownloadedModels, getDefaultModelId } from '../utils/storage';
import { ragQuery, buildRagContext } from '../utils/ragService';

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'done';

interface Turn { role: 'user' | 'assistant'; text: string; }

const SYSTEM = 'You are Peek, a private on-device AI assistant. Answer concisely — you are responding to voice, keep answers under 3 sentences unless asked for more.';

export default function VoiceScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [phase, setPhase] = useState<Phase>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState('Tap to speak');
  const [llmModelId, setLlmModelId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const whisperIdRef = useRef<string>('');
  const ttsIdRef = useRef<string>('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    init();
    return () => { stopPulse(); cleanupSound(); };
  }, []);

  const init = async () => {
    try {
      setStatus('Loading voice models...');
      const [wId, tId] = await Promise.all([
        loadModel({ modelSrc: WHISPER_EN_BASE_Q8_0 }),
        loadModel({ modelSrc: TTS_EN_SUPERTONIC_Q4_0 }),
      ]);
      whisperIdRef.current = wId;
      ttsIdRef.current = tId;
      const models = await getDownloadedModels();
      const defaultId = await getDefaultModelId();
      const m = defaultId ? models.find(x => x.id === defaultId) ?? models[0] : models[0];
      if (m) setLlmModelId(m.id);
      setReady(true);
      setStatus('Tap to speak');
    } catch {
      setReady(true);
      setStatus('Tap to speak');
    }
  };

  const startPulse = () => {
    pulseLoop.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    pulseLoop.current.start();
  };
  const stopPulse = () => { pulseLoop.current?.stop(); pulseAnim.setValue(1); };

  const cleanupSound = async () => {
    if (soundRef.current) { await soundRef.current.unloadAsync().catch(() => {}); soundRef.current = null; }
  };

  const handleMic = async () => {
    if (phase === 'recording') { await stopRecording(); return; }
    if (phase !== 'idle' && phase !== 'done') return;
    await startRecording();
  };

  const startRecording = async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { Alert.alert('Permission needed', 'Microphone access is required.'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    recordingRef.current = rec;
    setPhase('recording');
    setStatus('Listening...');
    startPulse();
  };

  const stopRecording = async () => {
    stopPulse();
    setPhase('transcribing');
    setStatus('Transcribing...');
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      const uri = recordingRef.current?.getURI() ?? '';
      recordingRef.current = null;

      const text: string = await transcribe({ modelId: whisperIdRef.current, audioChunk: uri });
      const userText = text.trim();
      if (!userText) { setPhase('idle'); setStatus('Nothing heard — tap to try again'); return; }

      const next: Turn[] = [...turns, { role: 'user', text: userText }];
      setTurns(next);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      await respond(userText, next);
    } catch {
      setPhase('idle'); setStatus('Tap to speak');
    }
  };

  const respond = async (userText: string, currentTurns: Turn[]) => {
    setPhase('thinking'); setStatus('Thinking...');
    if (!llmModelId) { setPhase('done'); setStatus('No model — download one from Models first.'); return; }
    try {
      const docs = await ragQuery(llmModelId, userText, 3);
      const ctx = buildRagContext(docs);
      const history = [
        { role: 'system', content: SYSTEM + ctx },
        ...currentTurns.map(t => ({ role: t.role, content: t.text })),
      ];
      let full = '';
      const run = completion({ modelId: llmModelId, history, stream: true });
      for await (const ev of run.events) {
        const e = ev as any;
        if (e.type === 'contentDelta') full += e.text;
        else if (e.text) full += e.text;
      }
      full = full.trim();
      const next: Turn[] = [...currentTurns, { role: 'assistant', text: full }];
      setTurns(next);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      await speak(full);
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) { setPhase('done'); setStatus('Tap to speak again'); }
    }
  };

  const speak = async (text: string) => {
    setPhase('speaking'); setStatus('Speaking...');
    try {
      const result = textToSpeech({ modelId: ttsIdRef.current, text, stream: false });
      const pcmNumbers: number[] = await result.buffer;
      if (!pcmNumbers.length) { setPhase('done'); setStatus('Tap to speak again'); return; }

      // Build WAV file from PCM int16 samples
      const wavBytes = buildWav(pcmNumbers, 44100);
      const tmpFile = new File(Paths.cache, 'peek_tts.wav');
      tmpFile.write(wavBytes);

      await cleanupSound();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: tmpFile.uri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (s.didJustFinish) { setPhase('done'); setStatus('Tap to speak again'); }
      });
      await sound.playAsync();
    } catch {
      setPhase('done'); setStatus('Tap to speak again');
    }
  };

  const buildWav = (samples: number[], sampleRate: number): Uint8Array => {
    const numCh = 1; const bps = 16;
    const dataBytes = samples.length * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buf);
    const str = (s: string, o: number) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    str('RIFF', 0); view.setUint32(4, 36 + dataBytes, true);
    str('WAVE', 8); str('fmt ', 12);
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * numCh * bps / 8, true);
    view.setUint16(32, numCh * bps / 8, true); view.setUint16(34, bps, true);
    str('data', 36); view.setUint32(40, dataBytes, true);
    const int16 = new Int16Array(buf, 44);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      // Handle both float [-1,1] and int16 [-32768,32767] input
      int16[i] = Math.abs(s) <= 1 ? Math.round(s * 32767) : Math.round(s);
    }
    return new Uint8Array(buf);
  };

  const micColor = phase === 'recording' ? theme.error
    : (phase === 'idle' || phase === 'done') ? theme.accent : theme.textSecondary;
  const isBusy = phase === 'transcribing' || phase === 'thinking' || phase === 'speaking';

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.back, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Voice</Text>
        {turns.length > 0
          ? <TouchableOpacity onPress={() => setTurns([])}><Text style={[styles.clear, { color: theme.textSecondary }]}>Clear</Text></TouchableOpacity>
          : <View style={{ width: 40 }} />}
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {turns.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Voice AI</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Speak naturally. Peek listens, thinks, and talks back — fully on device.</Text>
          </View>
        ) : turns.map((t, i) => (
          <View key={i} style={[styles.turn, t.role === 'user' ? styles.right : styles.left]}>
            <View style={[styles.bubble, t.role === 'user'
              ? { backgroundColor: theme.accent, borderBottomRightRadius: 4 }
              : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
              <Text style={[styles.bubbleText, { color: t.role === 'user' ? theme.accentFg : theme.text }]}>{t.text}</Text>
            </View>
          </View>
        ))}
        {isBusy && (
          <View style={[styles.turn, styles.left]}>
            <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
              <ThinkDots color={theme.accent} />
            </View>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: theme.border }]}>
        <Text style={[styles.status, { color: theme.textSecondary }]}>{status}</Text>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.mic, { borderColor: micColor, backgroundColor: phase === 'recording' ? theme.error + '18' : theme.accent + '14' }]}
            onPress={handleMic}
            disabled={isBusy || !ready}
            activeOpacity={0.8}
          >
            <MicSVG color={micColor} active={phase === 'recording'} />
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{phase === 'recording' ? 'Tap to stop' : isBusy ? '' : 'Tap to start'}</Text>
      </View>
    </Animated.View>
  );
}

function ThinkDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const a = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 140),
      Animated.timing(d, { toValue: -6, duration: 240, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.delay(560),
    ])));
    a.forEach(x => x.start());
    return () => a.forEach(x => x.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
      {dots.map((d, i) => <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, transform: [{ translateY: d }] }} />)}
    </View>
  );
}

function MicSVG({ color, active }: { color: string; active: boolean }) {
  return (
    <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <View style={{ width: 14, height: 20, borderRadius: 7, borderWidth: 2.5, borderColor: color, justifyContent: 'center', alignItems: 'center' }}>
        {active && <View style={{ width: 6, height: 10, borderRadius: 3, backgroundColor: color, opacity: 0.7 }} />}
      </View>
      <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 2.5, height: 5, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  back: { fontSize: 24, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800' },
  clear: { fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 26, fontWeight: '900' },
  emptySub: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  turn: { maxWidth: '85%' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bottom: { paddingTop: 20, paddingBottom: 44, alignItems: 'center', gap: 12, borderTopWidth: 1 },
  status: { fontSize: 13, fontWeight: '500' },
  mic: { width: 86, height: 86, borderRadius: 43, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 12 },
});
