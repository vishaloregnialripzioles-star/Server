// Banned-word matcher used by AutoMod.
// It normalizes common separator/symbol bypasses while preserving Unicode text.
export function normalizeBannedWordText(input = '') {
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    // Treat common punctuation/symbol insertion as invisible for matching.
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function containsBannedWord(input = '', bannedWords = []) {
  const normalized = normalizeBannedWordText(input);
  if (!normalized) return null;

  for (const word of bannedWords) {
    const candidate = normalizeBannedWordText(word);
    if (candidate && normalized.includes(candidate)) return word;
  }
  return null;
}
