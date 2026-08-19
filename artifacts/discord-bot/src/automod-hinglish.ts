export const HINGLISH_CURSED_WORD_LIMIT = 1000;

const substitutionMap: Record<string, string> = {
  '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't',
};

/** Normalize common punctuation/leet substitutions so g@y, g?y and g&y can match gay. */
export function normalizeCursedText(value: string): string {
  return Array.from(value.toLocaleLowerCase()).map(ch => substitutionMap[ch] ?? ch).join('');
}

export function matchesHinglishCursedWord(content: string, words: string[]): string | undefined {
  const normalizedContent = normalizeCursedText(content);
  for (const word of words.slice(0, HINGLISH_CURSED_WORD_LIMIT)) {
    const normalizedWord = normalizeCursedText(word.trim()).replace(/[^\p{L}\p{N}]+/gu, '');
    if (!normalizedWord) continue;
    const compact = normalizedContent.replace(/[^\p{L}\p{N}]+/gu, ' ');
    const boundary = new RegExp(`(?:^|[^\\p{L}\\p{N}])${normalizedWord}(?:$|[^\\p{L}\\p{N}])`, 'u');
    if (boundary.test(compact)) return word.trim().toLocaleLowerCase();
    if (normalizedContent.replace(/[^\p{L}\p{N}]/gu, '').includes(normalizedWord)) return word.trim().toLocaleLowerCase();
  }
  return undefined;
}
