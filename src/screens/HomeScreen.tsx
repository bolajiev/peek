import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { USE_CASES, ModelInfo, UseCase, DownloadedModel } from '../types';
import { getScanStreak, getDownloadedModels } from '../utils/storage';

const CARD_ACCENT: Record<UseCase, string> = {
  food: '#FF6B35',
  plant: '#22C55E',
  text: '#6366F1',
  health: '#3B82F6',
  code: '#A855F7',
  object: '#F59E0B',
};

const CARD_SUBTITLE: Record<UseCase, string> = {
  food: 'Calories & macros',
  plant: 'Species & care',
  text: 'Extract & translate',
  health: 'Medical analysis',
  code: 'Debug & explain',
  object: 'Identify anything',
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const theme = getTheme(useTheme());
  const isDark = useTheme() === 'dark';
  const [streak, setStreak] = useState(0);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showNoModelAlert, setShowNoModelAlert] = useState(false);
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [compatibleModels, setCompatibleModels] = useState<ModelInfo[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStreak();
      loadDownloaded();
    }, [])
  );

  const loadStreak = async () => {
    const s = await getScanStreak();
    setStreak(s.count);
  };

  const loadDownloaded = async () => {
    const models = await getDownloadedModels();
    setDownloadedModels(models);
  };

  const availableUseCases = downloadedModels.length === 0
    ? USE_CASES
    : USE_CASES.filter((uc) => downloadedModels.some((d) => d.supports.includes(uc.id)));

  const handleUseCasePress = useCallback(async (useCase: UseCase) => {
    const downloaded = await getDownloadedModels();
    const compatible = downloaded.filter((d) => d.supports.includes(useCase));

    if (compatible.length === 0) {
      setSelectedUseCase(useCase);
      setShowNoModelAlert(true);
    } else if (compatible.length === 1) {
      navigation.navigate('Camera', { useCase, modelId: compatible[0].id });
    } else {
      setSelectedUseCase(useCase);
      setCompatibleModels(compatible);
      setShowModelPicker(true);
    }
  }, [navigation]);

  const handleModelPick = (modelId: string) => {
    setShowModelPicker(false);
    if (selectedUseCase) {
      navigation.navigate('Camera', { useCase: selectedUseCase, modelId });
    }
  };

  const renderUseCaseCard = ({ item }: { item: typeof USE_CASES[0] }) => {
    const accent = CARD_ACCENT[item.id];
    const subtitle = CARD_SUBTITLE[item.id];
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: isDark ? theme.card : '#fff',
            borderColor: accent + '44',
            shadowColor: accent,
          },
        ]}
        onPress={() => handleUseCasePress(item.id)}
        activeOpacity={0.75}
      >
        <View style={[styles.cardIconWrap, { backgroundColor: accent + '18' }]}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
        </View>
        <View style={[styles.cardAccentBar, { backgroundColor: accent }]} />
        <Text style={[styles.cardLabel, { color: theme.text }]}>
          {item.label}
        </Text>
        <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
          {subtitle}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../peeklogo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.headerLogo, { color: theme.accent }]}>Peek</Text>
        </View>
        <View style={styles.headerRight}>
          {streak > 1 && (
            <View style={[styles.streakBadge, { backgroundColor: '#FF6B35' }]}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {downloadedModels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={require('../../peeklogo.png')}
            style={styles.emptyLogo}
            resizeMode="contain"
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Welcome to Peek
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Download an AI model to start scanning food, plants, text, and more — privately on your device.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: theme.accent }]}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Models' })}
          >
            <Text style={[styles.emptyBtnText, { color: theme.background }]}>
              Get a Model →
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            What do you want to scan?
          </Text>
          <FlatList
            data={availableUseCases}
            renderItem={renderUseCaseCard}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Model picker modal */}
      <Modal
        visible={showModelPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Model</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Multiple models support this scan type
            </Text>
            {compatibleModels.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[styles.modalItem, { borderBottomColor: theme.border }]}
                onPress={() => handleModelPick(model.id)}
              >
                <Text style={[styles.modalItemName, { color: theme.text }]}>{model.name}</Text>
                <Text style={[styles.modalItemSize, { color: theme.textSecondary }]}>{model.size}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalCancel, { borderColor: theme.border }]}
              onPress={() => setShowModelPicker(false)}
            >
              <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* No model alert */}
      <Modal
        visible={showNoModelAlert}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoModelAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={styles.modalEmoji}>⬇️</Text>
            <Text style={[styles.modalTitle, { color: theme.text }]}>No Model Yet</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Download an AI model first to start scanning.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: theme.accent }]}
              onPress={() => {
                setShowNoModelAlert(false);
                navigation.navigate('MainTabs', { screen: 'Models' });
              }}
            >
              <Text style={[styles.modalButtonText, { color: theme.background }]}>
                Go to Models
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancel, { borderColor: theme.border }]}
              onPress={() => setShowNoModelAlert(false)}
            >
              <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  headerLogo: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  streakText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  settingsButton: { padding: 4 },
  settingsIcon: { fontSize: 22 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  grid: {
    padding: 12,
    paddingBottom: 32,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  card: {
    width: '48%',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardEmoji: {
    fontSize: 28,
  },
  cardAccentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  cardSub: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyLogo: {
    width: 100,
    height: 100,
    borderRadius: 24,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  emptyBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
  },
  modalEmoji: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalItemName: { fontSize: 16, fontWeight: '600' },
  modalItemSize: { fontSize: 14 },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtonText: { fontSize: 16, fontWeight: '700' },
  modalCancel: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600' },
});
