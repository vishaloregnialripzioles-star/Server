import type { Message, BaseGuildTextChannel, GuildMember } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { levelFromXp } from '../utils.js';
import { handlePrefixCommand, getGuildPrefix } from '../prefixHandler.js';
import { handleMissingPrefixCommand } from '../prefixBridge.js';
import { buildLevelUpEmbed } from '../commands/levelconfig.js';

const XP_COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

// Match a trigger as a complete word/phrase, not as a substring inside another word.
// Example: trigger "hi" matches "hi" and "hi how are you", but not "this".
function containsAutoresponderTrigger(content: string, trigger: string): boolean {
  const normalizedContent = content.toLocaleLowerCase();
  const normalizedTrigger = trigger.toLocaleLowerCase().trim();
  if (!normalizedTrigger) return false;

  const escapedTrigger = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedTrigger}($|[^\\p{L}\\p{N}_])`, 'u');
  return pattern.test(normalizedContent);
}

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;

  // ── Auto-delete: chatban & jail ─────────────────────────────────
  const restricted = loadGuild(message.guild.id);
  const { chatBanRole, jailRole } = restricted.config;
  const memberRoles = message.member.roles.cache;
  if (
    (chatBanRole && memberRoles.has(chatBanRole)) ||
    (jailRole    && memberRoles.has(jailRole))
  ) {
    await message.delete().catch(() => undefined);
    return;
  }

  // ── Prefix commands ─────────────────────────────────────────────
  // Existing prefix implementations stay untouched. The bridge only handles
  // commands that did not previously have a prefix implementation, plus the
  // new shop setup subcommands.
  const bridged = await handleMissingPrefixCommand(message);
  if (!bridged) await handlePrefixCommand(message);

  const guildId = message.guild.id;
  const userId = message.author.id;
  const data = loadGuild(guildId);

  // Detect if this message IS the AFK-set command, so we don't immediately remove it
  const prefix = getGuildPrefix(guildId);
  const trimmed = message.content.trim().toLowerCase();
  const isSettingAfk = trimmed === `${prefix}afk` || trimmed.startsWith(`${prefix}afk `);

  // Remove AFK when the user sends any message OTHER than the afk command itself
  if (data.afk[userId] && !isSettingAfk) {
    const member = message.member as GuildMember;
    if (member.nickname?.startsWith('[AFK] ')) {
      const original = member.nickname.slice(6);
      await member.setNickname(original || null).catch(() => undefined);
    }
    updateGuild(guildId, d => { delete d.afk[userId]; });
    await message.reply({ content: '👋 Welcome back! I removed your AFK status.' }).catch(() => undefined);
  }

  // Notify about mentioned AFK users
  for (const mentioned of message.mentions.users.values()) {
    if (mentioned.id === userId) continue;
    const freshData = loadGuild(guildId);
    const afkEntry = freshData.afk[mentioned.id];
    if (afkEntry) {
      const since = Math.floor(afkEntry.timestamp / 1000);
      await message.reply({
        content: `💤 **${mentioned.username}** is AFK since <t:${since}:R>: ${afkEntry.reason}`,
      }).catch(() => undefined);
    }
  }

  // ── Autoresponder ───────────────────────────────────────────────
  const freshData = loadGuild(guildId);
  if (freshData.autoResponders.length > 0) {
    for (const ar of freshData.autoResponders) {
      if (containsAutoresponderTrigger(message.content, ar.trigger)) {
        await message.reply({ content: ar.response }).catch(() => undefined);
        break;
      }
    }
  }

  // ── Leveling system ────────────────────────────────────────────
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
        const guildMember = await message.guild!.members.fetch(userId).catch(() => null);
        if (guildMember) {
          await guildMember.roles.add(levelRoleId).catch(() => undefined);
          const role = await message.guild!.roles.fetch(levelRoleId).catch(() => null);
          roleName = role?.name;
        }
      }

      try {
        const ch = await message.guild!.channels.fetch(announceCh);
        if (ch?.isTextBased()) {
          const cfg = guildData.config.levelUpMessage;
          const embed = buildLevelUpEmbed(
            `<@${userId}>`,
            levelData.level,
            levelData.xp,
            message.author.displayAvatarURL(),
            cfg?.title,
            cfg?.description,
            cfg?.imageUrl,
          );
          if (roleName) embed.addFields({ name: '🎖️ Role Unlocked', value: roleName, inline: true });
          await (ch as BaseGuildTextChannel).send({
            embeds: [embed],
            allowedMentions: { users: [userId], roles: [] },
          });
        }
      } catch {
        // channel inaccessible
      }
    }
  }
}
