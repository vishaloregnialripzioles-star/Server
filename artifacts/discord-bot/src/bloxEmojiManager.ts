import type { Client } from 'discord.js';
import { BLOX_VALUES, type BloxValueEntry } from './commands/bloxvalue.js';

const cache = new Map<string, string>();
let loaded = false;

export function emojiNameForBlox(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `bf_${cleaned}`.slice(0, 32);
}

export async function loadBloxApplicationEmojis(client: Client): Promise<void> {
  try {
    const application = client.application;
    if (!application) return;
    const emojis = await application.emojis.fetch();
    cache.clear();
    for (const emoji of emojis.values()) {
      if (emoji.name) cache.set(emoji.name, emoji.toString());
    }
    loaded = true;
  } catch (error) {
    console.error('[BloxEmoji] Failed to load application emojis:', error);
  }
}

export async function refreshBloxApplicationEmojis(client: Client): Promise<void> {
  loaded = false;
  await loadBloxApplicationEmojis(client);
}

export async function getBloxEmoji(client: Client, entry: BloxValueEntry): Promise<string> {
  if (!loaded) await loadBloxApplicationEmojis(client);
  return cache.get(emojiNameForBlox(entry.name)) ?? '';
}

function wikiSlug(name: string): string {
  return name.trim().replace(/[()]/g, '').replace(/\s+/g, '_');
}

export async function findBloxImageUrl(name: string): Promise<string | null> {
  const candidates = [
    `https://bloxfruitswiki.org/wiki/${encodeURIComponent(wikiSlug(name))}`,
    `https://bloxfruitswiki.org/wiki/${encodeURIComponent(wikiSlug(name).toLowerCase())}`,
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Sparxie-BloxEmoji/1.0' } });
      if (!response.ok) continue;
      const html = await response.text();
      const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (match?.[1]) return match[1].replace(/&amp;/g, '&');
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export function emojiEligible(entry: BloxValueEntry): boolean {
  // Keep the automatic emoji set focused on fruits, cosmetic skins and gamepasses.
  // Weapon-related entries are intentionally excluded.
  return !/blade/i.test(entry.name);
}

export function allEmojiEntries(): BloxValueEntry[] {
  return BLOX_VALUES.filter(emojiEligible);
}
