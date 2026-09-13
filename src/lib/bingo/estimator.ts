export type BingoEstimate = {
  expectedDraws: number;
  estimatedSeconds: number;
};

type LineTerm = readonly [sign: 1 | -1, coveredCells: number];

const lineTermsCache = new Map<string, readonly LineTerm[]>();

/** Probability that all K selected card cells are among the first t songs called. */
function cardCompletionProbability(t: number, songsPerCard: number, songPoolSize: number): number {
  if (songsPerCard < 0 || songsPerCard > songPoolSize || t < songsPerCard) return 0;

  let probability = 1;
  for (let j = 0; j < songsPerCard; j += 1) {
    probability *= (t - j) / (songPoolSize - j);
  }
  return probability;
}

function getLineTerms(rows: number, cols: number): readonly LineTerm[] {
  const key = `${rows}x${cols}`;
  const cached = lineTermsCache.get(key);
  if (cached) return cached;

  const lines: Set<number>[] = [];
  for (let row = 0; row < rows; row += 1) {
    lines.push(new Set(Array.from({ length: cols }, (_, col) => row * cols + col)));
  }
  for (let col = 0; col < cols; col += 1) {
    lines.push(new Set(Array.from({ length: rows }, (_, row) => row * cols + col)));
  }
  if (rows === cols) {
    lines.push(new Set(Array.from({ length: rows }, (_, index) => index * rows + index)));
    lines.push(new Set(Array.from({ length: rows }, (_, index) => index * rows + (rows - 1 - index))));
  }

  const terms: LineTerm[] = [];
  // Inclusion-exclusion over all possible winning lines.
  for (let mask = 1; mask < (1 << lines.length); mask += 1) {
    const union = new Set<number>();
    let selectedLines = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if ((mask & (1 << lineIndex)) !== 0) {
        lines[lineIndex].forEach((cell) => union.add(cell));
        selectedLines += 1;
      }
    }
    terms.push([selectedLines % 2 === 1 ? 1 : -1, union.size]);
  }

  lineTermsCache.set(key, terms);
  return terms;
}

function lineCompletionProbability(
  t: number,
  songPoolSize: number,
  rows: number,
  cols: number
): number {
  return getLineTerms(rows, cols).reduce(
    (total, [sign, coveredCells]) =>
      total + sign * cardCompletionProbability(t, coveredCells, songPoolSize),
    0
  );
}

function expectedDraws(probabilityNoWinAtDraw: (draw: number) => number, songPoolSize: number): number {
  let sum = 0;
  for (let draw = 0; draw < songPoolSize; draw += 1) {
    sum += probabilityNoWinAtDraw(draw);
  }
  return sum;
}

/** Expected number of called songs until at least one card completes. */
export function expectedLineDraws(
  songPoolSize: number,
  rows: number,
  cols: number,
  cardCount: number
): number {
  if (songPoolSize <= 0 || rows <= 0 || cols <= 0 || cardCount <= 0) return 0;

  return expectedDraws(
    (draw) => {
      const probability = Math.min(
        1,
        Math.max(0, lineCompletionProbability(draw, songPoolSize, rows, cols))
      );
      return Math.pow(1 - probability, cardCount);
    },
    songPoolSize
  );
}

/** Expected number of called songs until at least one card is completely filled. */
export function expectedFullCardDraws(
  songPoolSize: number,
  songsPerCard: number,
  cardCount: number
): number {
  if (songPoolSize <= 0 || songsPerCard <= 0 || songsPerCard > songPoolSize || cardCount <= 0) {
    return 0;
  }

  return expectedDraws(
    (draw) =>
      Math.pow(1 - cardCompletionProbability(draw, songsPerCard, songPoolSize), cardCount),
    songPoolSize
  );
}

export function estimateBingoTimes(
  songPoolSize: number,
  rows: number,
  cols: number,
  cardCount: number,
  averageClipSeconds: number
): { line: BingoEstimate; fullCard: BingoEstimate } {
  const averageSeconds = Math.max(0, averageClipSeconds);
  const lineDraws = expectedLineDraws(songPoolSize, rows, cols, cardCount);
  const fullCardDraws = expectedFullCardDraws(songPoolSize, rows * cols, cardCount);

  return {
    line: {
      expectedDraws: lineDraws,
      estimatedSeconds: lineDraws * averageSeconds,
    },
    fullCard: {
      expectedDraws: fullCardDraws,
      estimatedSeconds: fullCardDraws * averageSeconds,
    },
  };
}

export function formatEstimateDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const roundedMinutes = Math.round(seconds / 60);
  if (roundedMinutes < 1) return "under 1 min";
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function formatEstimateDraws(draws: number): string {
  return `${draws.toFixed(1)} songs`;
}