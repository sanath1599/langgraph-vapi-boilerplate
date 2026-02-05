/**
 * Parse user utterance for an option choice (1-based: "first", "second", "option 2", "2", etc.).
 * Returns 0-based index for use with arrays, or -1 if no valid option was detected.
 */
const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Match "option N", "N", "Nst/Nnd/Nrd/Nth", "first", "second", "the first one", "the second one", etc. */
export function parseOptionIndex(utterance: string): number {
  const trimmed = utterance.trim().toLowerCase();
  if (!trimmed) return -1;

  // "option 1", "option 2"
  const optionNum = trimmed.match(/option\s*(\d+)/);
  if (optionNum) {
    const n = parseInt(optionNum[1], 10);
    return n >= 1 ? n - 1 : -1;
  }

  // Bare digit at end or whole string: "1", "2", "the 2"
  const bareDigit = trimmed.match(/^(?:the\s+)?(\d+)\s*$/);
  if (bareDigit) {
    const n = parseInt(bareDigit[1], 10);
    return n >= 1 ? n - 1 : -1;
  }

  // "1st", "2nd", "3rd", "4th" or "the 2nd one"
  const ordinalNum = trimmed.match(/(?:the\s+)?(\d+)(?:st|nd|rd|th)(?:\s+one)?\s*$/);
  if (ordinalNum) {
    const n = parseInt(ordinalNum[1], 10);
    return n >= 1 ? n - 1 : -1;
  }

  // Word ordinals: "first", "second", "the first one", "the second one" (at end or anywhere as phrase)
  for (const [word, oneBased] of Object.entries(ORDINAL_WORDS)) {
    const re = new RegExp(`(?:the\\s+)?\\b${word}\\b(?:\\s+one)?(?:\\s*$|\\s)`, "i");
    if (re.test(trimmed)) return oneBased >= 1 ? oneBased - 1 : -1;
  }

  return -1;
}
