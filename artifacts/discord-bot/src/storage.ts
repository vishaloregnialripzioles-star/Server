import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GuildData, SnipedMessage } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function defaultGuildData(): GuildData {
  return {
    config: {
      starboardThreshold: 3,
      snipeEnabled: true,
      levelRoles: {},
      inviteRoles: {},
      automod: { enabled: false, antiSpam: false, antiScam: false, massMentions: false, suspiciousLinks: false, bannedWords: [], action: 'delete_timeout' },
      giveawayDaily: { enabled: false, message: '🎁 Don’t forget to enter our active giveaway!' },
    },
    antiNuke: { enabled: false, whitelist: [] }, extraOwners: [],
    afk: {}, levels: {}, sparks: {}, warnings: {}, reminders: [], starboard: {}, lastDeleted: {}, lastEdited: {},
    tempRoles: [], tickets: {}, autoResponders: [], giveaways: [], savedEmbeds: {},
    shop: { roles: [], colours: [], customRoles: [] }, recoveryBackups: [],
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
      ...defaults, ...parsed,
      config: { ...defaults.config, ...parsed.config,
        levelRoles: parsed.config?.levelRoles ?? {},
        inviteRoles: parsed.config?.inviteRoles ?? {},
        automod: { ...defaults.config.automod!, ...(parsed.config?.automod ?? {}), bannedWords: parsed.config?.automod?.bannedWords ?? [] },
        giveawayDaily: { ...defaults.config.giveawayDaily!, ...(parsed.config?.giveawayDaily ?? {}) },
      },
      antiNuke: { ...defaults.antiNuke, ...(parsed.antiNuke ?? {}), whitelist: parsed.antiNuke?.whitelist ?? [] },
      extraOwners: parsed.extraOwners ?? [], sparks: parsed.sparks ?? {},
      autoResponders: parsed.autoResponders ?? [], giveaways: parsed.giveaways ?? [], savedEmbeds: parsed.savedEmbeds ?? {}, welcome: parsed.welcome,
      shop: { ...defaults.shop, ...(parsed.shop ?? {}), roles: parsed.shop?.roles ?? [], colours: parsed.shop?.colours ?? [], customRoles: parsed.shop?.customRoles ?? [] },
      recoveryBackups: parsed.recoveryBackups ?? [],
    };
    if (parsed.lastDeleted) data.lastDeleted = migrateSnipeField(parsed.lastDeleted as Record<string, SnipedMessage | SnipedMessage[]>);
    if (parsed.lastEdited) data.lastEdited = migrateSnipeField(parsed.lastEdited as Record<string, SnipedMessage | SnipedMessage[]>);
    return data;
  } catch { return defaultGuildData(); }
}
export function saveGuild(guildId: string, data: GuildData): void { ensureDir(); writeFileSync(getFilePath(guildId), JSON.stringify(data, null, 2), 'utf-8'); }
export function updateGuild(guildId: string, updater: (data: GuildData) => void): void { const data = loadGuild(guildId); updater(data); saveGuild(guildId, data); }
