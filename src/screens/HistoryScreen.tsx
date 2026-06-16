import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Share,
  ScrollView,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Paths, File } from 'expo-file-system';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import {
  getHistory,
  clearHistory,
  clearHistoryByCategory,
  getInferenceLogs,
} from '../utils/storage';
import { logsToCSV } from '../utils/auditLogger';
import { HistoryItem, USE_CASES, UseCase } from '../types';

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const theme = getTheme(useTheme());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<UseCase | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    const items = await getHistory();
    setHistory(items);
  };

  const filtered = selectedCategory
    ? history.filter((item) => item.useCase === selectedCategory)
    : history;

  const usedCategories = USE_CASES.filter((uc) =>
    history.some((item) => item.useCase === uc.id)
  );

  const handleItemPress = useCallback(
    (item: HistoryItem) => {
      navigation.navigate('Result', {
        result: item.result,
        useCase: item.useCase,
        modelId: '',
        imagePath: item.imagePath,
        modelName: item.modelName,
      });
    },
    [navigation]
  );

  const handleClear = () => {
    const label = selectedCategory
      ? USE_CASES.find((u) => u.id === selectedCategory)?.label
      : 'All';
    Alert.alert(`Clear ${label} History`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          if (selectedCategory) {
            await clearHistoryByCategory(selectedCategory);
            setHistory((prev) =>
              prev.filter((item) => item.useCase !== selectedCategory)
            );
            setSelectedCategory(null);
          } else {
            await clearHistory();
            setHistory([]);
          }
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

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPreviewText = (item: HistoryItem): string => {
    const raw = (item.result as any)._rawText as string | undefined;
    switch (item.result.type) {
      case 'food':
        return item.result.foodName || raw?.substring(0, 60) || 'Food scan';
      case 'plant':
        return item.result.plantName || raw?.substring(0, 60) || 'Plant scan';
      case 'text':
        return item.result.summary?.substring(0, 60) || raw?.substring(0, 60) || 'Text scan';
      case 'health':
        return item.result.keyInformation?.substring(0, 60) || raw?.substring(0, 60) || 'Health scan';
      case 'code':
        return item.result.detectedLanguage
          ? `${item.result.detectedLanguage}: ${item.result.explanation?.substring(0, 40) || ''}`
          : raw?.substring(0, 60) || 'Code scan';
      case 'object':
        return item.result.objectName || raw?.substring(0, 60) || 'Object scan';
      default:
        return 'Scan result';
    }
  };

  const selectedInfo = selectedCategory
    ? USE_CASES.find((u) => u.id === selectedCategory)
    : null;

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
              Export
            </Text>
          </TouchableOpacity>
          {filtered.length > 0 && (
            <TouchableOpacity
              style={[styles.headerBtn, { borderColor: theme.border }]}
              onPress={handleClear}
            >
              <Text style={[styles.headerBtnText, { color: theme.error }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {usedCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              {
                backgroundColor:
                  selectedCategory === null ? theme.accent : theme.card,
                borderColor:
                  selectedCategory === null ? theme.accent : theme.border,
              },
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    selectedCategory === null
                      ? theme.background
                      : theme.textSecondary,
                },
              ]}
            >
              All ({history.length})
            </Text>
          </TouchableOpacity>

          {usedCategories.map((uc) => {
            const count = history.filter((item) => item.useCase === uc.id).length;
            const isActive = selectedCategory === uc.id;
            return (
              <TouchableOpacity
                key={uc.id}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive ? theme.accent : theme.card,
                    borderColor: isActive ? theme.accent : theme.border,
                  },
                ]}
                onPress={() =>
                  setSelectedCategory(isActive ? null : uc.id)
                }
              >
                <Text style={styles.tabEmoji}>{uc.emoji}</Text>
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: isActive
                        ? theme.background
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const uc = USE_CASES.find((u) => u.id === item.useCase);
          return (
            <TouchableOpacity
              style={[styles.historyItem, { backgroundColor: theme.card }]}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.7}
            >
              {item.imagePath ? (
                <Image
                  source={{ uri: item.imagePath }}
                  style={styles.itemThumbnail}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.itemEmoji}>{uc?.emoji || '📷'}</Text>
              )}
              <View style={styles.itemContent}>
                <Text
                  style={[styles.itemPreview, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {getPreviewText(item)}
                </Text>
                <Text
                  style={[styles.itemMeta, { color: theme.textSecondary }]}
                >
                  {uc?.label} • {item.modelName} •{' '}
                  {formatTimestamp(item.timestamp)}
                </Text>
              </View>
              <Text style={[styles.itemArrow, { color: theme.textSecondary }]}>
                ›
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>
              {selectedInfo ? selectedInfo.emoji : '📋'}
            </Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {selectedInfo
                ? `No ${selectedInfo.label} scans yet`
                : 'No scans yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {selectedInfo
                ? 'Tap the category to deselect and see all scans'
                : 'Your scan results will appear here'}
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
  tabs: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  tabEmoji: {
    fontSize: 14,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  listEmpty: {
    flexGrow: 1,
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
  itemThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
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
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
