/**
 * jstree's `$.vakata.search` (itself from Fuse.js): a substring match, or —
 * with `fuzzy` — an approximate bitap match whose score adds the error rate to
 * the distance from `location`, accepted at or under `threshold`. Patterns
 * longer than 32 characters match as substrings only, as in jstree.
 */
export interface VakataSearchOptions {
  caseSensitive?: boolean;
  fuzzy?: boolean;
  location?: number;
  distance?: number;
  threshold?: number;
}

/** A matcher for `pattern`, applied to a node's text. */
export function createMatcher(pattern: string, options: VakataSearchOptions = {}): (text: string) => boolean {
  const caseSensitive = options.caseSensitive ?? false;
  const location = options.location ?? 0;
  const distance = options.distance ?? 100;
  const threshold = options.threshold ?? 0.6;
  const needle = caseSensitive ? pattern : pattern.toLowerCase();
  const patternLen = needle.length;
  const fuzzy = Boolean(options.fuzzy) && patternLen <= 32;

  const matchmask = 1 << (patternLen - 1);
  const alphabet: Record<string, number> = {};
  if (fuzzy) {
    for (let i = 0; i < patternLen; i++) alphabet[needle.charAt(i)] = 0;
    for (let i = 0; i < patternLen; i++) alphabet[needle.charAt(i)] |= 1 << (patternLen - i - 1);
  }

  const bitapScore = (errors: number, at: number): number => {
    const accuracy = errors / patternLen;
    const proximity = Math.abs(location - at);
    if (!distance) return proximity ? 1.0 : accuracy;
    return accuracy + proximity / distance;
  };

  return (raw: string): boolean => {
    const text = caseSensitive ? String(raw) : String(raw).toLowerCase();
    if (needle === text || text.indexOf(needle) !== -1) return true;
    if (!fuzzy) return false;

    const textLen = text.length;
    let scoreThreshold = threshold;
    let bestLoc = text.indexOf(needle, location);
    if (bestLoc !== -1) {
      scoreThreshold = Math.min(bitapScore(0, bestLoc), scoreThreshold);
      bestLoc = text.lastIndexOf(needle, location + patternLen);
      if (bestLoc !== -1) scoreThreshold = Math.min(bitapScore(0, bestLoc), scoreThreshold);
    }
    bestLoc = -1;

    let binMax = patternLen + textLen;
    let lastRd: number[] = [];
    for (let i = 0; i < patternLen; i++) {
      // Find how far from `location` a match with i errors can still score.
      let binMin = 0;
      let binMid = binMax;
      while (binMin < binMid) {
        if (bitapScore(i, location + binMid) <= scoreThreshold) binMin = binMid;
        else binMax = binMid;
        binMid = Math.floor((binMax - binMin) / 2 + binMin);
      }
      binMax = binMid;
      let start = Math.max(1, location - binMid + 1);
      const finish = Math.min(location + binMid, textLen) + patternLen;

      const rd: number[] = new Array(finish + 2).fill(0);
      rd[finish + 1] = (1 << i) - 1;
      for (let j = finish; j >= start; j--) {
        const charMatch = alphabet[text.charAt(j - 1)] ?? 0;
        if (i === 0) {
          rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;
        } else {
          rd[j] =
            (((rd[j + 1] << 1) | 1) & charMatch) |
            (((lastRd[j + 1] ?? 0) | (lastRd[j] ?? 0)) << 1) |
            1 |
            (lastRd[j + 1] ?? 0);
        }
        if (rd[j] & matchmask) {
          const score = bitapScore(i, j - 1);
          if (score <= scoreThreshold) {
            scoreThreshold = score;
            bestLoc = j - 1;
            if (bestLoc > location) start = Math.max(1, 2 * location - bestLoc);
            else break;
          }
        }
      }
      if (bitapScore(i + 1, location) > scoreThreshold) break;
      lastRd = rd;
    }
    return bestLoc >= 0;
  };
}
