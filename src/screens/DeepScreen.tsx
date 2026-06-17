import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { ragIngestText, ragQuery, buildRagContext } from '../utils/ragService';
import { getDownloadedModels, getDefaultModelId, getSettings } from '../utils/storage';
import { completion, loadModel, unloadModel, InferenceCancelledError } from '@qvac/sdk';
import { EMBEDDINGGEMMA_300M_Q8_0 } from '@qvac/sdk';


type Phase = 'idle' | 'fetching' | 'ingesting' | 'ready' | 'thinking';

interface Message { role: 'user' | 'assistant'; text: string; }

export default function DeepScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [sourceTitle, setSourceTitle] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [llmModelId, setLlmModelId] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmProgress, setLlmProgress] = useState(0);
  const [noModel, setNoModel] = useState(false);
  const embedIdRef = useRef<string>('');
  const llmIdRef = useRef<string>('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    loadLlm();
    return () => {
      if (llmIdRef.current) unloadModel({ modelId: llmIdRef.current }).catch(() => {});
    };
  }, []);

  const loadLlm = async () => {
    setLlmLoading(true);
    setLlmProgress(0);
    try {
      const models = await getDownloadedModels();
      if (!models.length) { setNoModel(true); setLlmLoading(false); return; }
      const defaultId = await getDefaultModelId();
      const model = defaultId ? models.find(m => m.id === defaultId) ?? models[0] : models[0];
      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      const modelConfig: any = { ctx_size: 4096, device };
      if (model.projectionModelSrc) modelConfig.projectionModelSrc = model.projectionModelSrc;
      const mid = await loadModel({
        modelSrc: model.modelSrc,
        modelType: 'llm',
        modelConfig,
        onProgress: (p: { percentage: number }) => setLlmProgress(p.percentage),
      });
      llmIdRef.current = mid;
      setLlmModelId(mid);
    } catch {
      setNoModel(true);
    } finally {
      setLlmLoading(false);
    }
  };

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http')) { Alert.alert('Invalid URL', 'Enter a full URL starting with https://'); return; }

    setPhase('fetching');
    try {
      // Fetch page as plain text
      const res = await fetch(trimmed, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();

      // Strip HTML tags to get plain text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000); // cap at 12k chars for embedding

      if (text.length < 100) throw new Error('Page has too little content');

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : trimmed;
      setSourceTitle(title);

      setPhase('ingesting');

      // Load embedding model and ingest
      const embedId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
      embedIdRef.current = embedId;
      await ragIngestText(embedId, text, (pct) => {});

      setPhase('ready');
      setMessages([{ role: 'assistant', text: `Ready. I've read "${title}". Ask me anything about it.` }]);
      setUrl('');
    } catch (e: any) {
      setPhase('idle');
      Alert.alert('Failed', e.message || 'Could not fetch or process the page. Try a different URL.');
    }
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || phase === 'thinking') return;
    if (!llmModelId) { Alert.alert('No model', 'Download a model from the Models screen first.'); return; }

    setQuestion('');
    const newMessages: Message[] = [...messages, { role: 'user', text: q }];
    setMessages(newMessages);
    setPhase('thinking');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const docs = await ragQuery(embedIdRef.current, q, 5);
      const ctx = buildRagContext(docs);

      const sysPrompt = `You are Peek Deep, a private research assistant. The user has loaded a webpage for analysis.
Answer questions strictly based on the provided context.${ctx}
If the answer isn't in the context, say so clearly.`;

      const msgs = [
        { role: 'system', content: sysPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.text })),
      ];

      let full = '';
      const run = completion({ modelId: llmModelId, history: msgs, stream: true });
      for await (const ev of run.events) {
        if ((ev as any).text) full += (ev as any).text;
      }

      const finalMessages: Message[] = [...newMessages, { role: 'assistant', text: full.trim() }];
      setMessages(finalMessages);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      if (!(e instanceof InferenceCancelledError)) {
        setMessages([...newMessages, { role: 'assistant', text: 'Something went wrong. Try again.' }]);
      }
    } finally {
      setPhase('ready');
    }
  };

  const reset = () => { setPhase('idle'); setMessages([]); setSourceTitle(''); setUrl(''); };

  const isBusy = phase === 'fetching' || phase === 'ingesting' || phase === 'thinking';

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.backBtn, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Deep</Text>
          {sourceTitle ? <Text style={[styles.headerSub, { color: theme.accent }]} numberOfLines={1}>{sourceTitle}</Text> : null}
        </View>
        {phase !== 'idle' ? (
          <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.clearBtn, { color: theme.textSecondary }]}>Reset</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      {/* LLM progress bar */}
      {llmLoading && (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${llmProgress || 8}%` }]} />
        </View>
      )}

      {/* URL input or chat */}
      {noModel ? (
        <View style={styles.loadingPane}>
          <Text style={[styles.loadingText, { color: theme.text }]}>No model found</Text>
          <Text style={[styles.loadingSub, { color: theme.textSecondary }]}>Download a model from Models first</Text>
          <TouchableOpacity style={[{ backgroundColor: theme.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 }]} onPress={() => navigation.navigate('Models')}>
            <Text style={[{ color: theme.accentFg, fontWeight: '700' }]}>Go to Models</Text>
          </TouchableOpacity>
        </View>
      ) : phase === 'idle' ? (
        <View style={styles.urlPane}>
          <View style={[styles.urlCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.urlLabel, { color: theme.text }]}>Research any webpage</Text>
            <Text style={[styles.urlSub, { color: theme.textSecondary }]}>
              Paste a URL. Peek fetches the content and lets you ask questions about it — fully on-device.
            </Text>
            <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <TextInput
                style={[styles.urlInput, { color: theme.text }]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://..."
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onSubmitEditing={handleFetch}
              />
              <TouchableOpacity
                style={[styles.goBtn, { backgroundColor: !url.trim() || llmLoading ? theme.border : theme.accent }]}
                onPress={handleFetch}
                disabled={!url.trim() || llmLoading}
              >
                <Text style={[styles.goBtnText, { color: theme.accentFg }]}>Go</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.disclosureBanner, { backgroundColor: theme.cardAlt }]}>
              <Text style={[styles.disclosureText, { color: theme.textSecondary }]}>
                Disclosure: Page content is fetched via a standard HTTP request (not AI). All analysis runs on-device via QVAC.
              </Text>
            </View>
          </View>
        </View>
      ) : phase === 'fetching' || phase === 'ingesting' ? (
        <View style={styles.loadingPane}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {phase === 'fetching' ? 'Fetching page...' : 'Reading content...'}
          </Text>
          <Text style={[styles.loadingSub, { color: theme.textSecondary }]}>
            {phase === 'ingesting' ? 'Building your private knowledge base' : ''}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {messages.map((msg, i) => (
              <View key={i} style={[styles.turn, msg.role === 'user' ? styles.turnRight : styles.turnLeft]}>
                <View style={[
                  styles.bubble,
                  msg.role === 'user'
                    ? { backgroundColor: theme.accent, borderBottomRightRadius: 4 }
                    : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                ]}>
                  <Text style={[styles.bubbleText, { color: msg.role === 'user' ? theme.accentFg : theme.text }]}>
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
            {phase === 'thinking' && (
              <View style={[styles.turn, styles.turnLeft]}>
                <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                  <ThinkingDots color={theme.accent} />
                </View>
              </View>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <TextInput
              style={[styles.questionInput, { backgroundColor: theme.card, color: theme.text }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about this page..."
              placeholderTextColor={theme.textSecondary}
              onSubmitEditing={handleAsk}
              returnKeyType="send"
              editable={!isBusy}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: question.trim() ? theme.accent : theme.cardAlt }]}
              onPress={handleAsk}
              disabled={!question.trim() || isBusy}
            >
              <Text style={[styles.sendBtnText, { color: question.trim() ? theme.accentFg : theme.textSecondary }]}>›</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Animated.View>
  );
}

function ThinkingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 140),
        Animated.timing(d, { toValue: -6, duration: 250, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.delay(580),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, transform: [{ translateY: d }] }} />
      ))}
    </View>
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
  headerSub: { fontSize: 11, fontWeight: '600', textAlign: 'center', maxWidth: 180 },
  clearBtn: { fontSize: 14, fontWeight: '600' },
  urlPane: { flex: 1, padding: 20, justifyContent: 'center' },
  urlCard: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  urlLabel: { fontSize: 20, fontWeight: '800' },
  urlSub: { fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  urlInput: { flex: 1, fontSize: 14, paddingHorizontal: 14, paddingVertical: 13 },
  goBtn: { paddingHorizontal: 20, paddingVertical: 13 },
  goBtnText: { fontSize: 15, fontWeight: '800' },
  disclosureBanner: { borderRadius: 10, padding: 12 },
  disclosureText: { fontSize: 11, lineHeight: 16 },
  loadingPane: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 18, fontWeight: '700' },
  loadingSub: { fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 10, flexGrow: 1 },
  turn: { maxWidth: '85%' },
  turnLeft: { alignSelf: 'flex-start' },
  turnRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28, borderTopWidth: 1,
  },
  questionInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { fontSize: 24, fontWeight: '800', marginTop: -2 },
});
