export interface DifficultyCalculationInput {
  bpm: number;
  durationMs: number;
  normalCount: number;
  holdCount: number;
  bombCount: number;
}

/**
 * Estimates a chart difficulty on a 0.01–10.00 scale.
 *
 * The formula weights:
 * - BPM (higher = harder)
 * - Note density (notes per second)
 * - Song length (small endurance bonus)
 * - Note type mix (holds are harder than basics, bombs add pressure)
 *
 * Calibration targets:
 * - ~2.00 = casual
 * - ~5.00 = serious skill threshold
 * - ~7.00–8.00 = very hard
 * - 10.00 = near-impossible extreme charts
 */
export function calculateDifficultyEstimate(input: DifficultyCalculationInput): number {
  const { bpm, durationMs, normalCount, holdCount, bombCount } = input;
  const totalNotes = normalCount + holdCount + bombCount;

  if (totalNotes === 0 || durationMs <= 0) {
    return 1.00;
  }

  const durationSeconds = durationMs / 1000;
  const bpmFactor = Math.max(0.5, bpm / 120);
  const notesPerSecond = totalNotes / durationSeconds;
  const lengthFactor = 1 + (durationSeconds / 900);

  // Very harsh scaling: only the densest, fastest charts reach the top.
  // Most charts will sit between 1.00 and 3.00.
  const densityDifficulty = notesPerSecond * bpmFactor * lengthFactor * 0.2;
  const typeDifficulty = normalCount * 0.0002 + holdCount * 0.0008 + bombCount * 0.0005;

  const rawDifficulty = densityDifficulty + typeDifficulty + 0.1;

  return Math.min(10, Math.max(1.00, Math.round(rawDifficulty * 100) / 100));
}

export function formatDifficultyEstimate(value: number): string {
  return value.toFixed(2);
}
