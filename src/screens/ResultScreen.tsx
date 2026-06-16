import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import {
  ScanResult,
  FoodResult,
  PlantResult,
  TextResult,
  HealthResult,
  CodeResult,
  ObjectResult,
} from '../types';

type ResultParams = {
  Result: { result: ScanResult; useCase: string; modelId: string };
};

export default function ResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ResultParams, 'Result'>>();
  const { result, useCase, modelId } = route.params;
  const theme = getTheme(useTheme());

  const handleShare = async () => {
    const text = formatResultAsText(result);
    await Share.share({ message: text });
  };

  const handleScanAgain = () => {
    navigation.replace('Camera', { useCase, modelId });
  };

  const handleChat = () => {
    navigation.navigate('Chat', { result, useCase, modelId });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.popToTop()}>
          <Text style={[styles.backText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scanAgainBtn, { backgroundColor: theme.accent }]}
          onPress={handleScanAgain}
        >
          <Text style={[styles.scanAgainText, { color: theme.background }]}>
            Scan Again
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {useCase === 'food' && <FoodResultView result={result as FoodResult} theme={theme} />}
        {useCase === 'plant' && <PlantResultView result={result as PlantResult} theme={theme} />}
        {useCase === 'text' && <TextResultView result={result as TextResult} theme={theme} />}
        {useCase === 'health' && <HealthResultView result={result as HealthResult} theme={theme} />}
        {useCase === 'code' && <CodeResultView result={result as CodeResult} theme={theme} />}
        {useCase === 'object' && <ObjectResultView result={result as ObjectResult} theme={theme} />}
      </ScrollView>

      <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.chatButton, { backgroundColor: theme.accent }]}
          onPress={handleChat}
        >
          <Text style={[styles.chatButtonText, { color: theme.background }]}>
            💬 Ask a follow-up question
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shareButton, { borderColor: theme.accent }]}
          onPress={handleShare}
        >
          <Text style={[styles.shareText, { color: theme.accent }]}>
            Share
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FoodResultView({ result, theme }: { result: FoodResult; theme: any }) {
  return (
    <View>
      <Text style={[styles.resultTitle, { color: theme.text }]}>
        {result.foodName}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.nutritionRow}>
          <NutrientItem label="Calories" value={`${result.calories}`} unit="kcal" theme={theme} />
          <NutrientItem label="Protein" value={`${result.protein}`} unit="g" theme={theme} />
          <NutrientItem label="Carbs" value={`${result.carbs}`} unit="g" theme={theme} />
          <NutrientItem label="Fat" value={`${result.fat}`} unit="g" theme={theme} />
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Health Rating</Text>
        <View style={styles.healthBar}>
          <View
            style={[
              styles.healthFill,
              {
                width: `${(result.healthRating / 10) * 100}%`,
                backgroundColor:
                  result.healthRating >= 7
                    ? '#00FF87'
                    : result.healthRating >= 4
                    ? '#FFA500'
                    : '#FF4444',
              },
            ]}
          />
        </View>
        <Text style={[styles.healthRatingText, { color: theme.textSecondary }]}>
          {result.healthRating}/10
        </Text>
      </View>
      {result.ingredients?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Ingredients</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            {result.ingredients.join(', ')}
          </Text>
        </View>
      )}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Fun Fact 💡</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.funFact}
        </Text>
      </View>
    </View>
  );
}

function NutrientItem({
  label,
  value,
  unit,
  theme,
}: {
  label: string;
  value: string;
  unit: string;
  theme: any;
}) {
  return (
    <View style={styles.nutrientItem}>
      <Text style={[styles.nutrientValue, { color: theme.text }]}>
        {value}
      </Text>
      <Text style={[styles.nutrientUnit, { color: theme.textSecondary }]}>
        {unit}
      </Text>
      <Text style={[styles.nutrientLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function PlantResultView({ result, theme }: { result: PlantResult; theme: any }) {
  return (
    <View>
      <Text style={[styles.resultTitle, { color: theme.text }]}>
        {result.plantName}
      </Text>
      <Text style={[styles.scientificName, { color: theme.textSecondary }]}>
        {result.scientificName}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Care Level</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.careLevel}
        </Text>
        <Text style={[styles.cardTitle, { color: theme.text, marginTop: 12 }]}>
          Watering
        </Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.wateringFrequency}
        </Text>
      </View>
      {result.toxic && (
        <View style={[styles.card, { backgroundColor: theme.card, borderLeftWidth: 3, borderLeftColor: '#FF4444' }]}>
          <Text style={[styles.cardTitle, { color: '#FF4444' }]}>
            ⚠️ Toxic
          </Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Toxic to: {result.toxicTo.join(', ')}
          </Text>
        </View>
      )}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Care Tips</Text>
        {result.tips?.map((tip, i) => (
          <Text key={i} style={[styles.tipItem, { color: theme.textSecondary }]}>
            • {tip}
          </Text>
        ))}
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Fun Fact 💡</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.funFact}
        </Text>
      </View>
    </View>
  );
}

function TextResultView({ result, theme }: { result: TextResult; theme: any }) {
  return (
    <View>
      <View style={[styles.badgeRow]}>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={[styles.badgeText, { color: theme.background }]}>
            {result.documentType}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.card }]}>
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
            {result.detectedLanguage}
          </Text>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Extracted Text</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.extractedText}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Summary</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.summary}
        </Text>
      </View>
      {result.translation && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Translation (EN)
          </Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            {result.translation}
          </Text>
        </View>
      )}
    </View>
  );
}

function HealthResultView({ result, theme }: { result: HealthResult; theme: any }) {
  return (
    <View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Analysis</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.analysis}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Key Information
        </Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.keyInformation}
        </Text>
      </View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderLeftWidth: 3,
            borderLeftColor: '#FFA500',
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: '#FFA500' }]}>
          ⚠️ Disclaimer
        </Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.disclaimer}
        </Text>
      </View>
    </View>
  );
}

function CodeResultView({ result, theme }: { result: CodeResult; theme: any }) {
  return (
    <View>
      <View style={[styles.badgeRow]}>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={[styles.badgeText, { color: theme.background }]}>
            {result.detectedLanguage}
          </Text>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Explanation</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.explanation}
        </Text>
      </View>
      {result.bugs?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: '#FF4444' }]}>🐛 Bugs</Text>
          {result.bugs.map((bug, i) => (
            <Text key={i} style={[styles.tipItem, { color: theme.textSecondary }]}>
              • {bug}
            </Text>
          ))}
        </View>
      )}
      {result.suggestions?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Suggestions
          </Text>
          {result.suggestions.map((s, i) => (
            <Text key={i} style={[styles.tipItem, { color: theme.textSecondary }]}>
              • {s}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function ObjectResultView({ result, theme }: { result: ObjectResult; theme: any }) {
  return (
    <View>
      <Text style={[styles.resultTitle, { color: theme.text }]}>
        {result.objectName}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Description</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.description}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Fun Fact 💡</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {result.funFact}
        </Text>
      </View>
    </View>
  );
}

function formatResultAsText(result: ScanResult): string {
  switch (result.type) {
    case 'food':
      return `🍎 ${result.foodName}\nCalories: ${result.calories} | Protein: ${result.protein}g | Carbs: ${result.carbs}g | Fat: ${result.fat}g\nHealth Rating: ${result.healthRating}/10\n\n${result.funFact}`;
    case 'plant':
      return `🌿 ${result.plantName} (${result.scientificName})\nCare: ${result.careLevel}\nWater: ${result.wateringFrequency}\nToxic: ${result.toxic ? 'Yes' : 'No'}\n\n${result.funFact}`;
    case 'text':
      return `📄 ${result.documentType} - ${result.detectedLanguage}\n\n${result.extractedText}\n\nSummary: ${result.summary}`;
    case 'health':
      return `💊 ${result.analysis}\n\n${result.disclaimer}`;
    case 'code':
      return `💻 ${result.detectedLanguage}\n\n${result.explanation}`;
    case 'object':
      return `🔍 ${result.objectName}\n\n${result.description}\n\n${result.funFact}`;
  }
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
  scanAgainBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanAgainText: {
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  scientificName: {
    fontSize: 15,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutrientItem: {
    alignItems: 'center',
  },
  nutrientValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  nutrientUnit: {
    fontSize: 12,
    marginTop: 1,
  },
  nutrientLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  healthBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  healthFill: {
    height: '100%',
    borderRadius: 4,
  },
  healthRatingText: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'right',
  },
  tipItem: {
    fontSize: 14,
    lineHeight: 22,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    gap: 10,
  },
  chatButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  chatButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shareButton: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
