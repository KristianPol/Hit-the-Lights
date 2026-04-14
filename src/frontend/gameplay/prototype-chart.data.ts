type ChartNote = { time: number; lane: number };
type PatternStep = number | number[];

const addPattern = (
  notes: ChartNote[],
  startTime: number,
  stepMs: number,
  repeats: number,
  sequence: PatternStep[]
): number => {
  let time = startTime;
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const step of sequence) {
      const lanes = Array.isArray(step) ? step : [step];
      for (const lane of lanes) {
        notes.push({ time, lane });
      }
      time += stepMs;
    }
  }
  return time;
};

const buildHardPrototypeNotes = (): ChartNote[] => {
  const notes: ChartNote[] = [];
  let time = 2000;

  // Section 1: warm-up stream
  time = addPattern(notes, time, 50, 6, [0, 1, 2, 3, 2, 1]);

  // Section 2: staircase + reverses + light chords
  time = addPattern(notes, time, 100, 8, [0, 1, [0, 2], 3, [1, 3], 2, 1, 0]);

  // Section 3: anchors with bursts and doubles
  time = addPattern(notes, time, 80, 10, [0, [0, 2], 1, 3, [1, 2], 2, 0, [0, 3]]);

  // Section 4: dense alternating hands + jumps
  time = addPattern(notes, time, 90, 14, [0, 2, [0, 1], 3, 0, [2, 3], 1, 3]);

  // Section 5: jacks, crossovers, and chord accents
  time = addPattern(notes, time, 130, 12, [0, 0, [0, 2], 1, 1, [1, 3], 2, 2, [0, 3], 3]);

  // Section 6: faster finale with repeating chords
  time = addPattern(notes, time, 115, 16, [0, [0, 1], 3, 2, [0, 2], 2, 3, [1, 3], 0, 3, [2, 3], 1]);

  // Section 7: final rush with heavy simultaneous hits
  addPattern(notes, time, 100, 10, [[0, 2], 2, [1, 3], 1, [0, 1], 1, [2, 3], 3, [1, 3], [0, 2], 0, 2]);

  return notes;
};

const notes = buildHardPrototypeNotes();
const durationMs = (notes.at(-1)?.time ?? 0) + 2000;

export const PROTOTYPE_CHART = {
  metadata: {
    title: 'School Project - Prototype Challenge',
    artist: 'Test',
    bpm: 160,
    duration_ms: durationMs,
    description: `Long hard chart generated for prototype gameplay (${notes.length} notes).`
  },
  notes
};

