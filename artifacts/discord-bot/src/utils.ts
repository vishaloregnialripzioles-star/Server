import { EmbedBuilder, PermissionsBitField, type Guild, type Role, type BaseGuildTextChannel } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';

export async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const data = loadGuild(guild.id);
  if (!data.config.logChannel) return;
  try {
    const channel = await guild.channels.fetch(data.config.logChannel);
    if (channel?.isTextBased()) {
      await (channel as BaseGuildTextChannel).send({ embeds: [embed] });
    }
  } catch {
    // log channel deleted or inaccessible
  }
}

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/i;
const MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDuration(input: string): number | null {
  const match = DURATION_REGEX.exec(input);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return value * MULTIPLIERS[unit];
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function levelFromXp(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

export function xpToNextLevel(level: number): number {
  const nextLevel = level + 1;
  return Math.pow(nextLevel / 0.1, 2);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function formatTimestamp(ts: number): string {
  return `<t:${Math.floor(ts / 1000)}:F>`;
}

/**
 * Returns the guild's Chat Banned role, creating it (and channel overwrites)
 * automatically if it doesn't exist yet. Never throws.
 */
export async function ensureChatBanRole(guild: Guild): Promise<Role> {
  const data = loadGuild(guild.id);

  // Re-use existing role if it's still alive
  if (data.config.chatBanRole) {
    const existing = await guild.roles.fetch(data.config.chatBanRole).catch(() => null);
    if (existing) return existing;
  }

  // Create a plain marker role — no permissions needed.
  // The bot's messageCreate handler does the actual enforcement by instantly
  // deleting any message from a member who holds this role.
  const role = await guild.roles.create({
    name: 'Chat Banned',
    color: 0x808080,
    hoist: false,
    mentionable: false,
    permissions: new PermissionsBitField(),
    reason: 'Auto-created by bot for /chatban',
  });

  // Persist the role ID so we don't recreate it
  updateGuild(guild.id, d => { d.config.chatBanRole = role.id; });

  return role;
}
