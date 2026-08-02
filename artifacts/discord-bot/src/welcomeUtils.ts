import { EmbedBuilder, type GuildMember } from 'discord.js';
import type { SavedEmbed } from './types.js';

// ── Variable substitution ─────────────────────────────────────────────────────

/** Replace all template variables in a string with real values from the member. */
export function resolveVariables(text: string, member: GuildMember): string {
  const count = member.guild.memberCount;
  return text
    .replace(/\{user\}/g,          `<@${member.id}>`)
    .replace(/\{user\.name\}/g,    member.user.username)
    .replace(/\{user\.tag\}/g,     member.user.tag)
    .replace(/\{user\.id\}/g,      member.id)
    .replace(/\{server\}/g,        member.guild.name)
    .replace(/\{membercount\}/g,   String(count))
    .replace(/\{ordinal\}/g,       toOrdinal(count));
}

/** Resolve a URL field — supports {user.avatar} and {server.icon} magic values. */
function resolveUrl(url: string, member: GuildMember): string | undefined {
  if (url === '{user.avatar}')  return member.user.displayAvatarURL({ size: 256 });
  if (url === '{server.icon}')  return member.guild.iconURL() ?? undefined;
  return url || undefined;
}

function toOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Embed builder ─────────────────────────────────────────────────────────────

/** Build a discord.js EmbedBuilder from a SavedEmbed, resolving member variables. */
export function buildEmbedFromSaved(saved: SavedEmbed, member: GuildMember): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (saved.color !== undefined) embed.setColor(saved.color as number);
  if (saved.title)       embed.setTitle(resolveVariables(saved.title, member).slice(0, 256));
  if (saved.description) embed.setDescription(resolveVariables(saved.description, member).slice(0, 4096));

  if (saved.thumbnailUrl) {
    const url = resolveUrl(saved.thumbnailUrl, member);
    if (url) embed.setThumbnail(url);
  }
  if (saved.imageUrl) {
    const url = resolveUrl(saved.imageUrl, member);
    if (url) embed.setImage(url);
  }
  if (saved.footerText) {
    embed.setFooter({
      text: resolveVariables(saved.footerText, member).slice(0, 2048),
      iconURL: saved.footerIconUrl ? resolveUrl(saved.footerIconUrl, member) : undefined,
    });
  }
  if (saved.authorName) {
    embed.setAuthor({
      name: resolveVariables(saved.authorName, member).slice(0, 256),
      iconURL: saved.authorIconUrl ? resolveUrl(saved.authorIconUrl, member) : undefined,
    });
  }
  if (saved.fields?.length) {
    embed.addFields(
      saved.fields.slice(0, 25).map(f => ({
        name:   (resolveVariables(f.name, member)  || '\u200b').slice(0, 256),
        value:  (resolveVariables(f.value, member) || '\u200b').slice(0, 1024),
        inline: f.inline ?? false,
      })),
    );
  }

  embed.setTimestamp();
  return embed;
}

/** Build a preview embed (no member — uses placeholder text). */
export function buildEmbedPreview(saved: SavedEmbed): EmbedBuilder {
  const fake = {
    replace: (text: string) =>
      text
        .replace(/\{user\}/g,        '@NewMember')
        .replace(/\{user\.name\}/g,  'NewMember')
        .replace(/\{user\.tag\}/g,   'NewMember')
        .replace(/\{user\.id\}/g,    '123456789')
        .replace(/\{server\}/g,      'Your Server')
        .replace(/\{membercount\}/g, '100')
        .replace(/\{ordinal\}/g,     '100th'),
  };

  const r = (t: string) => fake.replace(t);
  const embed = new EmbedBuilder();

  if (saved.color !== undefined) embed.setColor(saved.color as number);
  if (saved.title)       embed.setTitle(r(saved.title).slice(0, 256));
  if (saved.description) embed.setDescription(r(saved.description).slice(0, 4096));
  if (saved.thumbnailUrl && saved.thumbnailUrl !== '{user.avatar}' && saved.thumbnailUrl !== '{server.icon}')
    embed.setThumbnail(saved.thumbnailUrl);
  if (saved.imageUrl && saved.imageUrl !== '{user.avatar}' && saved.imageUrl !== '{server.icon}')
    embed.setImage(saved.imageUrl);
  if (saved.footerText)
    embed.setFooter({ text: r(saved.footerText).slice(0, 2048) });
  if (saved.authorName)
    embed.setAuthor({ name: r(saved.authorName).slice(0, 256) });
  if (saved.fields?.length) {
    embed.addFields(
      saved.fields.slice(0, 25).map(f => ({
        name:   (r(f.name)  || '\u200b').slice(0, 256),
        value:  (r(f.value) || '\u200b').slice(0, 1024),
        inline: f.inline ?? false,
      })),
    );
  }
  embed.setTimestamp();
  return embed;
}

// ── Inline welcome embed builder ──────────────────────────────────────────────

/** Build an EmbedBuilder from the guild's inline WelcomeEmbed config. */
export function buildWelcomeEmbed(cfg: import('./types.js').WelcomeEmbed, member: GuildMember): EmbedBuilder {
  const embed = new EmbedBuilder();
  if (cfg.color !== undefined) embed.setColor(cfg.color as number);
  if (cfg.title)       embed.setTitle(resolveVariables(cfg.title, member).slice(0, 256));
  if (cfg.description) embed.setDescription(resolveVariables(cfg.description, member).slice(0, 4096));
  if (cfg.thumbnailUrl) {
    const url = resolveUrl(cfg.thumbnailUrl, member);
    if (url) embed.setThumbnail(url);
  }
  if (cfg.imageUrl) {
    const url = resolveUrl(cfg.imageUrl, member);
    if (url) embed.setImage(url);
  }
  if (cfg.footerText) {
    embed.setFooter({ text: resolveVariables(cfg.footerText, member).slice(0, 2048) });
  }
  return embed;
}

/** Build a preview of the inline welcome embed (no real member — uses placeholders). */
export function buildWelcomeEmbedPreview(cfg: import('./types.js').WelcomeEmbed): EmbedBuilder {
  const r = (t: string) => t
    .replace(/\{user\}/g,        '@NewMember')
    .replace(/\{user\.name\}/g,  'NewMember')
    .replace(/\{user\.tag\}/g,   'NewMember#0000')
    .replace(/\{user\.id\}/g,    '123456789')
    .replace(/\{server\}/g,      'Your Server')
    .replace(/\{membercount\}/g, '100')
    .replace(/\{ordinal\}/g,     '100th');

  const embed = new EmbedBuilder();
  if (cfg.color !== undefined) embed.setColor(cfg.color as number);
  if (cfg.title)       embed.setTitle(r(cfg.title).slice(0, 256));
  if (cfg.description) embed.setDescription(r(cfg.description).slice(0, 4096));
  if (cfg.thumbnailUrl && cfg.thumbnailUrl !== '{user.avatar}' && cfg.thumbnailUrl !== '{server.icon}')
    embed.setThumbnail(cfg.thumbnailUrl);
  if (cfg.imageUrl && cfg.imageUrl !== '{user.avatar}' && cfg.imageUrl !== '{server.icon}')
    embed.setImage(cfg.imageUrl);
  if (cfg.footerText)
    embed.setFooter({ text: r(cfg.footerText).slice(0, 2048) });
  return embed;
}

// ── Shared welcome send resolver ──────────────────────────────────────────────

export const DEFAULT_WELCOME_MESSAGE = 'Welcome {user}';

/**
 * Resolve what to send for a welcome event.
 * Priority order:
 *   1. Inline embed (new system) — if `w.embed.enabled`
 *   2. Legacy `{embed:name}` in message — backward-compat with old configs
 *   3. Plain text only
 */
export function resolveWelcomeSend(
  w: import('./types.js').WelcomeConfig,
  member: GuildMember,
  savedEmbeds: Record<string, import('./types.js').SavedEmbed>,
): { content: string | undefined; embeds: EmbedBuilder[] } {
  const rawMessage = w.message ?? DEFAULT_WELCOME_MESSAGE;

  // Priority 1 — new inline embed
  if (w.embed?.enabled && w.embed) {
    return {
      content: resolveVariables(rawMessage, member),
      embeds:  [buildWelcomeEmbed(w.embed, member)],
    };
  }

  // Priority 2 — legacy {embed:name} resolution (backward-compat)
  const embedName = extractEmbedName(rawMessage);
  if (embedName) {
    const saved = savedEmbeds[embedName.toLowerCase()];
    if (saved) {
      const extra = rawMessage.replace(/\{embed:[^}]+\}/i, '').trim();
      return {
        content: extra ? resolveVariables(extra, member) : undefined,
        embeds:  [buildEmbedFromSaved(saved, member)],
      };
    }
  }

  // Priority 3 — plain text
  return {
    content: resolveVariables(rawMessage, member),
    embeds:  [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse hex color (e.g. #5865F2 or FF0000) → Discord-safe 24-bit number.
 * Returns undefined for invalid or out-of-range values.
 */
export function parseColor(hex: string): number | undefined {
  const n = parseInt(hex.replace('#', ''), 16);
  if (isNaN(n) || n < 0 || n > 0xFFFFFF) return undefined;
  return n;
}

/** If the message is exactly `{embed:name}` return the name, else null. */
export function extractEmbedName(message: string): string | null {
  const m = message.match(/^\{embed:(.+)\}$/i);
  return m ? m[1].trim() : null;
}

export const VARIABLES_HELP =
  '`{user}` · `{user.name}` · `{user.tag}` · `{user.id}` · `{server}` · `{membercount}` · `{ordinal}`\n' +
  'URL fields also accept: `{user.avatar}` · `{server.icon}`';
