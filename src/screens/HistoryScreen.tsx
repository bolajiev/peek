import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Paths, File } from 'expo-file-system';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getHistory, clearHistory, getInferenceLogs } from '../utils/storage';
import { logsToCSV } from '../utils/auditLogger';
import { HistoryItem, USE_CASES } from '../types';

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const theme = getTheme(useTheme());
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const items = await getHistory();
    setHistory(items);
  };

  const handleItemPress = useCallback(
    (item: HistoryItem) => {
      navigation.navigate('Result', {
        result: item.result,
        useCase: item.useCase,
        modelId: '',
      });
    },
    [navigation]
  );

  const handleClear = () => {
    Alert.alert('Clear History', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setHistory([]);
        },
      },
    ]);
  };

  const handleExportLogs = async () => {
    try {
      const logs = await getInferenceLogs();
      if (logs.length === 0) {
        Alert.alert('No Logs', 'No inference logs to export.');
        return;
      }

      const csv = logsToCSV(logs);
      const file = new File(Paths.cache, 'peek_inference_logs.csv');
      file.write(csv);

      await Share.share({
        message: `Peek Inference Logs\n\n${csv}`,
        title: 'Peek Inference Logs',
      });
    } catch {
      Alert.alert('Export Failed', 'Could not export logs.');
    }
  };

  const getUseCaseEmoji = (useCase: string) => {
    const uc = USE_CASES.find((u) => u.id === useCase);
    return uc?.emoji || '📷';
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPreviewText = (item: HistoryItem) => {
    switch (item.result.type) {
      case 'food':
        return item.result.foodName;
      case 'plant':
        return item.result.plantName;
      case 'text':
        return item.result.summary?.substring(0, 60) || 'Text scan';
      case 'health':
        return item.result.keyInformation?.substring(0, 60) || 'Health scan';
      case 'code':
        return `${item.result.detectedLanguage}: ${item.result.explanation?.substring(0, 40)}`;
      case 'object':
        return item.result.objectName;
      default:
        return 'Scan result';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>History</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, { borderColor: theme.border }]}
            onPress={handleExportLogs}
          >
            <Text style={[styles.headerBtnText, { color: theme.textSecondary }]}>
              Export Logs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { borderColor: theme.border }]}
            onPress={handleClear}
          >
            <Text style={[styles.headerBtnText, { color: theme.error }]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.historyItem, { backgroundColor: theme.card }]}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.itemEmoji}>
              {getUseCaseEmoji(item.useCase)}
            </Text>
            <View style={styles.itemContent}>
              <Text
                style={[styles.itemPreview, { color: theme.text }]}
                numberOfLines={1}
              >
                {getPreviewText(item)}
              </Text>
              <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                {item.modelName} • {formatTimestamp(item.timestamp)}
              </Text>
            </View>
            <Text style={[styles.itemArrow, { color: theme.textSecondary }]}>
              ›
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No scan history yet
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  itemEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemPreview: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  itemArrow: {
    fontSize: 22,
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
  },
});
