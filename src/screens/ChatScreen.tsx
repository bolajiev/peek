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
import { loadModel, unloadModel, completion } from '@qvac/sdk';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings } from '../utils/storage';
import { AVAILABLE_MODELS } from '../utils/models';
import { ScanResult } from '../types';

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

  useEffect(() => {
    loadModelForChat();
    return () => {
      if (modelIdStr) {
        unloadModel({ modelId: modelIdStr }).catch(() => {});
      }
    };
  }, []);

  const loadModelForChat = async () => {
    try {
      const modelInfo = AVAILABLE_MODELS.find(
        (m: any) => m.id === modelId
      );
      if (!modelInfo) return;

      const settings = await getSettings();
      const device = settings.accelerator === 'gpu' ? 'gpu' : 'cpu';
      let ctxSize = 2048;
      if (settings.responseLength === 'short') ctxSize = 1024;
      else if (settings.responseLength === 'detailed') ctxSize = 4096;

      const loadConfig: any = {
        modelSrc: modelInfo.modelSrc,
        device,
        ctx_size: ctxSize,
      };

      if (modelInfo.projectionModelSrc) {
        loadConfig.projectionModelSrc = modelInfo.projectionModelSrc;
      }

      const id = await loadModel(loadConfig);
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

    try {
      const contextText = `Previous scan result context:\n${JSON.stringify(
        result,
        null,
        2
      )}\n\nUse case: ${useCase}`;

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
        stream: false,
      });

      const final = await run.final;
      const text = final.contentText || final.raw?.fullText || 'No response';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: 'Sorry, I encountered an error processing your question.',
      };
      setMessages((prev) => [...prev, errorMsg]);
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
