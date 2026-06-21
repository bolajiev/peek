import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { completion, cancel, InferenceCancelledError } from '@qvac/sdk';
import { llmManager } from '../utils/modelManager';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';
import { getSettings, getGenParams, syncModelsFromDisk, getDefaultModelId } from '../utils/storage';

type Cell = 'X' | 'O' | null;
type Level = 'Easy' | 'Medium' | 'Hard';
type Phase = 'pick-level' | 'playing' | 'done';

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkResult(board: Cell[]): { winner: Cell | 'draw' | null; line: number[] | null } {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(c => c !== null)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

// Minimax — O is maximiser, X is minimiser
function minimax(board: Cell[], isMax: boolean, depth: number): number {
  const { winner } = checkResult(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (winner === 'draw') return 0;
  let best = isMax ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = isMax ? 'O' : 'X';
      const score = minimax(board, !isMax, depth + 1);
      board[i] = null;
      best = isMax ? Math.max(best, score) : Math.min(best, score);
    }
  }
  return best;
}

function bestMoveHard(board: Cell[]): number {
  let best = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = 'O';
      const score = minimax(board, false, 0);
      board[i] = null;
      if (score > best) { best = score; move = i; }
    }
  }
  return move;
}

// Medium: win if can, block if must, otherwise random
function bestMoveMedium(board: Cell[]): number {
  const avail = board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
  for (const i of avail) {
    board[i] = 'O';
    if (checkResult(board).winner === 'O') { board[i] = null; return i; }
    board[i] = null;
  }
  for (const i of avail) {
    board[i] = 'X';
    if (checkResult(board).winner === 'X') { board[i] = null; return i; }
    board[i] = null;
  }
  return avail[Math.floor(Math.random() * avail.length)];
}

function randomAvail(board: Cell[]): number {
  const avail = board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
  return avail[Math.floor(Math.random() * avail.length)];
}

function boardToText(board: Cell[]): string {
  const s = (c: Cell) => c ?? ' ';
  return (
    ` ${s(board[0])} | ${s(board[1])} | ${s(board[2])} \n` +
    `---+---+---\n` +
    ` ${s(board[3])} | ${s(board[4])} | ${s(board[5])} \n` +
    `---+---+---\n` +
    ` ${s(board[6])} | ${s(board[7])} | ${s(board[8])} `
  );
}

// LLM is used only on Easy — asks the model to pick a move (fun, unpredictable)
async function llmMove(board: Cell[]): Promise<number> {
  const avail = board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
  try {
    const gp = await getGenParams();
    const settings = await getSettings();
    const models = await syncModelsFromDisk();
    const defaultId = await getDefaultModelId();
    const modelInfo = models.find(m => m.id === defaultId) ?? models[0];
    if (!modelInfo) return randomAvail(board);

    const cfg: any = { ctx_size: 512, device: settings.accelerator === 'gpu' ? 'gpu' : 'cpu' };
    const mid = await llmManager.ensure(modelInfo, cfg);

    const history = [
      {
        role: 'system' as const,
        content:
          'You are playing Tic-Tac-Toe as O. Positions are numbered 1-9 left-to-right top-to-bottom. ' +
          'Reply with ONLY a single digit — the position number to play. No explanation.',
      },
      {
        role: 'user' as const,
        content:
          `Board:\n${boardToText(board)}\nAvailable: ${avail.map(i => i + 1).join(', ')}\nYour move:`,
      },
    ];

    const run = completion({
      modelId: mid,
      history,
      stream: true,
      captureThinking: false,
      generationParams: {
        predict: 4,
        temp: 1.2,
        top_k: gp.top_k,
        top_p: gp.top_p,
        repeat_penalty: gp.repeat_penalty,
        reasoning_budget: 0 as 0,
      },
    });

    let raw = '';
    for await (const event of run.events) {
      if (event.type === 'contentDelta') raw += event.text;
    }
    await run.final;

    const m = raw.match(/[1-9]/);
    const parsed = m ? parseInt(m[0]) - 1 : -1;
    return parsed >= 0 && parsed <= 8 && board[parsed] === null ? parsed : randomAvail(board);
  } catch {
    return randomAvail(board);
  }
}

export default function PeelFunScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);

  const [level, setLevel] = useState<Level>('Medium');
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [phase, setPhase] = useState<Phase>('pick-level');
  const [winner, setWinner] = useState<Cell | 'draw' | null>(null);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const runRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (runRef.current) cancel({ requestId: runRef.current.requestId }).catch(() => {});
    };
  }, []);

  const startGame = (lv: Level) => {
    if (runRef.current) cancel({ requestId: runRef.current.requestId }).catch(() => {});
    runRef.current = null;
    setLevel(lv);
    setBoard(Array(9).fill(null));
    setPhase('playing');
    setWinner(null);
    setWinLine(null);
    setAiThinking(false);
  };

  const applyResult = (b: Cell[]): boolean => {
    const { winner: w, line } = checkResult(b);
    if (w) {
      if (mountedRef.current) { setWinner(w); setWinLine(line); setPhase('done'); }
      return true;
    }
    return false;
  };

  const doAiMove = async (currentBoard: Cell[], lv: Level) => {
    if (!mountedRef.current) return;
    setAiThinking(true);
    const b = [...currentBoard];

    let pos: number;
    if (lv === 'Hard') {
      pos = bestMoveHard(b);
    } else if (lv === 'Medium') {
      pos = bestMoveMedium(b);
    } else {
      // Easy: ask the LLM — it's fun, unpredictable, may even make mistakes
      try {
        pos = await llmMove(b);
      } catch (e) {
        if (e instanceof InferenceCancelledError) { if (mountedRef.current) setAiThinking(false); return; }
        pos = randomAvail(b);
      }
    }

    if (!mountedRef.current) return;
    b[pos] = 'O';
    setBoard([...b]);
    applyResult(b);
    setAiThinking(false);
  };

  const handleCell = (i: number) => {
    if (phase !== 'playing' || board[i] !== null || aiThinking) return;
    const b = [...board];
    b[i] = 'X';
    setBoard(b);
    if (!applyResult(b)) doAiMove(b, level);
  };

  const renderCell = (i: number) => {
    const cell = board[i];
    const highlight = winLine?.includes(i);
    return (
      <TouchableOpacity
        key={i}
        style={[
          styles.cell,
          { borderColor: theme.border, backgroundColor: highlight ? theme.accent + '28' : theme.card },
        ]}
        onPress={() => handleCell(i)}
        activeOpacity={cell ? 1 : 0.65}
      >
        <Text style={[styles.cellText, { color: cell === 'X' ? theme.accent : theme.text }]}>
          {cell ?? ''}
        </Text>
      </TouchableOpacity>
    );
  };

  const resultLabel = () => {
    if (winner === 'draw') return 'Draw!';
    if (winner === 'X') return 'You win!';
    if (winner === 'O') return 'AI wins!';
    return '';
  };

  const levelDesc: Record<Level, string> = {
    Easy: 'Ask the model to play',
    Medium: 'AI plays smart',
    Hard: 'Minimax — good luck',
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (runRef.current) cancel({ requestId: runRef.current.requestId }).catch(() => {});
            navigation.goBack();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
        >
          <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Peel Fun</Text>
        <View style={{ width: 52 }} />
      </View>

      {phase === 'pick-level' && (
        <View style={styles.center}>
          <Text style={[styles.bigTitle, { color: theme.text }]}>Tic-Tac-Toe</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>You are X  ·  AI is O</Text>
          <View style={{ height: 32 }} />
          <Text style={[styles.levelLabel, { color: theme.textSecondary }]}>Choose difficulty</Text>
          {(['Easy', 'Medium', 'Hard'] as Level[]).map(lv => (
            <TouchableOpacity
              key={lv}
              style={[styles.levelBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => startGame(lv)}
              activeOpacity={0.8}
            >
              <Text style={[styles.levelBtnText, { color: theme.text }]}>{lv}</Text>
              <Text style={[styles.levelBtnSub, { color: theme.textSecondary }]}>{levelDesc[lv]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {phase !== 'pick-level' && (
        <View style={styles.gameArea}>
          <View style={styles.statusRow}>
            {phase === 'done' ? (
              <Text style={[styles.statusText, { color: theme.text }]}>{resultLabel()}</Text>
            ) : aiThinking ? (
              <View style={styles.aiRow}>
                <ActivityIndicator color={theme.accent} size="small" />
                <Text style={[styles.aiText, { color: theme.textSecondary }]}>  AI thinking...</Text>
              </View>
            ) : (
              <Text style={[styles.statusText, { color: theme.text }]}>Your turn</Text>
            )}
          </View>

          <View style={[styles.board, { gap: 6 }]}>
            {Array(9).fill(null).map((_, i) => renderCell(i))}
          </View>

          <Text style={[styles.levelBadge, { color: theme.textSecondary }]}>
            {level} — {levelDesc[level]}
          </Text>

          {phase === 'done' && (
            <View style={styles.doneRow}>
              <TouchableOpacity
                style={[styles.playAgainBtn, { backgroundColor: theme.accent }]}
                onPress={() => startGame(level)}
                activeOpacity={0.8}
              >
                <Text style={[styles.playAgainText, { color: theme.accentFg }]}>Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.changeLevelBtn, { borderColor: theme.border }]}
                onPress={() => setPhase('pick-level')}
                activeOpacity={0.8}
              >
                <Text style={[styles.changeLevelText, { color: theme.textSecondary }]}>Change Level</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const CELL = 92;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1,
  },
  back: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  bigTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6 },
  levelLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  levelBtn: {
    width: 240, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1,
    marginBottom: 10,
  },
  levelBtnText: { fontSize: 17, fontWeight: '700' },
  levelBtnSub: { fontSize: 12, marginTop: 2 },

  gameArea: { flex: 1, alignItems: 'center', paddingTop: 28 },
  statusRow: { height: 38, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statusText: { fontSize: 22, fontWeight: '700' },
  aiRow: { flexDirection: 'row', alignItems: 'center' },
  aiText: { fontSize: 15 },

  board: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: CELL * 3 + 12,
  },
  cell: {
    width: CELL, height: CELL, borderWidth: 1, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  cellText: { fontSize: 44, fontWeight: '800', lineHeight: 52 },

  levelBadge: { fontSize: 12, marginTop: 18, fontWeight: '500' },

  doneRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  playAgainBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 14 },
  playAgainText: { fontSize: 15, fontWeight: '700' },
  changeLevelBtn: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  changeLevelText: { fontSize: 15, fontWeight: '600' },
});
