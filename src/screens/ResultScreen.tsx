import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Image,
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
  UseCase,
} from '../types';

type ResultParams = {
  Result: {
    result: ScanResult;
    useCase: string;
    modelId: string;
    imagePath?: string;
    inferenceMs?: number;
    tokensPerSec?: number;
    modelName?: string;
  };
};

const CATEGORY_ACCENT: Record<UseCase, string> = {
  food: '#FF6B35',
  plant: '#22C55E',
  text: '#6366F1',
  health: '#3B82F6',
  code: '#A855F7',
  object: '#F59E0B',
};

const CATEGORY_EMOJI: Record<UseCase, string> = {
  food: '🍎',
  plant: '🌿',
  text: '📄',
  health: '💊',
  code: '💻',
  object: '🔍',
};

export default function ResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ResultParams, 'Result'>>();
  const { result, useCase, modelId, imagePath, inferenceMs, tokensPerSec, modelName } =
    route.params;
  const theme = getTheme(useTheme());
  const accent = CATEGORY_ACCENT[useCase as UseCase] ?? theme.accent;
  const raw = (result as any)._rawText as string | undefined;

  const handleShare = async () => {
    await Share.share({ message: formatResultAsText(result) });
  };

  const handleScanAgain = () => {
    navigation.replace('Camera', { useCase, modelId });
  };

  const handleChat = () => {
    navigation.navigate('Chat', { result, useCase, modelId });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.popToTop()}>
          <Text style={[styles.backText, { color: theme.text }]}>← Home</Text>
        </TouchableOpacity>
        <View style={[styles.categoryChip, { backgroundColor: accent + '20', borderColor: accent + '60' }]}>
          <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[useCase as UseCase]}</Text>
          <Text style={[styles.categoryLabel, { color: accent }]}>{USE_CASE_LABELS[useCase as UseCase]}</Text>
        </View>
        <TouchableOpacity
          style={[styles.scanAgainBtn, { backgroundColor: accent }]}
          onPress={handleScanAgain}
        >
          <Text style={[styles.scanAgainText, { color: '#fff' }]}>Again</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Image thumbnail */}
        {imagePath ? (
          <View style={[styles.imageContainer, { borderColor: accent + '40' }]}>
            <Image source={{ uri: imagePath }} style={styles.thumbnail} resizeMode="cover" />
          </View>
        ) : null}

        {/* Stats strip */}
        {(inferenceMs || modelName) ? (
          <View style={[styles.statsStrip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {modelName ? (
              <View style={styles.statItem}>
                <Text style={[styles.statIcon]}>🧠</Text>
                <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1}>
                  {modelName}
                </Text>
              </View>
            ) : null}
            {inferenceMs ? (
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>⏱</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {(inferenceMs / 1000).toFixed(1)}s
                </Text>
              </View>
            ) : null}
            {tokensPerSec ? (
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>⚡</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {tokensPerSec.toFixed(1)} tok/s
                </Text>
              </View>
            ) : null}
            <View style={[styles.statBadge, { backgroundColor: accent + '20' }]}>
              <Text style={[styles.statBadgeText, { color: accent }]}>On-Device</Text>
            </View>
          </View>
        ) : null}

        {/* Result content */}
        <View style={styles.content}>
          {raw ? (
            <RawResultView raw={raw} accent={accent} theme={theme} />
          ) : useCase === 'food' ? (
            <FoodView result={result as FoodResult} accent={accent} theme={theme} />
          ) : useCase === 'plant' ? (
            <PlantView result={result as PlantResult} accent={accent} theme={theme} />
          ) : useCase === 'text' ? (
            <TextView result={result as TextResult} accent={accent} theme={theme} />
          ) : useCase === 'health' ? (
            <HealthView result={result as HealthResult} accent={accent} theme={theme} />
          ) : useCase === 'code' ? (
            <CodeView result={result as CodeResult} accent={accent} theme={theme} />
          ) : useCase === 'object' ? (
            <ObjectView result={result as ObjectResult} accent={accent} theme={theme} />
          ) : null}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.chatButton, { backgroundColor: accent }]}
          onPress={handleChat}
        >
          <Text style={[styles.chatButtonText, { color: '#fff' }]}>
            💬  Ask a follow-up
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shareButton, { borderColor: theme.border, backgroundColor: theme.card }]}
          onPress={handleShare}
        >
          <Text style={[styles.shareText, { color: theme.text }]}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Raw fallback ────────────────────────────────────────────────────────────

function RawResultView({ raw, accent, theme }: { raw: string; accent: string; theme: any }) {
  return (
    <View>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Analysis</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary, lineHeight: 22 }]}>{raw}</Text>
      </View>
      <View style={[styles.hintCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
        <Text style={[styles.hintText, { color: accent }]}>
          💬 Tap "Ask a follow-up" to dig deeper with a conversation.
        </Text>
      </View>
    </View>
  );
}

// ─── Food ────────────────────────────────────────────────────────────────────

function FoodView({ result, accent, theme }: { result: FoodResult; theme: any; accent: string }) {
  const rating = result.healthRating ?? 0;
  const ratingColor = rating >= 7 ? '#22C55E' : rating >= 4 ? '#F59E0B' : '#EF4444';
  const ratingEmoji = rating >= 7 ? '🟢' : rating >= 4 ? '🟡' : '🔴';

  return (
    <View>
      <Text style={[styles.heroTitle, { color: theme.text }]}>{result.foodName || 'Food Analysis'}</Text>
      {result.servingSize ? (
        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          Per serving: {result.servingSize}
        </Text>
      ) : null}

      {/* Calorie hero */}
      <View style={[styles.calorieCard, { backgroundColor: accent + '18', borderColor: accent + '40' }]}>
        <Text style={[styles.calorieNumber, { color: accent }]}>{result.calories ?? '—'}</Text>
        <Text style={[styles.calorieUnit, { color: accent }]}>kcal</Text>
      </View>

      {/* Macros */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Macronutrients</Text>
        <MacroBar label="Protein" value={result.protein} color="#3B82F6" unit="g" theme={theme} />
        <MacroBar label="Carbs" value={result.carbs} color="#F59E0B" unit="g" theme={theme} />
        <MacroBar label="Fat" value={result.fat} color="#EF4444" unit="g" theme={theme} />
        {result.fiber != null ? (
          <MacroBar label="Fiber" value={result.fiber} color="#22C55E" unit="g" theme={theme} />
        ) : null}
      </View>

      {/* Health rating */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.ratingHeader}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Health Rating</Text>
          <Text style={styles.ratingEmoji}>{ratingEmoji}</Text>
        </View>
        <View style={styles.ratingBarTrack}>
          <View style={[styles.ratingBarFill, { width: `${(rating / 10) * 100}%`, backgroundColor: ratingColor }]} />
        </View>
        <Text style={[styles.ratingLabel, { color: ratingColor }]}>{rating}/10</Text>
      </View>

      {/* Ingredients */}
      {result.ingredients?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Ingredients</Text>
          <View style={styles.chipWrap}>
            {result.ingredients.map((ing, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.chipText, { color: theme.textSecondary }]}>{ing}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <FunFact text={result.funFact} accent={accent} theme={theme} />
    </View>
  );
}

function MacroBar({ label, value, color, unit, theme }: { label: string; value: number; color: string; unit: string; theme: any }) {
  const pct = Math.min((value / 100) * 100, 100);
  return (
    <View style={styles.macroRow}>
      <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.macroBarTrack}>
        <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.macroValue, { color: theme.text }]}>{value ?? '—'}{unit}</Text>
    </View>
  );
}

// ─── Plant ───────────────────────────────────────────────────────────────────

function PlantView({ result, accent, theme }: { result: PlantResult; theme: any; accent: string }) {
  return (
    <View>
      <Text style={[styles.heroTitle, { color: theme.text }]}>{result.plantName || 'Plant Analysis'}</Text>
      {result.scientificName ? (
        <Text style={[styles.scientificName, { color: theme.textSecondary }]}>
          {result.scientificName}
        </Text>
      ) : null}

      {/* Care chips */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Care Overview</Text>
        <View style={styles.careGrid}>
          {result.careLevel ? (
            <CareChip icon="🌱" label="Difficulty" value={result.careLevel} accent={accent} theme={theme} />
          ) : null}
          {result.wateringFrequency ? (
            <CareChip icon="💧" label="Watering" value={result.wateringFrequency} accent={accent} theme={theme} />
          ) : null}
          {result.sunlight ? (
            <CareChip icon="☀️" label="Light" value={result.sunlight} accent={accent} theme={theme} />
          ) : null}
        </View>
      </View>

      {/* Toxicity */}
      {result.toxic ? (
        <View style={[styles.warningCard, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}>
          <Text style={[styles.warningTitle, { color: '#EF4444' }]}>⚠️  Toxic</Text>
          <Text style={[styles.warningBody, { color: theme.textSecondary }]}>
            Dangerous to: {result.toxicTo?.join(', ') || 'certain pets/people'}
          </Text>
        </View>
      ) : (
        <View style={[styles.safeCard, { backgroundColor: '#22C55E15', borderColor: '#22C55E' }]}>
          <Text style={[styles.safeTitle, { color: '#22C55E' }]}>✓  Non-Toxic</Text>
          <Text style={[styles.safeBody, { color: theme.textSecondary }]}>
            Generally safe for people and pets.
          </Text>
        </View>
      )}

      {/* Tips */}
      {result.tips?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Care Tips</Text>
          {result.tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={[styles.tipBullet, { backgroundColor: accent }]} />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>{tip}</Text>
            </View>
          ))}
        </View>
      )}

      <FunFact text={result.funFact} accent={accent} theme={theme} />
    </View>
  );
}

function CareChip({ icon, label, value, accent, theme }: { icon: string; label: string; value: string; accent: string; theme: any }) {
  return (
    <View style={[styles.careChip, { backgroundColor: accent + '15', borderColor: accent + '40' }]}>
      <Text style={styles.careChipIcon}>{icon}</Text>
      <Text style={[styles.careChipLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.careChipValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

// ─── Text/OCR ────────────────────────────────────────────────────────────────

function TextView({ result, accent, theme }: { result: TextResult; theme: any; accent: string }) {
  return (
    <View>
      <View style={styles.badgeRow}>
        {result.documentType ? (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>{result.documentType}</Text>
          </View>
        ) : null}
        {result.detectedLanguage ? (
          <View style={[styles.badge, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
              🌐 {result.detectedLanguage}
            </Text>
          </View>
        ) : null}
      </View>

      {result.extractedText ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Extracted Text</Text>
          <View style={[styles.textBlock, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.extractedText, { color: theme.text }]}>{result.extractedText}</Text>
          </View>
        </View>
      ) : null}

      {result.summary ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Summary</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{result.summary}</Text>
        </View>
      ) : null}

      {result.translation ? (
        <View style={[styles.card, { backgroundColor: accent + '10', borderWidth: 1, borderColor: accent + '30' }]}>
          <Text style={[styles.cardTitle, { color: accent }]}>Translation (EN)</Text>
          <Text style={[styles.cardBody, { color: theme.text }]}>{result.translation}</Text>
        </View>
      ) : null}

      <View style={[styles.hintCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
        <Text style={[styles.hintText, { color: accent }]}>
          💬 Need a deeper explanation or translation? Ask a follow-up question below.
        </Text>
      </View>
    </View>
  );
}

// ─── Health ──────────────────────────────────────────────────────────────────

function HealthView({ result, accent, theme }: { result: HealthResult; theme: any; accent: string }) {
  return (
    <View>
      {/* Disclaimer first — safety */}
      <View style={[styles.warningCard, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B' }]}>
        <Text style={[styles.warningTitle, { color: '#F59E0B' }]}>⚠️  Medical Disclaimer</Text>
        <Text style={[styles.warningBody, { color: theme.textSecondary }]}>
          {result.disclaimer || 'This is for informational purposes only. Consult a qualified healthcare professional.'}
        </Text>
      </View>

      {result.analysis ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>🔬  Analysis</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary, lineHeight: 22 }]}>{result.analysis}</Text>
        </View>
      ) : null}

      {result.keyInformation ? (
        <View style={[styles.card, { backgroundColor: accent + '10', borderWidth: 1, borderColor: accent + '30' }]}>
          <Text style={[styles.cardTitle, { color: accent }]}>📋  Key Information</Text>
          <Text style={[styles.cardBody, { color: theme.text, lineHeight: 22 }]}>{result.keyInformation}</Text>
        </View>
      ) : null}

      <View style={[styles.hintCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
        <Text style={[styles.hintText, { color: accent }]}>
          💬 Have specific questions? Ask the AI for more detail below — but always consult a doctor for real medical decisions.
        </Text>
      </View>
    </View>
  );
}

// ─── Code ────────────────────────────────────────────────────────────────────

function CodeView({ result, accent, theme }: { result: CodeResult; theme: any; accent: string }) {
  return (
    <View>
      <View style={styles.badgeRow}>
        {result.detectedLanguage ? (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>{'</>'} {result.detectedLanguage}</Text>
          </View>
        ) : null}
      </View>

      {result.explanation ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>What it does</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary, lineHeight: 22 }]}>{result.explanation}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          🐛  Bugs {result.bugs?.length > 0 ? `(${result.bugs.length})` : ''}
        </Text>
        {result.bugs?.length > 0 ? (
          result.bugs.map((bug, i) => (
            <View key={i} style={[styles.bugRow, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
              <Text style={[styles.bugText, { color: '#EF4444' }]}>• {bug}</Text>
            </View>
          ))
        ) : (
          <View style={[styles.bugRow, { backgroundColor: '#22C55E15', borderColor: '#22C55E40' }]}>
            <Text style={[styles.bugText, { color: '#22C55E' }]}>✓ No bugs detected</Text>
          </View>
        )}
      </View>

      {result.suggestions?.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>💡  Suggestions</Text>
          {result.suggestions.map((s, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={[styles.tipBullet, { backgroundColor: accent }]} />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.hintCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
        <Text style={[styles.hintText, { color: accent }]}>
          💬 Want to ask about specific lines, request a refactor, or explain an algorithm? Chat below.
        </Text>
      </View>
    </View>
  );
}

// ─── Object ──────────────────────────────────────────────────────────────────

function ObjectView({ result, accent, theme }: { result: ObjectResult; theme: any; accent: string }) {
  return (
    <View>
      <Text style={[styles.heroTitle, { color: theme.text }]}>{result.objectName || 'Object Analysis'}</Text>
      <View style={styles.badgeRow}>
        {result.category ? (
          <View style={[styles.badge, { backgroundColor: accent + '20', borderWidth: 1, borderColor: accent + '60' }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{result.category}</Text>
          </View>
        ) : null}
        {result.estimatedValue ? (
          <View style={[styles.badge, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: theme.text }]}>💰 {result.estimatedValue}</Text>
          </View>
        ) : null}
      </View>

      {result.description ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Description</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary, lineHeight: 22 }]}>{result.description}</Text>
        </View>
      ) : null}

      <FunFact text={result.funFact} accent={accent} theme={theme} />

      <View style={[styles.hintCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
        <Text style={[styles.hintText, { color: accent }]}>
          💬 Curious about history, how it works, or where to buy one? Ask below.
        </Text>
      </View>
    </View>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────

function FunFact({ text, accent, theme }: { text?: string; accent: string; theme: any }) {
  if (!text) return null;
  return (
    <View style={[styles.funFactCard, { backgroundColor: accent + '15', borderColor: accent + '40' }]}>
      <Text style={[styles.funFactIcon]}>💡</Text>
      <Text style={[styles.funFactText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USE_CASE_LABELS: Record<UseCase, string> = {
  food: 'Food',
  plant: 'Plant',
  text: 'Document',
  health: 'Health',
  code: 'Code',
  object: 'Object',
};

function formatResultAsText(result: ScanResult): string {
  const r = result as any;
  if (r._rawText) return r._rawText;
  switch (result.type) {
    case 'food':
      return `🍎 ${result.foodName}\nCalories: ${result.calories} kcal | Protein: ${result.protein}g | Carbs: ${result.carbs}g | Fat: ${result.fat}g\nHealth: ${result.healthRating}/10\n\n${result.funFact}`;
    case 'plant':
      return `🌿 ${result.plantName} (${result.scientificName})\nCare: ${result.careLevel} | Water: ${result.wateringFrequency}\nToxic: ${result.toxic ? 'Yes — ' + result.toxicTo.join(', ') : 'No'}\n\n${result.funFact}`;
    case 'text':
      return `📄 ${result.documentType} · ${result.detectedLanguage}\n\n${result.extractedText}\n\nSummary: ${result.summary}`;
    case 'health':
      return `💊 ${result.analysis}\n\nKey: ${result.keyInformation}\n\n${result.disclaimer}`;
    case 'code':
      return `💻 ${result.detectedLanguage}\n\n${result.explanation}`;
    case 'object':
      return `🔍 ${result.objectName}${result.category ? ' · ' + result.category : ''}\n\n${result.description}\n\n${result.funFact}`;
    default:
      return JSON.stringify(result, null, 2);
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backText: { fontSize: 16, fontWeight: '600' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryEmoji: { fontSize: 14 },
  categoryLabel: { fontSize: 13, fontWeight: '700' },
  scanAgainBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  scanAgainText: { fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  imageContainer: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    height: 200,
  },
  thumbnail: { width: '100%', height: '100%' },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 80,
  },
  statIcon: { fontSize: 13 },
  statValue: { fontSize: 12, fontWeight: '600' },
  statBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statBadgeText: { fontSize: 11, fontWeight: '700' },
  content: { padding: 16 },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroSubtitle: { fontSize: 14, marginBottom: 12 },
  scientificName: {
    fontSize: 15,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  calorieCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  calorieNumber: { fontSize: 64, fontWeight: '900', lineHeight: 72 },
  calorieUnit: { fontSize: 16, fontWeight: '600', opacity: 0.7 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  cardBody: { fontSize: 14, lineHeight: 20 },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  macroLabel: { fontSize: 13, width: 52 },
  macroBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%', borderRadius: 3 },
  macroValue: { fontSize: 13, fontWeight: '600', width: 44, textAlign: 'right' },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratingEmoji: { fontSize: 20 },
  ratingBarTrack: {
    height: 10,
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  ratingBarFill: { height: '100%', borderRadius: 5 },
  ratingLabel: { fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'right' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 13 },
  funFactCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  funFactIcon: { fontSize: 20 },
  funFactText: { fontSize: 14, lineHeight: 20, flex: 1 },
  hintCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  hintText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: { fontSize: 13, fontWeight: '600' },
  textBlock: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  extractedText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
  },
  careGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  careChip: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    minWidth: 90,
    flex: 1,
  },
  careChipIcon: { fontSize: 20, marginBottom: 4 },
  careChipLabel: { fontSize: 11, marginBottom: 2 },
  careChipValue: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
  },
  warningTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  warningBody: { fontSize: 13, lineHeight: 18 },
  safeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
  },
  safeTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  safeBody: { fontSize: 13, lineHeight: 18 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  tipText: { fontSize: 14, lineHeight: 20, flex: 1 },
  bugRow: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 6,
  },
  bugText: { fontSize: 13, lineHeight: 18 },
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
    borderRadius: 14,
    alignItems: 'center',
  },
  chatButtonText: { fontSize: 15, fontWeight: '700' },
  shareButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  shareText: { fontSize: 15, fontWeight: '700' },
});
