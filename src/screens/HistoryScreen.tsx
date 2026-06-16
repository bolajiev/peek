import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme, useSidebar } from '../navigation/AppNavigator';
import { getHistory, clearHistory } from '../utils/storage';
import { HistoryItem } from '../types';

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const { open: openSidebar } = useSidebar();
  const [items, setItems] = useState<HistoryItem[]>([]);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    const hist = await getHistory();
    setItems([...hist].reverse());
  };

  const handleClear = () => {
    Alert.alert('Clear History', 'Delete all scan history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await clearHistory(); setItems([]); } },
    ]);
  };

  const handleItem = (item: HistoryItem) => {
    navigation.navigate('Result', {
      text: item.result.text || item.result._rawText || '',
      query: item.query || 'Scan result',
      imagePath: item.imagePath,
      modelName: item.modelName,
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 36e5;
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return d.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
      onPress={() => handleItem(item)}
      activeOpacity={0.7}
    >
      {item.imagePath ? (
        <Image source={{ uri: item.imagePath }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumbPlaceholder, { backgroundColor: theme.cardAlt }]}>
          <View style={[styles.thumbDot, { backgroundColor: theme.accent }]} />
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={[styles.rowQuery, { color: theme.text }]} numberOfLines={2}>
          {item.query || 'Scan result'}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.modelName} · {formatTime(item.timestamp)}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={openSidebar} style={styles.menuBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={styles.menuLines}>
            {[22, 18, 22].map((w, i) => (
              <View key={i} style={[styles.menuLine, { backgroundColor: theme.text, width: w }]} />
            ))}
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>History</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.clearBtn, { color: theme.textSecondary }]}>Clear</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { borderColor: theme.border }]}>
            <View style={[styles.emptyIconLine, { backgroundColor: theme.border }]} />
            <View style={[styles.emptyIconLine, { backgroundColor: theme.border, width: 20 }]} />
            <View style={[styles.emptyIconLine, { backgroundColor: theme.border }]} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No scans yet</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Use the camera button to scan something.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  menuBtn: { padding: 4 },
  menuLines: { gap: 4 },
  menuLine: { height: 2, borderRadius: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  clearBtn: { fontSize: 14, fontWeight: '600' },
  list: { paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 14 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { width: 52, height: 52, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  thumbDot: { width: 16, height: 16, borderRadius: 8 },
  rowContent: { flex: 1 },
  rowQuery: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 3 },
  rowMeta: { fontSize: 12 },
  chevron: { fontSize: 20, fontWeight: '300' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', gap: 4, marginBottom: 8 },
  emptyIconLine: { height: 2, width: 28, borderRadius: 1 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
