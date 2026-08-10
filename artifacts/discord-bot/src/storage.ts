import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GuildData, SnipedMessage } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function defaultGuildData(): GuildData {
  return {
    config: { starboardThreshold: 3, snipeEnabled: true },
    afk: {}, levels: {}, sparks: {}, warnings: {}, reminders: [], starboard: {}, lastDeleted: {}, lastEdited: {},
    tempRoles: [], tickets: {}, autoResponders: [], giveaways: [], savedEmbeds: {},
  };
}
function ensureDir(): void { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function getFilePath(guildId: string): string { return join(DATA_DIR, `${guildId}.json`); }

function migrateSnipeField(field: Record<string, SnipedMessage | SnipedMessage[] | unknown>): Record<string, SnipedMessage[]> {
  const result: Record<string, SnipedMessage[]> = {};
  for (const [channelId, value] of Object.entries(field)) {
    if (Array.isArray(value)) result[channelId] = value as SnipedMessage[];
    else if (value && typeof value === 'object' && 'authorId' in value) result[channelId] = [value as SnipedMessage];
  }
  return result;
}

export function loadGuild(guildId: string): GuildData {
  ensureDir();
  const path = getFilePath(guildId);
  if (!existsSync(path)) return defaultGuildData();
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GuildData>;
    const defaults = defaultGuildData();
    const data: GuildData = {
      ...defaults, ...parsed, config: { ...defaults.config, ...parsed.config }, sparks: parsed.sparks ?? {},
      autoResponders: parsed.autoResponders ?? [], giveaways: parsed.giveaways ?? [], savedEmbeds: parsed.savedEmbeds ?? {}, welcome: parsed.welcome,
    };
    if (parsed.lastDeleted) data.lastDeleted = migrateSnipeField(parsed.lastDeleted as Record<string, SnipedMessage | SnipedMessage[]>);
    if (parsed.lastEdited) data.lastEdited = migrateSnipeField(parsed.lastEdited as Record<string, SnipedMessage | SnipedMessage[]>);
    return data;
  } catch { return defaultGuildData(); }
}
export function saveGuild(guildId: string, data: GuildData): void { ensureDir(); writeFileSync(getFilePath(guildId), JSON.stringify(data, null, 2), 'utf-8'); }
export function updateGuild(guildId: string, updater: (data: GuildData) => void): void { const data = loadGuild(guildId); updater(data); saveGuild(guildId, data); }
