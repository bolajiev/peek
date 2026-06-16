import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { loadModel, unloadModel, completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, getDownloadedModels } from '../utils/storage';
import { AVAILABLE_MODELS } from '../utils/models';
import { ScanResult, ModelInfo } from '../types';

type ChatParams = {
  Chat: { result: ScanResult; useCase: string; modelId: string };
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ChatParams, 'Chat'>>();
  const { result, useCase, modelId } = route.params;
  const theme = getTheme(useTheme());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelIdStr, setModelIdStr] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const modelIdRef = useRef<string | null>(null);
  const currentRunRef = useRef<any>(null);

  useEffect(() => {
    loadModelForChat();
    return () => {
      if (currentRunRef.current) {
        void cancel({ requestId: currentRunRef.current.requestId }).catch(() => {});
      }
      if (modelIdRef.current) {
        unloadModel({ modelId: modelIdRef.current }).catch(() => {});
      }
    };
  }, []);

  const loadModelForChat = async () => {
    try {
      let modelInfo = await findModelById(modelId);
      if (!modelInfo) {
        // opened from history — pick first available downloaded model
        const downloaded = await getDownloadedModels();
        modelInfo = downloaded[0] ?? null;
      }
      if (!modelInfo) return;

      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      let ctxSize = 2048;
      if (settings.responseLength === 'short') ctxSize = 1024;
      else if (settings.responseLength === 'detailed') ctxSize = 4096;

      const modelConfig: any = { ctx_size: ctxSize, device };
      if (modelInfo.projectionModelSrc) {
        modelConfig.projectionModelSrc = modelInfo.projectionModelSrc;
      }

      const id = await loadModel({
        modelSrc: modelInfo.modelSrc,
        modelType: 'llm',
        modelConfig,
      });
      modelIdRef.current = id;
      setModelIdStr(id);
      setModelLoaded(true);
    } catch {
      setModelLoaded(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isLoading || !modelIdStr) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    const placeholderId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: placeholderId, role: 'assistant', text: '' },
    ]);

    try {
      const contextText = buildChatContext(result, useCase);

      const run = completion({
        modelId: modelIdStr,
        history: [
          { role: 'system', content: contextText },
          ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.text,
          })),
          { role: 'user', content: userMsg.text },
        ],
        stream: true,
      });
      currentRunRef.current = run;

      let streamed = '';
      for await (const event of run.events) {
        if (event.type === 'contentDelta') {
          streamed += event.text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, text: streamed } : m
            )
          );
        }
      }

      const final = await run.final;
      currentRunRef.current = null;
      const text = final.contentText || streamed || 'No response';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId ? { ...m, text } : m
        )
      );
    } catch (err) {
      currentRunRef.current = null;
      if (err instanceof InferenceCancelledError) {
        // user navigated away — keep whatever was streamed
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, text: 'Sorry, I encountered an error.' }
              : m
          )
        );
      }
    }

    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: theme.text }]}>
          Follow-up Chat
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.role === 'user'
                ? [styles.userBubble, { backgroundColor: theme.accent }]
                : [styles.assistantBubble, { backgroundColor: theme.card }],
            ]}
          >
            <Text
              style={{
                color: item.role === 'user' ? theme.background : theme.text,
                fontSize: 15,
                lineHeight: 21,
              }}
            >
              {item.text}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Ask a follow-up question about what you scanned
            </Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { borderTopColor: theme.border }]}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.card,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            isLoading
              ? 'Thinking...'
              : modelLoaded
              ? 'Ask a question...'
              : 'Loading model...'
          }
          placeholderTextColor={theme.textSecondary}
          multiline
          editable={!isLoading && modelLoaded}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor:
                isLoading || !modelLoaded ? theme.textSecondary : theme.accent,
            },
          ]}
          onPress={handleSend}
          disabled={isLoading || !modelLoaded}
        >
          <Text
            style={[
              styles.sendButtonText,
              { color: theme.background },
            ]}
          >
            Send
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function buildChatContext(result: any, useCase: string): string {
  const base = `You are a helpful AI assistant. The user scanned an image using the Peek app and got the following result. Answer their follow-up questions conversationally — be specific, helpful, and friendly. Do NOT output JSON.\n\n`;
  switch (useCase) {
    case 'food':
      return base + `FOOD SCAN: "${result.foodName ?? 'a food item'}"
Nutrition per serving: ${result.calories ?? '?'} kcal | Protein ${result.protein ?? '?'}g | Carbs ${result.carbs ?? '?'}g | Fat ${result.fat ?? '?'}g
Health rating: ${result.healthRating ?? '?'}/10
Ingredients: ${result.ingredients?.join(', ') ?? 'unknown'}
${result.funFact ? 'Fun fact: ' + result.funFact : ''}
${result._rawText ? 'Raw analysis: ' + result._rawText : ''}

Help with: recipes, substitutions, allergy questions, nutrition breakdowns, meal planning.`;

    case 'plant':
      return base + `PLANT SCAN: "${result.plantName ?? 'a plant'}" (${result.scientificName ?? ''})
Care level: ${result.careLevel ?? '?'} | Watering: ${result.wateringFrequency ?? '?'}
Toxic: ${result.toxic ? 'Yes — toxic to: ' + result.toxicTo?.join(', ') : 'No'}
Tips: ${result.tips?.join('; ') ?? ''}
${result._rawText ? 'Raw analysis: ' + result._rawText : ''}

Help with: care routines, propagation, pests, soil types, companion planting.`;

    case 'text':
      return base + `DOCUMENT SCAN: ${result.documentType ?? 'document'} in ${result.detectedLanguage ?? 'unknown language'}
Extracted text: ${result.extractedText ?? result._rawText ?? ''}
Summary: ${result.summary ?? ''}
${result.translation ? 'Translation: ' + result.translation : ''}

Help with: deeper explanation, translation, legal/financial interpretation, summarising further.`;

    case 'health':
      return base + `HEALTH SCAN result:
Analysis: ${result.analysis ?? result._rawText ?? ''}
Key information: ${result.keyInformation ?? ''}
IMPORTANT: Always remind the user to consult a qualified healthcare professional for any real medical decision.

Help with: explaining medical terms, understanding dosages/warnings, general health information.`;

    case 'code':
      return base + `CODE SCAN: ${result.detectedLanguage ?? 'code'} detected
Explanation: ${result.explanation ?? result._rawText ?? ''}
Bugs found: ${result.bugs?.length ? result.bugs.join('; ') : 'none'}
Suggestions: ${result.suggestions?.join('; ') ?? ''}

Help with: refactoring, bug fixes, algorithm explanation, best practices, unit tests.`;

    case 'object':
      return base + `OBJECT SCAN: "${result.objectName ?? 'an object'}"${result.category ? ' — ' + result.category : ''}
Description: ${result.description ?? result._rawText ?? ''}
${result.estimatedValue ? 'Estimated value: ' + result.estimatedValue : ''}
${result.funFact ? 'Fun fact: ' + result.funFact : ''}

Help with: history, how it works, where to buy, similar items, usage tips.`;

    default:
      return base + `Scan result:\n${JSON.stringify(result, null, 2)}`;
  }
}

async function findModelById(modelId: string): Promise<ModelInfo | null> {
  const downloaded = await getDownloadedModels();
  const local = downloaded.find((m) => m.id === modelId);
  if (local) return local;
  return AVAILABLE_MODELS.find((m) => m.id === modelId) || null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
