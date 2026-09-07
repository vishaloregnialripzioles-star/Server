import type { Client } from 'discord.js';
import { BLOX_VALUES, type BloxValueEntry } from './commands/bloxvalue.js';

const SOURCE_URL = 'https://bloxfruitstradehub.com/values';
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SYNC_KEY = Symbol.for('sparxie.bloxvalue.sync.registered');

// Current Update 30 additions / cosmetic entries. Weapon-related entries are intentionally excluded.
const SEEDED: BloxValueEntry[] = [
  { name: 'Magnet', aliases: ['magnet', 'magnet fruit'], rarity: 'Mythical', type: 'Natural', regular: '1.63B', perm: '—', beli: '6M', demand: '10/10', trend: 'Stable', bestFor: 'Trading, PVP' },
  { name: 'Arcsteel Magnet', aliases: ['arcsteel magnet', 'arcsteel'], rarity: 'Limited', type: 'Skin', regular: '4.57B', perm: '—', beli: '—', demand: '10/10', trend: 'Stable', bestFor: 'Trading' },
  { name: 'Runic Fiend Yeti', aliases: ['runic fiend yeti', 'runic fiend', 'runic yeti'], rarity: 'Limited', type: 'Skin', regular: '2.5B', perm: '—', beli: '—', demand: '10/10', trend: 'Stable', bestFor: 'Trading' },
  { name: 'Starlight Gravity', aliases: ['starlight gravity', 'starlight'], rarity: 'Limited', type: 'Skin', regular: '1.08B', perm: '—', beli: '—', demand: '8/10', trend: 'Stable', bestFor: 'Trading' },
  { name: 'Scarlet Ghost', aliases: ['scarlet ghost', 'scarlet'], rarity: 'Limited', type: 'Skin', regular: '130M', perm: '—', beli: '—', demand: '6/10', trend: 'Stable', bestFor: 'Trading' },
  { name: 'Topaz Diamond', aliases: ['topaz diamond', 'topaz'], rarity: 'Limited', type: 'Skin', regular: '180M', perm: '—', beli: '—', demand: '3.2/10', trend: 'Stable', bestFor: 'Trading' },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function upsertSeed(entry: BloxValueEntry): void {
  const existing = BLOX_VALUES.find(x => normalize(x.name) === normalize(entry.name));
  if (!existing) BLOX_VALUES.push(entry);
  else Object.assign(existing, entry, { aliases: [...new Set([...existing.aliases, ...entry.aliases])] });
}

function cleanHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumberValue(raw: string): string | null {
  const value = raw.replace(/,/g, '').trim().toUpperCase();
  if (/^(?:N\/A|NA|—|-|)$/.test(value)) return null;
  if (/^\d+(?:\.\d+)?[KMBT]$/.test(value)) return value;
  return null;
}

function parseDemand(raw: string): string | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? `${match[1]}/10` : null;
}

function findByName(name: string): BloxValueEntry | undefined {
  const target = normalize(name);
  return BLOX_VALUES.find(e => normalize(e.name) === target || e.aliases.some(a => normalize(a) === target));
}

function applyPageText(html: string): number {
  // The public value table is server-rendered. Read table rows defensively so a cosmetic
  // layout change does not break the bot. We only update entries already in our safe catalog.
  let changed = 0;
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  for (const row of html.matchAll(rowRegex)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(cellRegex)) cells.push(cleanHtml(cell[1]));
    if (cells.length < 4) continue;
    const name = cells[0].replace(/^\d+\s*/, '').trim();
    const entry = findByName(name);
    if (!entry) continue;
    const value = parseNumberValue(cells.find(c => /^(?:\d|N\/A|NA|—|-)/i.test(c)) ?? '');
    const demand = cells.map(parseDemand).find(Boolean) ?? null;
    if (value) { entry.regular = value; changed++; }
    if (demand) entry.demand = demand;
  }
  return changed;
}

export async function syncBloxValues(): Promise<void> {
  SEEDED.forEach(upsertSeed);
  try {
    const response = await fetch(SOURCE_URL, { headers: { 'user-agent': 'Sparxie-BloxValueSync/1.0' } });
    if (!response.ok) throw new Error(`value source HTTP ${response.status}`);
    const html = await response.text();
    const changed = applyPageText(html);
    console.log(`[BloxValueSync] synced ${changed} values from ${SOURCE_URL}`);
  } catch (error) {
    console.error('[BloxValueSync] sync failed; keeping last known values:', error);
  }
}

export function registerBloxValueSync(client: Client): void {
  if ((client as any)[SYNC_KEY]) return;
  (client as any)[SYNC_KEY] = true;
  SEEDED.forEach(upsertSeed);
  client.once('ready', () => { void syncBloxValues(); });
  setInterval(() => { void syncBloxValues(); }, SYNC_INTERVAL_MS).unref();
}
