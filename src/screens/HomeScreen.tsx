import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { USE_CASES, ModelInfo, UseCase } from '../types';
import { getScanStreak, getDownloadedModels } from '../utils/storage';
import { getModelsForUseCase } from '../utils/models';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const theme = getTheme(useTheme());
  const [streak, setStreak] = useState(0);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showNoModelAlert, setShowNoModelAlert] = useState(false);
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [compatibleModels, setCompatibleModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    loadStreak();
  }, []);

  const loadStreak = async () => {
    const s = await getScanStreak();
    setStreak(s.count);
  };

  const handleUseCasePress = useCallback(async (useCase: UseCase) => {
    const models = getModelsForUseCase(useCase);
    const downloaded = await getDownloadedModels();
    const compatible = models.filter((m) =>
      downloaded.some((d) => d.id === m.id)
    );

    if (compatible.length === 0) {
      setSelectedUseCase(useCase);
      setShowNoModelAlert(true);
    } else if (compatible.length === 1) {
      navigation.navigate('Camera', {
        useCase,
        modelId: compatible[0].id,
      });
    } else {
      setSelectedUseCase(useCase);
      setCompatibleModels(compatible);
      setShowModelPicker(true);
    }
  }, [navigation]);

  const handleModelPick = (modelId: string) => {
    setShowModelPicker(false);
    if (selectedUseCase) {
      navigation.navigate('Camera', {
        useCase: selectedUseCase,
        modelId,
      });
    }
  };

  const renderUseCaseCard = ({ item }: any) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card }]}
      onPress={() => handleUseCasePress(item.id)}
      activeOpacity={0.7}
    >
      <Text style={styles.cardEmoji}>{item.emoji}</Text>
      <Text style={[styles.cardLabel, { color: theme.text }]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerLogo, { color: theme.accent }]}>
            👁️ Peek
          </Text>
        </View>
        <View style={styles.headerRight}>
          {streak > 1 && (
            <View style={[styles.streakBadge, { backgroundColor: theme.accent }]}>
              <Text style={[styles.streakText, { color: theme.background }]}>
                🔥 {streak}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={[styles.settingsIcon, { color: theme.text }]}>
              ⚙️
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={USE_CASES}
        renderItem={renderUseCaseCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={showModelPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Model
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Multiple models support this use case
            </Text>
            {compatibleModels.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[styles.modalItem, { borderBottomColor: theme.border }]}
                onPress={() => handleModelPick(model.id)}
              >
                <Text style={[styles.modalItemName, { color: theme.text }]}>
                  {model.name}
                </Text>
                <Text style={[styles.modalItemSize, { color: theme.textSecondary }]}>
                  {model.size}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalCancel, { borderColor: theme.border }]}
              onPress={() => setShowModelPicker(false)}
            >
              <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNoModelAlert}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoModelAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              No Model Available
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              You need to download a model that supports this use case first.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: theme.accent }]}
              onPress={() => {
                setShowNoModelAlert(false);
                navigation.navigate('MainTabs', { screen: 'Models' });
              }}
            >
              <Text
                style={[
                  styles.modalButtonText,
                  { color: theme.background },
                ]}
              >
                Go to Models
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancel, { borderColor: theme.border }]}
              onPress={() => setShowNoModelAlert(false)}
            >
              <Text
                style={[styles.modalCancelText, { color: theme.textSecondary }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    fontSize: 24,
    fontWeight: '800',
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
    fontSize: 13,
    fontWeight: '700',
  },
  settingsButton: {
    padding: 4,
  },
  settingsIcon: {
    fontSize: 22,
  },
  grid: {
    padding: 12,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  cardEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalItemSize: {
    fontSize: 14,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancel: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
