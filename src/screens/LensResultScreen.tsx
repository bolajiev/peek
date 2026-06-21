import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Animated, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import {
  showRunningNotification, clearInferenceNotifications,
  registerInferenceCancel, unregisterInferenceCancel,
} from '../utils/bgNotification';
import { logInference } from '../utils/auditLogger';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, toPath, saveLensScan, updateScanStreak } from '../utils/storage';
import { llmManager } from '../utils/modelManager';
import { splitStream } from '../utils/models';
import { findModel, LENS_SYSTEM_PROMPT } from './ScanScreen';
import MarkdownText from '../components/MarkdownText';
import CopyButton from '../components/CopyButton';
import TypingDots from '../components/TypingDots';

export default function LensResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const photoUri: string = route.params?.photoUri;
  const preselectedModelId: string | undefined = route.params?.preselectedModelId;
  const userQuery: string = route.params?.userQuery || '';
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [phase, setPhase] = useState<'loading' | 'streaming' | 'done' | 'error'>('loading');
  const [statusText, setStatusText] = useState('Loading model…');
  const [answer, setAnswer] = useState('');
  const [modelName, setModelName] = useState('');
  const [elapsed, setElapsed] = useState<number | undefined>(undefined);
  const [tokenCount, setTokenCount] = useState<number | undefined>(undefined);
  const runRef = useRef<any>(null);
  const slideY = useRef(new Animated.Value(40)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 80, friction: 11, useNativeDriver: true }),
    ]).start();
    runAnalysis();
    return () => {
      unregisterInferenceCancel();
      void clearInferenceNotifications();
      if (runRef.current) cancel({ requestId: runRef.current.requestId }).catch(() => {});
      void llmManager.release().catch(() => {});
    };
  }, []);

  const runAnalysis = async () => {
    try {
      const modelInfo = await findModel(preselectedModelId);
      if (!modelInfo) {
        setStatusText('No vision model downloaded. Go to Models to get one.');
        setPhase('error');
        return;
      }
      setModelName(modelInfo.name);
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const cfg: any = { ctx_size: 1024, device };
      if (modelInfo.projectionModelSrc) cfg.projectionModelSrc = toPath(modelInfo.projectionModelSrc);

      setStatusText('Loading model…');
      const mid = await llmManager.ensure(modelInfo, cfg, (pct) => {
        setStatusText('Loading model...');
      });

      setPhase('streaming');
      setStatusText('Analyzing…');

      registerInferenceCancel(() => {
        if (runRef.current) cancel({ requestId: runRef.current.requestId }).catch(() => {});
      });
      void showRunningNotification('Peek Lens');

      const genStart = Date.now();
      let firstTokenMs = -1;
      const imagePath = toPath(photoUri);
      const run = completion({
        modelId: mid,
        history: [
          { role: 'system', content: LENS_SYSTEM_PROMPT },
          { role: 'user', content: userQuery || 'What is this? Describe what you see.', attachments: [{ path: imagePath }] },
        ],
        stream: true,
        captureThinking: false,
        generationParams: { predict: 300, temp: 0.3, top_k: 20, reasoning_budget: 0 as 0 },
      });
      runRef.current = run;

      let streamed = '';
      for await (const ev of run.events) {
        if ((ev as any).type === 'contentDelta') {
          if (firstTokenMs < 0) firstTokenMs = Date.now();
          streamed += (ev as any).text;
          const { answer: visible } = splitStream(streamed);
          setAnswer(visible);
        }
      }
      runRef.current = null;

      const { answer: finalAnswer } = splitStream(streamed);
      const text = finalAnswer.trim() || 'No response.';
      setAnswer(text);

      const [, stats] = await Promise.all([run.final, run.stats]);
      const totalMs = Date.now() - genStart;
      const ttftMs = firstTokenMs > 0 ? firstTokenMs - genStart : totalMs;
      setElapsed(Math.round(totalMs / 1000));
      if (stats?.generatedTokens) setTokenCount(stats.generatedTokens);
      logInference('Lens', modelName, ttftMs, totalMs, stats?.generatedTokens ?? 0).catch(() => {});

      unregisterInferenceCancel();
      void clearInferenceNotifications();
      setPhase('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Save to history — keep these independent so one failure doesn't block the other
      try { await updateScanStreak(); } catch {}
      try {
        await saveLensScan({
          id: Date.now().toString(),
          imagePath: photoUri,
          query: userQuery || 'What is this?',
          text,
          modelName: modelInfo.name,
          createdAt: new Date().toISOString(),
        });
      } catch {}
    } catch (err) {
      unregisterInferenceCancel();
      void clearInferenceNotifications();
      if (!(err instanceof InferenceCancelledError)) {
        setPhase('error');
        setStatusText('Analysis failed. Try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleCopy = async () => {
    if (answer) {
      await Clipboard.setStringAsync(answer);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <Animated.View style={[styles.root, { backgroundColor: theme.background, opacity: fade, transform: [{ translateY: slideY }] }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
          <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Peek Lens</Text>
        {phase === 'done' && answer ? (
          <CopyButton text={answer} color={theme.textSecondary} size={12} />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Result card */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {phase === 'loading' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{statusText}</Text>
            </View>
          ) : phase === 'streaming' ? (
            <View>
              <Text style={[styles.streamingLabel, { color: theme.accent }]}>Analyzing…</Text>
              {answer ? (
                <Text style={[styles.answerText, { color: theme.text }]}>{answer}</Text>
              ) : (
                <TypingDots color={theme.accent} size={7} />
              )}
            </View>
          ) : phase === 'done' ? (
            <MarkdownText color={theme.text} fontSize={15} lineHeight={22}>{answer}</MarkdownText>
          ) : (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{statusText}</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: theme.accent }]}
                onPress={() => { setPhase('loading'); setAnswer(''); setStatusText('Loading model…'); runAnalysis(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.retryBtnText, { color: theme.accentFg }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {modelName ? (
          <Text style={[styles.modelLabel, { color: theme.textSecondary }]}>{modelName}</Text>
        ) : null}

        {(elapsed !== undefined || tokenCount !== undefined) && (
          <Text style={[styles.statLine, { color: theme.textSecondary }]}>
            {[elapsed !== undefined ? `${elapsed}s` : null, tokenCount !== undefined ? `${tokenCount} tokens` : null].filter(Boolean).join(' · ')}
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1,
  },
  back: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  photo: { width: '100%', height: 260, borderRadius: 16, backgroundColor: '#111' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 14 },
  streamingLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  answerText: { fontSize: 15, lineHeight: 22 },
  errorBox: { gap: 12 },
  errorText: { fontSize: 14, lineHeight: 20 },
  retryBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'flex-start' },
  retryBtnText: { fontSize: 14, fontWeight: '700' },
  modelLabel: { fontSize: 11, textAlign: 'center', marginTop: 4 },
  statLine: { fontSize: 11, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
