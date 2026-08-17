import type { Message, BaseGuildTextChannel, GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { levelFromXp } from '../utils.js';
import { handlePrefixCommand, getGuildPrefix } from '../prefixHandler.js';
import { handleMissingPrefixCommand } from '../prefixBridge.js';
import { buildLevelUpEmbed } from '../commands/levelconfig.js';

const XP_COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;
const spamTracker = new Map<string, number[]>();

function containsAutoresponderTrigger(content: string, trigger: string): boolean {
  const normalizedContent = content.toLocaleLowerCase();
  const normalizedTrigger = trigger.toLocaleLowerCase().trim();
  if (!normalizedTrigger) return false;
  const escapedTrigger = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedTrigger}($|[^\\p{L}\\p{N}_])`, 'u');
  return pattern.test(normalizedContent);
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matchesBannedWord(content: string, words: string[]): string | undefined {
  const normalized = content.toLocaleLowerCase();
  for (const word of words) {
    const w = word.trim().toLocaleLowerCase();
    if (!w) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(w)}($|[^\\p{L}\\p{N}_])`, 'u');
    if (re.test(normalized)) return w;
  }
  return undefined;
}

function isAutoModImmune(message: Message): boolean {
  if (!message.guild || !message.member) return true;
  const data = loadGuild(message.guild.id);
  const userId = message.author.id;

  // Always exempt the Discord server owner.
  if (userId === message.guild.ownerId) return true;

  // Exempt configured extra owners and the existing AutoMod/anti-nuke whitelist.
  if ((data.extraOwners ?? []).includes(userId)) return true;
  if ((data.antiNuke?.whitelist ?? []).includes(userId)) return true;

  return false;
}

async function runAutoMod(message: Message): Promise<boolean> {
  if (!message.guild || !message.member || message.author.bot) return false;
  if (isAutoModImmune(message)) return false;

  const cfg = loadGuild(message.guild.id).config.automod;
  if (!cfg?.enabled) return false;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return false;

  let reason: string | undefined;
  const banned = matchesBannedWord(message.content, cfg.bannedWords ?? []);
  if (banned) reason = `banned word: ${banned}`;

  if (!reason && cfg.massMentions && message.mentions.users.size + message.mentions.roles.size >= 6) reason = 'mass mentions';

  if (!reason && cfg.suspiciousLinks && /https?:\/\/(?:discord\.gift|discordgift|free[-_ ]?nitro|nitro[-_ ]?gift|steamcommunitty|discorcl|discordapp\.gift)/i.test(message.content)) reason = 'suspicious link';

  const key = `${message.guild.id}:${message.author.id}`;
  if (!reason && cfg.antiSpam) {
    const now = Date.now();
    const history = (spamTracker.get(key) ?? []).filter(t => now - t < 8000);
    history.push(now);
    spamTracker.set(key, history);
    if (history.length >= 6) reason = 'spam';
  }

  if (!reason) return false;

  const action = cfg.action ?? 'delete_timeout';
  if (action === 'delete' || action === 'delete_timeout') await message.delete().catch(() => undefined);
  if (action === 'warn') {
    await message.reply(`⚠️ <@${message.author.id}> your message was flagged by AutoMod (**${reason}**).`).catch(() => undefined);
  }
  if (action === 'timeout' || action === 'delete_timeout') {
    await message.member.timeout(10 * 60 * 1000, `AutoMod: ${reason}`).catch(() => undefined);
  }
  return true;
}

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;
  if (await runAutoMod(message)) return;

  const restricted = loadGuild(message.guild.id);
  const { chatBanRole, jailRole } = restricted.config;
  const memberRoles = message.member.roles.cache;
  if ((chatBanRole && memberRoles.has(chatBanRole)) || (jailRole && memberRoles.has(jailRole))) {
    await message.delete().catch(() => undefined);
    return;
  }

  const bridged = await handleMissingPrefixCommand(message);
  if (!bridged) await handlePrefixCommand(message);

  const guildId = message.guild.id;
  const userId = message.author.id;
  const data = loadGuild(guildId);
  const prefix = getGuildPrefix(guildId);
  const trimmed = message.content.trim().toLowerCase();
  const isSettingAfk = trimmed === `${prefix}afk` || trimmed.startsWith(`${prefix}afk `);

  if (data.afk[userId] && !isSettingAfk) {
    const member = message.member as GuildMember;
    if (member.nickname?.startsWith('[AFK] ')) {
      const original = member.nickname.slice(6);
      await member.setNickname(original || null).catch(() => undefined);
    }
    updateGuild(guildId, d => { delete d.afk[userId]; });
    await message.reply({ content: '👋 Welcome back! I removed your AFK status.' }).catch(() => undefined);
  }

  for (const mentioned of message.mentions.users.values()) {
    if (mentioned.id === userId) continue;
    const freshData = loadGuild(guildId);
    const afkEntry = freshData.afk[mentioned.id];
    if (afkEntry) {
      const since = Math.floor(afkEntry.timestamp / 1000);
      await message.reply({ content: `💤 **${mentioned.username}** is AFK since <t:${since}:R>: ${afkEntry.reason}` }).catch(() => undefined);
    }
  }

  const freshData = loadGuild(guildId);
  if (freshData.autoResponders.length > 0) {
    for (const ar of freshData.autoResponders) {
      if (containsAutoresponderTrigger(message.content, ar.trigger)) {
        await message.reply({ content: ar.response }).catch(() => undefined);
        break;
      }
    }
  }

  const now = Date.now();
  const levelData = freshData.levels[userId] ?? { xp: 0, level: 0, lastMessage: 0 };
  if (now - levelData.lastMessage >= XP_COOLDOWN_MS) {
    const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    const oldLevel = levelData.level;
    levelData.xp += xpGain;
    levelData.level = levelFromXp(levelData.xp);
    levelData.lastMessage = now;
    updateGuild(guildId, d => { d.levels[userId] = levelData; });

    if (levelData.level > oldLevel) {
      const guildData = loadGuild(guildId);
      const announceCh = guildData.config.levelChannel ?? message.channelId;
      const levelRoleId = guildData.config.levelRoles?.[String(levelData.level)];
      let roleName: string | undefined;
      if (levelRoleId) {
        const guildMember = await message.guild.members.fetch(userId).catch(() => null);
        if (guildMember) {
          await guildMember.roles.add(levelRoleId).catch(() => undefined);
          const role = await message.guild.roles.fetch(levelRoleId).catch(() => null);
          roleName = role?.name;
        }
      }
      try {
        const ch = await message.guild.channels.fetch(announceCh);
        if (ch?.isTextBased()) {
          const cfg = guildData.config.levelUpMessage;
          const embed = buildLevelUpEmbed(`<@${userId}>`, levelData.level, levelData.xp, message.author.displayAvatarURL(), cfg?.title, cfg?.description, cfg?.imageUrl);
          if (roleName) embed.addFields({ name: '🎖️ Role Unlocked', value: roleName, inline: true });
          await (ch as BaseGuildTextChannel).send({ embeds: [embed], allowedMentions: { users: [userId], roles: [] } });
        }
      } catch { /* channel inaccessible */ }
    }
  }
}
