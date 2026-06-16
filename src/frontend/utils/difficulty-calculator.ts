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
    return 0.01;
  }

  const durationSeconds = durationMs / 1000;
  const bpmFactor = Math.max(0.5, bpm / 120);
  const notesPerSecond = totalNotes / durationSeconds;
  const lengthFactor = 1 + (durationSeconds / 900);

  // Scaled to give a wide spread: sparse charts ~0.5–1.5, dense charts ~5–10.
  const densityDifficulty = notesPerSecond * bpmFactor * lengthFactor * 3.0;
  const typeDifficulty = normalCount * 0.004 + holdCount * 0.016 + bombCount * 0.01;

  const rawDifficulty = densityDifficulty + typeDifficulty + 0.15;

  return Math.min(10, Math.max(0.01, Math.round(rawDifficulty * 100) / 100));
}

export function formatDifficultyEstimate(value: number): string {
  return value.toFixed(2);
}
