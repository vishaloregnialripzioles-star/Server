import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
  type GuildMember,
  type Message,
  type TextChannel,
} from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { buildEmbedPreview, buildEmbedFromSaved, extractEmbedName, parseColor, resolveVariables, VARIABLES_HELP, buildWelcomeEmbed, buildWelcomeEmbedPreview, resolveWelcomeSend, DEFAULT_WELCOME_MESSAGE } from './welcomeUtils.js';
import {
  ensureChatBanRole,
  formatDuration,
  formatTimestamp,
  generateId,
  levelFromXp,
  parseDuration,
  sendLog,
  xpToNextLevel,
} from './utils.js';
import { ROASTS } from './roasts.js';
import { createTicketForUser } from './ticketUtils.js';
import { buildSnipeEmbed, buildSnipeButtons } from './snipeUtils.js';
import { buildLevelUpEmbed } from './commands/levelconfig.js';
import { buildGiveawayEmbed, buildGiveawayRow, buildGiveawayEndedEmbed, rerollWinner } from './giveawayUtils.js';
import type { Giveaway, ExtraEntryRole } from './types.js';
import { searchTrack, enqueue, skip, stop, pause, resume, getQueue, buildQueueEmbed, buildNowPlayingEmbed } from './musicPlayer.js';

export const DEFAULT_PREFIX = '.';

export function getGuildPrefix(guildId: string): string {
  const data = loadGuild(guildId);
  return data.config.prefix ?? DEFAULT_PREFIX;
}

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function perm(member: GuildMember, flag: bigint): boolean {
  return member.permissions.has(flag);
}

export async function handlePrefixCommand(message: Message): Promise<void> {
  if (!message.guild || message.author.bot || !message.content) return;

  const prefix = getGuildPrefix(message.guild.id);
  if (!message.content.startsWith(prefix)) return;

  const raw = message.content.slice(prefix.length).trim();
  const args = raw.split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  if (!cmd) return;

  const member = message.member!;
  const guild = message.guild;

  const reply = (content: string | object) =>
    message.reply(content).catch(() => undefined);

  // ── .ban ─────────────────────────────────────────────────────────────────────
  if (cmd === 'ban') {
    if (!perm(member, PermissionFlagsBits.BanMembers)) {
      await reply('❌ You need **Ban Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}ban @user [reason]\``); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (gm) {
      if (!gm.bannable) { await reply('❌ I cannot ban this user.'); return; }
      if (member.roles.highest.position <= gm.roles.highest.position) {
        await reply('❌ You cannot ban someone with an equal or higher role.');
        return;
      }
    }
    await guild.members.ban(target, { reason: `${reason} | Mod: ${message.author.tag}` });
    const embed = new EmbedBuilder().setColor(0xFF3333).setTitle('🔨 Member Banned')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .kick ────────────────────────────────────────────────────────────────────
  if (cmd === 'kick') {
    if (!perm(member, PermissionFlagsBits.KickMembers)) {
      await reply('❌ You need **Kick Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}kick @user [reason]\``); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ That user is not in this server.'); return; }
    if (!gm.kickable) { await reply('❌ I cannot kick this user.'); return; }
    await gm.kick(`${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0xFF8800).setTitle('👢 Member Kicked')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .mute ────────────────────────────────────────────────────────────────────
  // Usage: .mute @user <duration> [reason]   e.g. .mute @user 10m spamming
  if (cmd === 'mute') {
    if (!perm(member, PermissionFlagsBits.ModerateMembers)) {
      await reply('❌ You need **Moderate Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target || !args[1]) {
      await reply(`❌ Usage: \`${prefix}mute @user <duration> [reason]\` (e.g. \`${prefix}mute @user 10m spamming\`)`);
      return;
    }
    const durationStr = args[1];
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const durationMs = parseDuration(durationStr);
    if (!durationMs) { await reply('❌ Invalid duration. Examples: `10s`, `10m`, `1h`, `2d`'); return; }
    if (durationMs > 28 * 24 * 60 * 60 * 1000) { await reply('❌ Duration cannot exceed 28 days (Discord limit).'); return; }
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    if (!gm.moderatable) { await reply('❌ I cannot mute this user (they may have a higher role).'); return; }
    const auditReason = `${reason} | Mod: ${message.author.tag}`;
    await gm.timeout(durationMs, auditReason);
    const actions: string[] = [`⏱️ Discord timeout applied for **${formatDuration(durationMs)}**`];
    const muteData = loadGuild(guild.id);
    if (muteData.config.muteRole) {
      await gm.roles.add(muteData.config.muteRole, auditReason).catch(() => null);
      actions.push('🔇 Mute role assigned');
    }
    const embed = new EmbedBuilder().setColor(0xAAAAAA).setTitle('🔇 Member Muted')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Reason', value: reason },
        { name: 'Actions', value: actions.join('\n') },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .unmute ──────────────────────────────────────────────────────────────────
  if (cmd === 'unmute') {
    if (!perm(member, PermissionFlagsBits.ModerateMembers)) {
      await reply('❌ You need **Moderate Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}unmute @user [reason]\``); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    const auditReason = `${reason} | Mod: ${message.author.tag}`;
    const unmuteActions: string[] = [];
    // Remove Discord timeout if active
    if (gm.communicationDisabledUntil) {
      await gm.timeout(null, auditReason).catch(() => null);
      unmuteActions.push('⏱️ Discord timeout removed');
    }
    // Remove mute role if configured and member has it
    const unmuteData = loadGuild(guild.id);
    if (unmuteData.config.muteRole && gm.roles.cache.has(unmuteData.config.muteRole)) {
      await gm.roles.remove(unmuteData.config.muteRole, auditReason).catch(() => null);
      unmuteActions.push('🔇 Mute role removed');
    }
    if (unmuteActions.length === 0) {
      await reply('ℹ️ This member has no active timeout or mute role to remove.');
      return;
    }
    const embed = new EmbedBuilder().setColor(0x00CC44).setTitle('🔊 Member Unmuted')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Actions', value: unmuteActions.join('\n') },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .timeout ─────────────────────────────────────────────────────────────────
  if (cmd === 'timeout') {
    if (!perm(member, PermissionFlagsBits.ModerateMembers)) {
      await reply('❌ You need **Moderate Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target || !args[1]) {
      await reply(`❌ Usage: \`${prefix}timeout @user duration [reason]\` (e.g. \`${prefix}timeout @user 10m rule breaking\`)`);
      return;
    }
    const durationStr = args[1];
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const durationMs = parseDuration(durationStr);
    if (!durationMs) { await reply('❌ Invalid duration. Examples: `10m`, `1h`, `2d`, `1w`'); return; }
    if (durationMs > 28 * 24 * 60 * 60 * 1000) { await reply('❌ Timeout cannot exceed 28 days.'); return; }
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    if (!gm.moderatable) { await reply('❌ I cannot timeout this user.'); return; }
    await gm.timeout(durationMs, `${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0xFFAA00).setTitle('⏱️ Member Timed Out')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .warn ────────────────────────────────────────────────────────────────────
  if (cmd === 'warn') {
    if (!perm(member, PermissionFlagsBits.ModerateMembers)) {
      await reply('❌ You need **Moderate Members** permission to warn users.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}warn @user reason\``); return; }
    if (target.bot) { await reply('❌ You cannot warn a bot.'); return; }
    const reason = args.slice(1).join(' ').trim();
    if (!reason) { await reply(`❌ Provide a reason. Example: \`${prefix}warn @user spamming\``); return; }
    const warnId = generateId();
    let totalWarnings = 0;
    updateGuild(guild.id, data => {
      if (!data.warnings[target.id]) data.warnings[target.id] = [];
      data.warnings[target.id].push({ id: warnId, moderatorId: message.author.id, reason, timestamp: Date.now() });
      totalWarnings = data.warnings[target.id].length;
    });
    const embed = new EmbedBuilder().setColor(0xFFCC00).setTitle('⚠️ Member Warned')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Warning ID', value: `\`${warnId}\``, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Total Warnings', value: `${totalWarnings}`, inline: true },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    await target.send({ embeds: [new EmbedBuilder().setColor(0xFFCC00)
      .setTitle(`⚠️ You received a warning in ${guild.name}`)
      .addFields({ name: 'Reason', value: reason }, { name: 'Moderator', value: message.author.tag })
      .setTimestamp()] }).catch(() => undefined);
    return;
  }

  // ── .warnings ────────────────────────────────────────────────────────────────
  if (cmd === 'warnings') {
    if (!perm(member, PermissionFlagsBits.ModerateMembers)) {
      await reply('❌ You need **Moderate Members** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}warnings @user\``); return; }
    const data = loadGuild(guild.id);
    const userWarnings = data.warnings[target.id] ?? [];
    const embed = new EmbedBuilder().setColor(0xFFCC00).setTitle(`⚠️ Warnings — ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        userWarnings.length === 0 ? '✅ No warnings on record.'
          : userWarnings.slice(-10).map((w, i) =>
            `**#${i + 1}** \`${w.id}\`\n> Reason: ${w.reason}\n> Mod: <@${w.moderatorId}> • ${formatTimestamp(w.timestamp)}`
          ).join('\n\n'),
      ).setFooter({ text: `Total: ${userWarnings.length} warning(s)` }).setTimestamp();
    await reply({ embeds: [embed] });
    return;
  }

  // ── .clearwarns ──────────────────────────────────────────────────────────────
  if (cmd === 'clearwarns') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}clearwarns @user\``); return; }
    const data = loadGuild(guild.id);
    const count = (data.warnings[target.id] ?? []).length;
    updateGuild(guild.id, d => { d.warnings[target.id] = []; });
    const embed = new EmbedBuilder().setColor(0x00CC44).setTitle('🗑️ Warnings Cleared')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Warnings Removed', value: `${count}`, inline: true },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .chatban ─────────────────────────────────────────────────────────────────
  if (cmd === 'chatban') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}chatban @user [reason]\``); return; }
    if (target.bot) { await reply('❌ You cannot chat-ban a bot.'); return; }
    if (target.id === guild.ownerId) { await reply('❌ The server owner cannot be chat-banned.'); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ That user is not in this server.'); return; }
    const role = await ensureChatBanRole(guild);
    await gm.roles.add(role, `${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0xFF6600).setTitle('💬❌ Member Chat-Banned')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .unchatban ───────────────────────────────────────────────────────────────
  if (cmd === 'unchatban') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}unchatban @user [reason]\``); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ That user is not in this server.'); return; }
    const role = await ensureChatBanRole(guild);
    await gm.roles.remove(role, `${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0x00CC44).setTitle('💬✅ Chat Ban Removed')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .jail ────────────────────────────────────────────────────────────────────
  if (cmd === 'jail') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const data = loadGuild(guild.id);
    if (!data.config.jailRole) { await reply('❌ No jail role set. Use `/setup jailrole` first.'); return; }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}jail @user [reason]\``); return; }
    if (target.id === guild.ownerId) { await reply('❌ The server owner cannot be jailed.'); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    await gm.roles.add(data.config.jailRole, `${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0x888888).setTitle('🔒 Member Jailed')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setFooter({ text: `Use ${prefix}unjail to release them.` }).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .unjail ──────────────────────────────────────────────────────────────────
  if (cmd === 'unjail') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const data = loadGuild(guild.id);
    if (!data.config.jailRole) { await reply('❌ No jail role set.'); return; }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}unjail @user [reason]\``); return; }
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    await gm.roles.remove(data.config.jailRole, `${reason} | Mod: ${message.author.tag}`);
    const embed = new EmbedBuilder().setColor(0x00CC44).setTitle('🔓 Member Released from Jail')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp();
    await reply({ embeds: [embed] });
    await sendLog(guild, embed);
    return;
  }

  // ── .nick ────────────────────────────────────────────────────────────────────
  if (cmd === 'nick') {
    if (!perm(member, PermissionFlagsBits.ManageNicknames)) {
      await reply('❌ You need **Manage Nicknames** permission.');
      return;
    }
    const target = message.mentions.users.first();
    if (!target) { await reply(`❌ Usage: \`${prefix}nick @user [new nickname]\``); return; }
    const newNick = args.slice(1).join(' ').trim() || null;
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    if (!gm.manageable) { await reply('❌ I cannot change this user\'s nickname.'); return; }
    const oldNick = gm.nickname ?? gm.user.username;
    await gm.setNickname(newNick, `Changed by ${message.author.tag}`);
    await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('✏️ Nickname Updated')
      .addFields(
        { name: 'User', value: target.tag, inline: true },
        { name: 'Before', value: oldNick, inline: true },
        { name: 'After', value: newNick ?? target.username, inline: true },
      ).setTimestamp()] });
    return;
  }

  // ── .purge ───────────────────────────────────────────────────────────────────
  if (cmd === 'purge') {
    if (!perm(member, PermissionFlagsBits.ManageMessages)) {
      await reply('❌ You need **Manage Messages** permission.');
      return;
    }
    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      await reply(`❌ Usage: \`${prefix}purge <1-100> [@user]\``);
      return;
    }
    const filterUser = message.mentions.users.first();
    const channel = message.channel as TextChannel;
    const fetched = await channel.messages.fetch({ limit: 100 });
    let toDelete = [...fetched.values()].slice(0, amount + 50);
    if (filterUser) toDelete = toDelete.filter(m => m.author.id === filterUser.id);
    toDelete = toDelete.slice(0, amount);
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = toDelete.filter(m => m.createdTimestamp > twoWeeksAgo);
    const deleted = await channel.bulkDelete(deletable, true);
    await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2)
      .setDescription(`🗑️ Deleted **${deleted.size}** message(s)${filterUser ? ` from ${filterUser.tag}` : ''}.`)
      .setTimestamp()] });
    return;
  }

  // ── .purgebots ───────────────────────────────────────────────────────────────
  if (cmd === 'purgebots') {
    if (!perm(member, PermissionFlagsBits.ManageMessages)) {
      await reply('❌ You need **Manage Messages** permission.');
      return;
    }
    const scanAmount = parseInt(args[0], 10);
    const limit = (!isNaN(scanAmount) && scanAmount >= 1 && scanAmount <= 100) ? scanAmount : 50;
    const channel = message.channel as TextChannel;
    const fetched = await channel.messages.fetch({ limit });
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const botMsgs = [...fetched.values()].filter(m => m.author.bot && m.createdTimestamp > twoWeeksAgo);
    if (botMsgs.length === 0) { await reply('✅ No bot messages found.'); return; }
    const deleted = await channel.bulkDelete(botMsgs, true);
    await reply(`🤖 Deleted **${deleted.size}** bot message(s).`);
    return;
  }

  // ── .lock ────────────────────────────────────────────────────────────────────
  if (cmd === 'lock') {
    if (!perm(member, PermissionFlagsBits.ManageChannels)) {
      await reply('❌ You need **Manage Channels** permission.');
      return;
    }
    const reason = args.join(' ') || 'No reason provided';
    const channel = message.channel as TextChannel;
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: false },
      { reason: `Locked by ${message.author.tag}: ${reason}`, type: OverwriteType.Role },
    );
    await reply({ embeds: [new EmbedBuilder().setColor(0xFF3333).setTitle('🔒 Channel Locked')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp()] });
    return;
  }

  // ── .unlock ──────────────────────────────────────────────────────────────────
  if (cmd === 'unlock') {
    if (!perm(member, PermissionFlagsBits.ManageChannels)) {
      await reply('❌ You need **Manage Channels** permission.');
      return;
    }
    const reason = args.join(' ') || 'No reason provided';
    const channel = message.channel as TextChannel;
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: null },
      { reason: `Unlocked by ${message.author.tag}: ${reason}`, type: OverwriteType.Role },
    );
    await reply({ embeds: [new EmbedBuilder().setColor(0x00CC44).setTitle('🔓 Channel Unlocked')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      ).setTimestamp()] });
    return;
  }

  // ── .slowmode ────────────────────────────────────────────────────────────────
  if (cmd === 'slowmode') {
    if (!perm(member, PermissionFlagsBits.ManageChannels)) {
      await reply('❌ You need **Manage Channels** permission.');
      return;
    }
    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      await reply(`❌ Usage: \`${prefix}slowmode <0-21600>\` (0 to disable)`);
      return;
    }
    const channel = message.channel as TextChannel;
    await channel.setRateLimitPerUser(seconds, `Set by ${message.author.tag}`);
    await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🐢 Slowmode Updated')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Delay', value: seconds === 0 ? 'Disabled' : `${seconds}s`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true },
      ).setTimestamp()] });
    return;
  }

  // ── .afk ─────────────────────────────────────────────────────────────────────
  if (cmd === 'afk') {
    const reason = args.join(' ') || 'AFK';
    updateGuild(guild.id, data => {
      data.afk[message.author.id] = { reason, timestamp: Date.now() };
    });
    if (member.manageable) {
      const currentName = member.nickname ?? member.user.username;
      if (!currentName.startsWith('[AFK] ')) {
        await member.setNickname(`[AFK] ${currentName}`.slice(0, 32)).catch(() => undefined);
      }
    }
    await reply({ embeds: [new EmbedBuilder().setColor(0xAAAAAA).setTitle('💤 AFK Status Set')
      .setDescription(`You are now AFK: **${reason}**\nI'll let people know when they mention you.`)
      .setTimestamp()] });
    return;
  }

  // ── .remindme ────────────────────────────────────────────────────────────────
  if (cmd === 'remindme') {
    if (!args[0] || !args[1]) {
      await reply(`❌ Usage: \`${prefix}remindme <duration> <message>\` (e.g. \`${prefix}remindme 1h take a break\`)`);
      return;
    }
    const durationStr = args[0];
    const reminderMsg = args.slice(1).join(' ');
    const durationMs = parseDuration(durationStr);
    if (!durationMs) { await reply('❌ Invalid duration. Examples: `10m`, `1h`, `2d`'); return; }
    if (durationMs > 30 * 24 * 60 * 60 * 1000) { await reply('❌ Maximum reminder time is 30 days.'); return; }
    const due = Date.now() + durationMs;
    const reminderId = generateId();
    updateGuild(guild.id, data => {
      data.reminders.push({
        id: reminderId,
        userId: message.author.id,
        channelId: message.channelId,
        guildId: guild.id,
        message: reminderMsg,
        due,
      });
    });
    await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⏰ Reminder Set')
      .addFields(
        { name: 'Message', value: reminderMsg },
        { name: 'Remind In', value: formatDuration(durationMs), inline: true },
        { name: 'At', value: `<t:${Math.floor(due / 1000)}:F>`, inline: true },
      ).setTimestamp()] });
    return;
  }

  // ── .poll ────────────────────────────────────────────────────────────────────
  // Usage: .poll Question | Option 1 | Option 2 [| Option 3 ...]
  if (cmd === 'poll') {
    const fullText = args.join(' ');
    const parts = fullText.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) {
      await reply(`❌ Usage: \`${prefix}poll Question | Option 1 | Option 2 [| Option 3 ...]\``);
      return;
    }
    const [question, ...options] = parts;
    if (options.length > 10) { await reply('❌ Maximum 10 options.'); return; }
    const description = options.map((opt, i) => `${EMOJI_NUMBERS[i]} ${opt}`).join('\n');
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${question}`)
      .setDescription(description)
      .setFooter({ text: `Poll by ${message.author.tag}` }).setTimestamp();
    const sent = await message.channel.send({ embeds: [embed] });
    for (let i = 0; i < options.length; i++) {
      await sent.react(EMOJI_NUMBERS[i]).catch(() => undefined);
    }
    return;
  }

  // ── .snipe ───────────────────────────────────────────────────────────────────
  if (cmd === 'snipe') {
    if (!perm(member, PermissionFlagsBits.ManageMessages)) {
      await reply('❌ You need **Manage Messages** permission to use snipe.');
      return;
    }
    const data = loadGuild(guild.id);
    if (!data.config.snipeEnabled) { await reply('❌ The snipe feature is disabled in this server.'); return; }
    const messages = data.lastDeleted[message.channelId];
    if (!messages || messages.length === 0) { await reply('❌ No deleted messages to snipe in this channel.'); return; }
    const index = 0;
    const embed = buildSnipeEmbed(messages, index, 'delete');
    const row = buildSnipeButtons(message.channelId, index, messages.length, 'snipe');
    await reply({ embeds: [embed], components: messages.length > 1 ? [row] : [] });
    return;
  }

  // ── .editsnipe ───────────────────────────────────────────────────────────────
  if (cmd === 'editsnipe') {
    if (!perm(member, PermissionFlagsBits.ManageMessages)) {
      await reply('❌ You need **Manage Messages** permission to use editsnipe.');
      return;
    }
    const data = loadGuild(guild.id);
    if (!data.config.snipeEnabled) { await reply('❌ The snipe feature is disabled in this server.'); return; }
    const messages = data.lastEdited[message.channelId];
    if (!messages || messages.length === 0) { await reply('❌ No edited messages to snipe in this channel.'); return; }
    const index = 0;
    const embed = buildSnipeEmbed(messages, index, 'edit');
    const row = buildSnipeButtons(message.channelId, index, messages.length, 'editsnipe');
    await reply({ embeds: [embed], components: messages.length > 1 ? [row] : [] });
    return;
  }

  // ── .gay ─────────────────────────────────────────────────────────────────────
  if (cmd === 'gay') {
    const target = message.mentions.users.first() ?? message.author;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🌈'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await reply({ embeds: [new EmbedBuilder().setColor(0xFF69B4).setTitle('🌈 Gay Meter')
      .setThumbnail(target.displayAvatarURL())
      .setDescription(`**${target.username}** is **${pct}% gay**\n\n${bar}`)
      .setTimestamp()] });
    return;
  }

  // ── .pro ─────────────────────────────────────────────────────────────────────
  if (cmd === 'pro') {
    const target = message.mentions.users.first() ?? message.author;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🟩'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await reply({ embeds: [new EmbedBuilder().setColor(0x00CC44).setTitle('🎮 Pro Meter')
      .setThumbnail(target.displayAvatarURL())
      .setDescription(`**${target.username}** is **${pct}% pro**\n\n${bar}`)
      .setTimestamp()] });
    return;
  }

  // ── .noob ────────────────────────────────────────────────────────────────────
  if (cmd === 'noob') {
    const target = message.mentions.users.first() ?? message.author;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🟥'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await reply({ embeds: [new EmbedBuilder().setColor(0xFF3333).setTitle('💀 Noob Meter')
      .setThumbnail(target.displayAvatarURL())
      .setDescription(`**${target.username}** is **${pct}% noob**\n\n${bar}`)
      .setTimestamp()] });
    return;
  }

  // ── .ship ────────────────────────────────────────────────────────────────────
  if (cmd === 'ship') {
    const [user1, user2raw] = message.mentions.users.values();
    const u1 = user1 ?? message.author;
    const u2 = user2raw ?? message.author;
    const pct = Math.floor(Math.random() * 101);
    const hearts = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
    const label = pct >= 90 ? 'Perfect match! 💍' : pct >= 70 ? 'Great chemistry! 💕' : pct >= 50 ? 'Pretty good! 🥰' : pct >= 30 ? 'Needs work... 😬' : 'Not meant to be 💔';
    await reply({ embeds: [new EmbedBuilder().setColor(0xFF69B4).setTitle('💕 Ship Meter')
      .setDescription(`**${u1.username}** ❤️ **${u2.username}**\n\nCompatibility: **${pct}%**\n${hearts}\n\n*${label}*`)
      .setTimestamp()] });
    return;
  }

  // ── .autoresponder ───────────────────────────────────────────────────────────
  if (cmd === 'autoresponder' || cmd === 'ar') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.'); return;
    }
    const sub = args[0]?.toLowerCase();
    if (sub === 'list') {
      const data = loadGuild(guild.id);
      if (data.autoResponders.length === 0) { await reply('📋 No autoresponders set up yet.'); return; }
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🤖 Autoresponders')
        .setDescription(data.autoResponders.map((ar, i) => `**${i + 1}.** Trigger: \`${ar.trigger}\`\n> ${ar.response}`).join('\n\n'))
        .setFooter({ text: `${data.autoResponders.length} autoresponder(s)` });
      await reply({ embeds: [embed] });
      return;
    }
    if (sub === 'add') {
      // Usage: .autoresponder add trigger | response
      const rest = args.slice(1).join(' ');
      const sep = rest.indexOf('|');
      if (sep === -1) { await reply(`❌ Usage: \`${prefix}autoresponder add trigger | response\``); return; }
      const trigger = rest.slice(0, sep).trim().toLowerCase();
      const response = rest.slice(sep + 1).trim();
      if (!trigger || !response) { await reply(`❌ Both trigger and response are required.`); return; }
      let updated = false;
      updateGuild(guild.id, data => {
        const existing = data.autoResponders.find(ar => ar.trigger === trigger);
        if (existing) { existing.response = response; updated = true; }
        else data.autoResponders.push({ trigger, response });
      });
      await reply({ embeds: [new EmbedBuilder().setColor(0x00CC44).setTitle(updated ? '✏️ Autoresponder Updated' : '✅ Autoresponder Added')
        .addFields({ name: 'Trigger', value: `\`${trigger}\``, inline: true }, { name: 'Response', value: response })
        .setTimestamp()] });
      return;
    }
    if (sub === 'remove') {
      const trigger = args.slice(1).join(' ').trim().toLowerCase();
      if (!trigger) { await reply(`❌ Usage: \`${prefix}autoresponder remove trigger\``); return; }
      let found = false;
      updateGuild(guild.id, data => {
        const before = data.autoResponders.length;
        data.autoResponders = data.autoResponders.filter(ar => ar.trigger !== trigger);
        found = data.autoResponders.length < before;
      });
      await reply(found ? `✅ Autoresponder for \`${trigger}\` removed.` : `❌ No autoresponder found with trigger \`${trigger}\`.`);
      return;
    }
    await reply(`❌ Usage: \`${prefix}autoresponder add trigger | response\` · \`${prefix}autoresponder remove trigger\` · \`${prefix}autoresponder list\``);
    return;
  }

  // ── .av ──────────────────────────────────────────────────────────────────────
  if (cmd === 'av' || cmd === 'avatar') {
    const target = message.mentions.users.first() ?? message.author;
    const gm = await guild.members.fetch(target.id).catch(() => null);

    // Global avatar URL (full size)
    const globalUrl = target.displayAvatarURL({ size: 4096, extension: 'png' });
    // Server-specific avatar if different
    const serverUrl = gm?.avatarURL({ size: 4096, extension: 'png' }) ?? null;

    const embed = new EmbedBuilder()
      .setColor(gm?.displayHexColor ?? 0x5865F2)
      .setTitle(`🖼️ ${target.displayName}'s Avatar`)
      .setImage(serverUrl ?? globalUrl)
      .setDescription(
        serverUrl && serverUrl !== globalUrl
          ? `[Global avatar](${globalUrl}) • [Server avatar](${serverUrl})`
          : `[Open full size](${globalUrl})`,
      )
      .setFooter({ text: `User ID: ${target.id}` });

    await reply({ embeds: [embed] });
    return;
  }

  // ── .userinfo ────────────────────────────────────────────────────────────────
  if (cmd === 'userinfo') {
    const target = message.mentions.users.first() ?? message.author;
    const gm = await guild.members.fetch(target.id).catch(() => null);
    const data = loadGuild(guild.id);
    const levelEntry = data.levels[target.id];
    const xp = levelEntry?.xp ?? 0;
    const level = levelEntry?.level ?? 0;
    const warnCount = (data.warnings[target.id] ?? []).length;
    const roles = gm
      ? [...gm.roles.cache.values()].filter(r => r.id !== guild.id)
          .sort((a, b) => b.position - a.position).slice(0, 10)
          .map(r => `<@&${r.id}>`).join(' ') || 'None'
      : 'N/A';
    const embed = new EmbedBuilder().setColor(gm?.displayHexColor ?? 0x5865F2)
      .setTitle(`👤 ${target.tag}`).setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 User ID', value: target.id, inline: true },
        { name: '🤖 Bot', value: target.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true },
        ...(gm ? [
          { name: '📥 Joined Server', value: `<t:${Math.floor((gm.joinedTimestamp ?? 0) / 1000)}:D>`, inline: true },
          { name: '🎨 Display Name', value: gm.displayName, inline: true },
          { name: '📈 Level', value: `${level} (${xp.toLocaleString()} XP)`, inline: true },
          { name: '⚠️ Warnings', value: `${warnCount}`, inline: true },
          { name: `🎭 Roles [${gm.roles.cache.size - 1}]`, value: roles },
        ] : []),
      ).setTimestamp();
    await reply({ embeds: [embed] });
    return;
  }

  // ── .serverinfo ──────────────────────────────────────────────────────────────
  if (cmd === 'serverinfo') {
    const g = await guild.fetch();
    const owner = await g.fetchOwner().catch(() => null);
    const textChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
    const botCount = g.members.cache.filter(m => m.user.bot).size;
    const humanCount = g.members.cache.filter(m => !m.user.bot).size;
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏠 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: '🆔 Server ID', value: g.id, inline: true },
        { name: '👑 Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `${g.memberCount} total (${humanCount} humans, ${botCount} bots)` },
        { name: '📢 Channels', value: `${g.channels.cache.size} total • ${textChannels} text • ${voiceChannels} voice • ${categories} categories` },
        { name: '🎭 Roles', value: `${g.roles.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${g.emojis.cache.size}`, inline: true },
        { name: '🚀 Boost Level', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount ?? 0} boosts)`, inline: true },
      ).setTimestamp();
    if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 1024 }) ?? null);
    await reply({ embeds: [embed] });
    return;
  }

  // ── .rank ────────────────────────────────────────────────────────────────────
  if (cmd === 'rank') {
    const target = message.mentions.users.first() ?? message.author;
    const data = loadGuild(guild.id);
    const levelEntry = data.levels[target.id] ?? { xp: 0, level: 0, lastMessage: 0 };
    const { xp, level } = levelEntry;
    const nextLevelXp = xpToNextLevel(level);
    const sorted = Object.entries(data.levels).sort(([, a], [, b]) => b.xp - a.xp);
    const rankPos = sorted.findIndex(([id]) => id === target.id) + 1;
    const rankStr = rankPos > 0 ? `#${rankPos} of ${sorted.length}` : 'Unranked';
    const progress = Math.min(xp / nextLevelXp, 1);
    const filled = Math.round(progress * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    await reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(`📈 ${target.username}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '🏅 Level', value: `${level}`, inline: true },
        { name: '✨ Total XP', value: xp.toLocaleString(), inline: true },
        { name: '🏆 Server Rank', value: rankStr, inline: true },
        { name: `Progress to Level ${level + 1}`, value: `\`${bar}\` ${xp.toLocaleString()} / ${Math.round(nextLevelXp).toLocaleString()} XP` },
      ).setTimestamp()] });
    return;
  }

  // ── .roast ───────────────────────────────────────────────────────────────────
  if (cmd === 'roast') {
    const target = message.mentions.users.first() ?? message.author;
    const roastLine = ROASTS[Math.floor(Math.random() * ROASTS.length)];
    await reply({ embeds: [new EmbedBuilder().setColor(0xFF4500).setTitle('🔥 Roasted!')
      .setDescription(`<@${target.id}>, ${roastLine}`)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `Requested by ${message.author.username}` }).setTimestamp()] });
    return;
  }

  // ── .ticket ──────────────────────────────────────────────────────────────────
  if (cmd === 'ticket') {
    const reason = args.join(' ');
    if (!reason) { await reply(`❌ Usage: \`${prefix}ticket <reason>\``); return; }
    const result = await createTicketForUser(guild, message.author, message.client, reason);
    if (result.success) {
      await reply(`✅ Your ticket has been created: <#${result.channel.id}>`);
    } else {
      await reply(`❌ ${result.message}`);
    }
    return;
  }

  // ── .closeticket ─────────────────────────────────────────────────────────────
  if (cmd === 'closeticket') {
    const data = loadGuild(guild.id);
    const ticket = Object.values(data.tickets).find(t => t.channelId === message.channelId && !t.closed);
    if (!ticket) { await reply('❌ This channel is not an open ticket.'); return; }
    const isStaff = perm(member, PermissionFlagsBits.ManageGuild);
    const isOwner = ticket.creatorId === message.author.id;
    if (!isStaff && !isOwner) { await reply('❌ Only staff or the ticket creator can close this ticket.'); return; }
    const reason = args.join(' ') || 'Resolved';
    const closeEmbed = new EmbedBuilder().setColor(0xFF3333).setTitle('🔒 Ticket Closed')
      .addFields(
        { name: 'Closed By', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason, inline: true },
      ).setTimestamp();
    await reply({ embeds: [closeEmbed] });
    updateGuild(guild.id, d => {
      const t = Object.values(d.tickets).find(t => t.channelId === message.channelId);
      if (t) t.closed = true;
    });
    setTimeout(async () => {
      await (message.channel as TextChannel).delete(`Ticket closed by ${message.author.tag}: ${reason}`)
        .catch(() => undefined);
    }, 5000);
    return;
  }

  // ── .temprole ────────────────────────────────────────────────────────────────
  // Usage: .temprole @user @role duration [reason]
  if (cmd === 'temprole') {
    if (!perm(member, PermissionFlagsBits.ManageRoles)) {
      await reply('❌ You need **Manage Roles** permission.');
      return;
    }
    const target = message.mentions.users.first();
    const role = message.mentions.roles.first();
    if (!target || !role || !args[2]) {
      await reply(`❌ Usage: \`${prefix}temprole @user @role duration [reason]\` (e.g. \`${prefix}temprole @user @VIP 1d event winner\`)`);
      return;
    }
    const durationStr = args[2];
    const reason = args.slice(3).join(' ') || 'Temporary role';
    const durationMs = parseDuration(durationStr);
    if (!durationMs) { await reply('❌ Invalid duration. Examples: `1h`, `1d`, `1w`'); return; }
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ User not found in this server.'); return; }
    await gm.roles.add(role.id, `${reason} | Temp role by ${message.author.tag}`);
    const expiresAt = Date.now() + durationMs;
    updateGuild(guild.id, data => {
      data.tempRoles.push({ id: generateId(), guildId: guild.id, userId: target.id, roleId: role.id, expiresAt });
    });
    await reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle('⏳ Temporary Role Assigned')
      .addFields(
        { name: 'User', value: target.tag, inline: true },
        { name: 'Role', value: `<@&${role.id}>`, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true },
      ).setTimestamp()] });
    return;
  }

  // ── .ticketpanel ─────────────────────────────────────────────────────────────
  // Usage: .ticketpanel #channel [title]
  if (cmd === 'ticketpanel') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const channel = message.mentions.channels.first() as TextChannel | undefined;
    if (!channel) { await reply(`❌ Usage: \`${prefix}ticketpanel #channel [title]\``); return; }
    const title = args.slice(1).join(' ').trim() || '🎫 Support Tickets';
    const description = 'Need help or have a question?\nClick the button below to open a private ticket — our staff will be with you shortly.';
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description)
      .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined }).setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    );
    await channel.send({ embeds: [embed], components: [row] });
    await reply(`✅ Ticket panel sent to <#${channel.id}>.`);
    return;
  }

  // ── .setup ───────────────────────────────────────────────────────────────────
  // Usage: .setup <subcommand> [value]
  // Subcommands: logs, muterole, jailrole, chatbanrole, ticketcategory, starboard,
  //              levelchannel, ticketrole, snipe, view
  if (cmd === 'setup') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === 'view') {
      const data = loadGuild(guild.id);
      const cfg = data.config;
      const levelRolesText = cfg.levelRoles && Object.keys(cfg.levelRoles).length > 0
        ? Object.entries(cfg.levelRoles).sort(([a],[b]) => Number(a)-Number(b))
            .map(([lvl, roleId]) => `Level ${lvl} → <@&${roleId}>`).join('\n')
        : 'None set';
      await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Server Configuration')
        .addFields(
          { name: '📋 Log Channel', value: cfg.logChannel ? `<#${cfg.logChannel}>` : 'Not set', inline: true },
          { name: '🔇 Mute Role', value: cfg.muteRole ? `<@&${cfg.muteRole}>` : 'Not set', inline: true },
          { name: '🔒 Jail Role', value: cfg.jailRole ? `<@&${cfg.jailRole}>` : 'Not set', inline: true },
          { name: '💬 Chat Ban Role', value: cfg.chatBanRole ? `<@&${cfg.chatBanRole}>` : 'Not set', inline: true },
          { name: '🎫 Ticket Category', value: cfg.ticketCategory ? `<#${cfg.ticketCategory}>` : 'Not set', inline: true },
          { name: '🎫 Ticket Support Role', value: cfg.ticketSupportRole ? `<@&${cfg.ticketSupportRole}>` : 'Not set', inline: true },
          { name: '⭐ Starboard Channel', value: cfg.starboardChannel ? `<#${cfg.starboardChannel}>` : 'Not set', inline: true },
          { name: '⭐ Starboard Threshold', value: `${cfg.starboardThreshold} stars`, inline: true },
          { name: '📈 Level Channel', value: cfg.levelChannel ? `<#${cfg.levelChannel}>` : 'Current channel', inline: true },
          { name: '🔍 Snipe', value: cfg.snipeEnabled ? 'Enabled' : 'Disabled', inline: true },
          { name: '🏅 Level Roles', value: levelRolesText },
        ).setTimestamp()] });
      return;
    }

    if (sub === 'logs' || sub === 'starboard' || sub === 'levelchannel') {
      const ch = message.mentions.channels.first();
      if (!ch) { await reply(`❌ Usage: \`${prefix}setup ${sub} #channel\``); return; }
      updateGuild(guild.id, data => {
        if (sub === 'logs') data.config.logChannel = ch.id;
        else if (sub === 'starboard') data.config.starboardChannel = ch.id;
        else data.config.levelChannel = ch.id;
        if (sub === 'starboard' && args[2]) {
          const threshold = parseInt(args[2], 10);
          if (!isNaN(threshold) && threshold >= 1) data.config.starboardThreshold = threshold;
        }
      });
      await reply(`✅ Configuration updated for **${sub}**.`);
      return;
    }

    if (sub === 'muterole' || sub === 'jailrole' || sub === 'chatbanrole' || sub === 'ticketrole') {
      const role = message.mentions.roles.first();
      if (!role) { await reply(`❌ Usage: \`${prefix}setup ${sub} @role\``); return; }
      updateGuild(guild.id, data => {
        if (sub === 'muterole') data.config.muteRole = role.id;
        else if (sub === 'jailrole') data.config.jailRole = role.id;
        else if (sub === 'chatbanrole') data.config.chatBanRole = role.id;
        else data.config.ticketSupportRole = role.id;
      });
      await reply(`✅ Configuration updated for **${sub}**.`);
      return;
    }

    if (sub === 'levelrole') {
      // Usage: .setup levelrole <level> @role
      const level = parseInt(args[1], 10);
      const role = message.mentions.roles.first();
      if (isNaN(level) || level < 1 || !role) {
        await reply(`❌ Usage: \`${prefix}setup levelrole <level> @role\`\nExample: \`${prefix}setup levelrole 5 @Member\``);
        return;
      }
      updateGuild(guild.id, data => {
        if (!data.config.levelRoles) data.config.levelRoles = {};
        data.config.levelRoles[String(level)] = role.id;
      });
      await reply({ embeds: [new EmbedBuilder().setColor(0x00CC44).setTitle('🏅 Level Role Set')
        .addFields(
          { name: 'Level Required', value: `${level}`, inline: true },
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
        ).setDescription(`Members who reach **Level ${level}** will receive <@&${role.id}>.`)
        .setTimestamp()] });
      return;
    }

    if (sub === 'ticketcategory') {
      const catId = args[1];
      if (!catId) { await reply(`❌ Usage: \`${prefix}setup ticketcategory <category_id>\``); return; }
      updateGuild(guild.id, data => { data.config.ticketCategory = catId; });
      await reply(`✅ Ticket category set to \`${catId}\`.`);
      return;
    }

    if (sub === 'snipe') {
      const val = args[1]?.toLowerCase();
      if (val !== 'on' && val !== 'off') {
        await reply(`❌ Usage: \`${prefix}setup snipe on|off\``);
        return;
      }
      updateGuild(guild.id, data => { data.config.snipeEnabled = val === 'on'; });
      await reply(`✅ Snipe system **${val === 'on' ? 'enabled' : 'disabled'}**.`);
      return;
    }

    await reply(`❌ Unknown subcommand. Available: \`logs\`, \`muterole\`, \`jailrole\`, \`chatbanrole\`, \`ticketcategory\`, \`starboard\`, \`levelchannel\`, \`ticketrole\`, \`snipe\`, \`view\``);
    return;
  }

  // ── .help ────────────────────────────────────────────────────────────────────
  if (cmd === 'help') {
    const CATEGORIES = [
      { name: 'Setup', emoji: '⚙️', commands: [
        '/setup logs/muterole/jailrole/chatbanrole/ticketcategory/starboard/levelchannel/snipe/view',
        `${prefix}levelconfig title|description|image|reset|preview`,
      ]},
      { name: 'Moderation', emoji: '🔨', commands: [
        `${prefix}ban @user [reason]`,
        `${prefix}kick @user [reason]`,
        `${prefix}mute @user <duration> [reason]  — e.g. ${prefix}mute @user 10m spamming`,
        `${prefix}unmute @user [reason]`,
        `${prefix}timeout @user <duration> [reason]`,
        `${prefix}warn @user <reason>`,
        `${prefix}warnings @user`,
        `${prefix}clearwarns @user`,
        `${prefix}nick @user [nickname]`,
        `${prefix}temprole @user @role <duration> [reason]`,
        `${prefix}createrole <name> [#hex] [high] [@member]`,
        `${prefix}roleassign @member @role [add|remove]`,
      ]},
      { name: 'Channels', emoji: '📢', commands: [
        `${prefix}purge <1-100> [@user]`,
        `${prefix}purgebots [limit]`,
        `${prefix}lock [reason]`,
        `${prefix}unlock [reason]`,
        `${prefix}slowmode <0-21600>`,
      ]},
      { name: 'Restrictions', emoji: '🚫', commands: [
        `${prefix}chatban @user [reason]`,
        `${prefix}unchatban @user [reason]`,
        `${prefix}jail @user [reason]`,
        `${prefix}unjail @user [reason]`,
      ]},
      { name: 'Utility', emoji: '🛠️', commands: [
        `${prefix}av [@user]  — show a user's avatar`,
        `${prefix}afk [reason]`,
        `${prefix}remindme <duration> <message>`,
        `${prefix}poll Question | Option 1 | Option 2 [| ...]`,
        `${prefix}snipe`,
        `${prefix}editsnipe`,
        `${prefix}userinfo [@user]`,
        `${prefix}serverinfo`,
        `${prefix}autoresponder add trigger | response`,
        `${prefix}autoresponder remove <trigger>`,
        `${prefix}autoresponder list`,
        `${prefix}setprefix <prefix>`,
      ]},
      { name: 'Leveling', emoji: '📈', commands: [
        `${prefix}rank [@user]`,
        `${prefix}leaderboard [top]`,
      ]},
      { name: 'Tickets', emoji: '🎫', commands: [
        `${prefix}ticket <reason>`,
        `${prefix}closeticket [reason]`,
        `${prefix}ticketpanel #channel [title]`,
      ]},
      { name: 'Fun', emoji: '🎉', commands: [
        `${prefix}roast [@user]`,
        `${prefix}gay [@user]`,
        `${prefix}pro [@user]`,
        `${prefix}noob [@user]`,
        `${prefix}ship [@user1] [@user2]`,
      ]},
      { name: 'Giveaways', emoji: '🎁', commands: [
        `${prefix}giveawaycreate <duration> #channel | <name> | <prize>`,
        `${prefix}gend <id>  — force-end a giveaway now (admin)`,
        `${prefix}random <id>  — reroll winner (admin)`,
        `${prefix}gleave <id>  — leave a giveaway`,
        `${prefix}gparticipants <id>  — view participants`,
        `${prefix}gremove <id> @user  — remove a participant (admin)`,
        `/giveaway create  — full options via slash command`,
      ]},
      { name: 'Music', emoji: '🎵', commands: [
        `${prefix}music play <song name or URL>`,
        `${prefix}music skip`,
        `${prefix}music stop`,
        `${prefix}music pause`,
        `${prefix}music resume`,
        `${prefix}music queue`,
        `${prefix}music nowplaying`,
      ]},
    ];

    const filterArg = args[0]?.toLowerCase();
    const selected = filterArg
      ? CATEGORIES.filter(c => c.name.toLowerCase().startsWith(filterArg))
      : CATEGORIES;

    if (selected.length === 0) {
      await reply(`❌ Unknown category. Options: ${CATEGORIES.map(c => c.name.toLowerCase()).join(', ')}`);
      return;
    }

    const embeds = selected.map(cat =>
      new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(`${cat.emoji} ${cat.name}`)
        .setDescription(cat.commands.map(c => `\`${c}\``).join('\n')),
    );

    if (!filterArg) {
      const overview =
        `## 📖 Bot Commands\n` +
        `Most commands work with both \`${prefix}\` prefix and \`/\` slash commands.\n` +
        `Use \`${prefix}help <category>\` to filter to one section.\n\n` +
        CATEGORIES.map(c => `${c.emoji} **${c.name}** — ${c.commands.length} command(s)`).join('\n');
      await reply({ content: overview, embeds });
    } else {
      await reply({ embeds });
    }
    return;
  }

  // ── .leaderboard ─────────────────────────────────────────────────────────────
  if (cmd === 'leaderboard' || cmd === 'lb') {
    const limit = Math.min(parseInt(args[0], 10) || 10, 25);
    const data = loadGuild(guild.id);
    const entries = Object.entries(data.levels)
      .map(([userId, entry]) => ({ userId, xp: entry.xp, level: levelFromXp(entry.xp) }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);

    if (entries.length === 0) {
      await reply('📭 No leveling data yet — members earn XP by chatting!');
      return;
    }

    const memberMap = await guild.members.fetch({ user: entries.map(e => e.userId) }).catch(() => null);
    const MEDALS = ['🥇', '🥈', '🥉'];
    const rows = entries.map((e, i) => {
      const medal = MEDALS[i] ?? `**#${i + 1}**`;
      const name = memberMap?.get(e.userId)?.displayName ?? `<@${e.userId}>`;
      return `${medal} ${name} — Level **${e.level}** · ${e.xp.toLocaleString()} XP`;
    });

    const allSorted = Object.entries(data.levels).sort(([, a], [, b]) => b.xp - a.xp);
    const myRank = allSorted.findIndex(([id]) => id === message.author.id) + 1;
    const myEntry = data.levels[message.author.id];
    const footer = myRank > 0 && myEntry
      ? `Your rank: #${myRank} of ${allSorted.length} — Level ${levelFromXp(myEntry.xp)} · ${myEntry.xp.toLocaleString()} XP`
      : undefined;

    const embed = new EmbedBuilder().setColor(0xF1C40F)
      .setTitle(`🏆 ${guild.name} — Leaderboard`)
      .setDescription(rows.join('\n'))
      .setTimestamp();
    if (footer) embed.setFooter({ text: footer });

    await reply({ embeds: [embed] });
    return;
  }

  // ── .levelconfig ─────────────────────────────────────────────────────────────
  // Usage: .levelconfig title <text>
  //        .levelconfig description <text>
  //        .levelconfig image <url>
  //        .levelconfig reset
  //        .levelconfig preview
  if (cmd === 'levelconfig') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission.');
      return;
    }
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === 'help') {
      await reply(
        `**Level Config commands:**\n` +
        `\`${prefix}levelconfig title <text>\` — set title (use {user}, {level})\n` +
        `\`${prefix}levelconfig description <text>\` — set description (use {user}, {level}, {xp})\n` +
        `\`${prefix}levelconfig image <url>\` — set image or GIF URL\n` +
        `\`${prefix}levelconfig reset\` — reset to default\n` +
        `\`${prefix}levelconfig preview\` — preview current settings`,
      );
      return;
    }

    if (sub === 'reset') {
      updateGuild(guild.id, d => { delete d.config.levelUpMessage; });
      await reply('✅ Level-up message reset to default.');
      return;
    }

    if (sub === 'preview') {
      const previewData = loadGuild(guild.id);
      const cfg = previewData.config.levelUpMessage;
      const embed = buildLevelUpEmbed(
        `<@${message.author.id}>`, 7, 1200,
        message.author.displayAvatarURL(),
        cfg?.title, cfg?.description, cfg?.imageUrl,
      );
      await reply({ content: '**Preview** (level 7, 1200 XP):', embeds: [embed] });
      return;
    }

    const value = args.slice(1).join(' ').trim();
    if (!value) {
      await reply(`❌ Usage: \`${prefix}levelconfig ${sub} <value>\``);
      return;
    }

    if (sub === 'title') {
      updateGuild(guild.id, d => {
        if (!d.config.levelUpMessage) d.config.levelUpMessage = {};
        d.config.levelUpMessage.title = value;
      });
      await reply(`✅ Level-up title set to: **${value}**`);
      return;
    }

    if (sub === 'description') {
      updateGuild(guild.id, d => {
        if (!d.config.levelUpMessage) d.config.levelUpMessage = {};
        d.config.levelUpMessage.description = value;
      });
      await reply(`✅ Level-up description set to: **${value}**`);
      return;
    }

    if (sub === 'image') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
      } catch {
        await reply('❌ Please provide a valid HTTP/HTTPS image or GIF URL.');
        return;
      }
      updateGuild(guild.id, d => {
        if (!d.config.levelUpMessage) d.config.levelUpMessage = {};
        d.config.levelUpMessage.imageUrl = value;
      });
      await reply(`✅ Level-up image set.`);
      return;
    }

    await reply(`❌ Unknown subcommand. Use \`${prefix}levelconfig help\` for usage.`);
    return;
  }

  // ── .setprefix ───────────────────────────────────────────────────────────────
  if (cmd === 'setprefix') {
    if (!perm(member, PermissionFlagsBits.Administrator)) {
      await reply('❌ You need **Administrator** permission to change the prefix.');
      return;
    }
    const newPrefix = args[0];
    if (!newPrefix) { await reply(`❌ Provide a new prefix. Example: \`${prefix}setprefix !\``); return; }
    if (newPrefix.length > 5) { await reply('❌ Prefix must be 5 characters or fewer.'); return; }
    updateGuild(guild.id, d => { d.config.prefix = newPrefix; });
    await reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('✅ Prefix Updated')
      .addFields(
        { name: 'New Prefix', value: `\`${newPrefix}\``, inline: true },
        { name: 'Example', value: `\`${newPrefix}ban @user\`, \`${newPrefix}purge 20\``, inline: true },
      ).setFooter({ text: `Changed by ${message.author.username}` }).setTimestamp()] });
    return;
  }

  // ── .createrole ──────────────────────────────────────────────────────────────
  // Usage: .createrole <name> [#hex color] [high]
  //   high  — place role just below bot's top role so color displays correctly
  if (cmd === 'createrole') {
    if (!perm(member, PermissionFlagsBits.ManageRoles)) {
      await reply('❌ You need **Manage Roles** permission.');
      return;
    }

    if (!args.length) {
      await reply(`❌ Usage: \`${prefix}createrole <name> [#hex] [high]\`\nExample: \`${prefix}createrole VIP #FFD700 high\``);
      return;
    }

    const hexRe = /^#?[0-9a-fA-F]{6}$/;

    // Detect trailing 'high' flag
    let highPosition = false;
    if (args[args.length - 1]?.toLowerCase() === 'high') {
      highPosition = true;
      args.pop();
    }

    // Detect trailing hex color (after removing 'high' if present)
    let color: number | undefined;
    const lastArg = args[args.length - 1] ?? '';
    if (args.length > 1 && hexRe.test(lastArg)) {
      color = parseInt(lastArg.replace('#', ''), 16);
      args.pop();
    }

    const roleName = args.join(' ').trim();
    if (!roleName) {
      await reply(`❌ Usage: \`${prefix}createrole <name> [#hex] [high] [@member]\``);
      return;
    }

    try {
      const role = await guild.roles.create({
        name: roleName,
        color,
        hoist: false,
        permissions: 0n,
        reason: `Created by ${message.author.tag} via ${prefix}createrole`,
      });

      // If high flag, move role just below bot's top role so its color displays
      let positionNote = 'Bottom (default)';
      if (highPosition) {
        const botMember = guild.members.me;
        if (botMember) {
          const botTop = botMember.roles.highest.position;
          if (botTop > 1) {
            await role.setPosition(botTop - 1).catch(() => null);
            positionNote = `High (position ~${botTop - 1})`;
          }
        }
      }

      // Optionally assign the role to a mentioned member
      const mentionedUser = message.mentions.users.first();
      let assignedTo = 'Nobody';
      if (mentionedUser) {
        const targetMember = await guild.members.fetch(mentionedUser.id).catch(() => null);
        if (targetMember) {
          await targetMember.roles.add(role.id, `Role assigned by ${message.author.tag} via ${prefix}createrole`).catch(() => null);
          assignedTo = `<@${mentionedUser.id}>`;
        } else {
          assignedTo = '⚠️ User not in server';
        }
      }

      const displayColor = color !== undefined
        ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`
        : 'Default';

      await reply({ embeds: [new EmbedBuilder()
        .setColor(role.color || 0x5865F2)
        .setTitle('✅ Role Created')
        .addFields(
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'Name', value: role.name, inline: true },
          { name: 'Color', value: displayColor, inline: true },
          { name: 'Position', value: positionNote, inline: true },
          { name: 'Permissions', value: 'None (cosmetic)', inline: true },
          { name: 'Given To', value: assignedTo, inline: true },
        ).setTimestamp()] });
    } catch {
      await reply('❌ Failed to create role. Check my **Manage Roles** permission.');
    }
    return;
  }

  // ── .roleassign ──────────────────────────────────────────────────────────────
  // Usage: .roleassign @member @role [add|remove]
  if (cmd === 'roleassign') {
    if (!perm(member, PermissionFlagsBits.ManageRoles)) {
      await reply('❌ You need **Manage Roles** permission.');
      return;
    }
    const target = message.mentions.users.first();
    const role = message.mentions.roles.first();
    if (!target || !role) {
      await reply(`❌ Usage: \`${prefix}roleassign @member @role [add|remove]\``);
      return;
    }
    const actionArg = args[args.length - 1]?.toLowerCase();
    const removing = actionArg === 'remove';
    const gm = await guild.members.fetch(target.id).catch(() => null);
    if (!gm) { await reply('❌ That user is not in this server.'); return; }
    const botMember = guild.members.me;
    if (botMember && botMember.roles.highest.position <= role.position) {
      await reply('❌ I cannot manage that role — it is higher than or equal to my top role.');
      return;
    }
    try {
      if (removing) {
        await gm.roles.remove(role.id, `Removed by ${message.author.tag}`);
      } else {
        await gm.roles.add(role.id, `Assigned by ${message.author.tag}`);
      }
      await reply({ embeds: [new EmbedBuilder()
        .setColor(removing ? 0xFF3333 : 0x00CC44)
        .setTitle(removing ? '❌ Role Removed' : '✅ Role Assigned')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Member', value: `<@${target.id}>`, inline: true },
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'By', value: message.author.tag, inline: true },
        ).setTimestamp()] });
    } catch {
      await reply('❌ Failed to modify the role. Check my permissions.');
    }
    return;
  }

  // ── .random <id>  (giveaway reroll) ─────────────────────────────────────────
  if (cmd === 'random') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission to reroll a giveaway.');
      return;
    }
    const giveawayId = args[0]?.trim();
    if (!giveawayId) {
      await reply(`❌ Usage: \`${prefix}random <giveaway id>\`\nThe ID is shown in the footer of the ended giveaway panel.`);
      return;
    }

    const data = loadGuild(guild.id);
    const giveaway = data.giveaways.find(g => g.id === giveawayId);

    if (!giveaway) {
      await reply(`❌ No giveaway found with ID \`${giveawayId}\`. Check the footer of the ended giveaway panel.`);
      return;
    }
    if (!giveaway.ended) {
      await reply('❌ That giveaway has not ended yet.');
      return;
    }
    if (giveaway.entries.length === 0) {
      await reply('❌ That giveaway has no entries to pick from.');
      return;
    }

    const newWinnerId = await rerollWinner(guild, giveaway);
    if (!newWinnerId) {
      await reply('❌ Could not pick a new winner — no eligible entries.');
      return;
    }

    // Persist new winner
    updateGuild(guild.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g) g.winnerId = newWinnerId;
    });

    // Update ended panel embed
    try {
      const ch = await guild.channels.fetch(giveaway.channelId);
      if (ch?.isTextBased()) {
        const channel = ch as BaseGuildTextChannel;
        const updatedGiveaway = { ...giveaway, winnerId: newWinnerId };
        const embed = buildGiveawayEndedEmbed(updatedGiveaway, prefix);
        const panelMsg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (panelMsg) await panelMsg.edit({ embeds: [embed], components: [] }).catch(() => undefined);

        await channel.send({
          content: `🔄 Giveaway rerolled! New winner: <@${newWinnerId}>! Congratulations on winning **${giveaway.prize}**!`,
          allowedMentions: { users: [newWinnerId] },
        });
      }
    } catch {
      // channel inaccessible
    }

    await reply({ embeds: [new EmbedBuilder()
      .setColor(0x00CC44)
      .setTitle('🔄 Giveaway Rerolled')
      .addFields(
        { name: '🏆 Prize', value: giveaway.prize, inline: true },
        { name: '📋 Giveaway', value: giveaway.name, inline: true },
        { name: '🏅 New Winner', value: `<@${newWinnerId}>`, inline: false },
      )
      .setFooter({ text: `Rerolled by ${message.author.tag} • ID: ${giveawayId}` })
      .setTimestamp()] });
    return;
  }

  // ── .giveawaycreate ──────────────────────────────────────────────────────────
  // Usage: .giveawaycreate <duration> #channel | <name> | <prize>
  // Optional role mentions: first @role = required role, second @role = blacklist role
  if (cmd === 'giveawaycreate') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }

    // Parse: strip channel mention from args, remaining is duration | name | prize
    const channelMention = message.mentions.channels.first() as TextChannel | undefined;
    if (!channelMention) {
      await reply(`❌ Usage: \`${prefix}giveawaycreate <duration> #channel | <name> | <prize>\`\n*Tip: use \`/giveaway create\` for advanced options (required role, blacklist, bonus entries, image).*`);
      return;
    }

    // Remove channel mention token from the raw text, then parse pipes
    const stripped = args.join(' ').replace(/<#\d+>/g, '').trim();
    const pipes = stripped.split('|').map(p => p.trim()).filter(Boolean);

    if (pipes.length < 3) {
      await reply(`❌ Usage: \`${prefix}giveawaycreate <duration> #channel | <name> | <prize>\`\nExample: \`${prefix}giveawaycreate 1h #giveaways | Weekly Giveaway | $10 Gift Card\``);
      return;
    }

    const durationStr = pipes[0];
    const name = pipes[1];
    const prize = pipes.slice(2).join(' | ');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) { await reply('❌ Invalid duration. Examples: `30m`, `1h`, `2d`'); return; }
    if (durationMs < 10_000) { await reply('❌ Duration must be at least 10 seconds.'); return; }
    if (durationMs > 30 * 24 * 60 * 60 * 1000) { await reply('❌ Duration cannot exceed 30 days.'); return; }

    // Optional role mentions (first = required, second = blacklist)
    const mentionedRoles = [...message.mentions.roles.values()];
    const requiredRoleId = mentionedRoles[0]?.id;
    const blacklistRoleId = mentionedRoles[1]?.id;

    const endsAt = Date.now() + durationMs;
    const giveawayId = generateId();

    const newGiveaway: Giveaway = {
      id: giveawayId,
      guildId: guild.id,
      channelId: channelMention.id,
      messageId: '',
      name,
      prize,
      endsAt,
      hostId: message.author.id,
      entries: [],
      requiredRoleId,
      blacklistRoleId,
      ended: false,
    };

    try {
      const embed = buildGiveawayEmbed(newGiveaway);
      const row = buildGiveawayRow(giveawayId);
      const sent = await (channelMention as BaseGuildTextChannel).send({ embeds: [embed], components: [row] });
      newGiveaway.messageId = sent.id;
      updateGuild(guild.id, data => { data.giveaways.push(newGiveaway); });
      await reply(`✅ Giveaway **${name}** started in <#${channelMention.id}>!\n*Use \`/giveaway create\` for bonus entries, role restrictions, and image support.*`);
    } catch {
      await reply('❌ Failed to post the giveaway panel. Check I have permission to send messages in that channel.');
    }
    return;
  }

  // ── .gleave <id>  (leave a giveaway) ────────────────────────────────────────
  if (cmd === 'gleave') {
    const giveawayId = args[0]?.trim();
    if (!giveawayId) {
      await reply(`❌ Usage: \`${prefix}gleave <giveaway id>\`\nThe ID is shown in the footer of the giveaway panel.`);
      return;
    }
    const data = loadGuild(guild.id);
    const giveaway = data.giveaways.find(g => g.id === giveawayId);
    if (!giveaway) {
      await reply(`❌ No active giveaway found with ID \`${giveawayId}\`.`);
      return;
    }
    if (giveaway.ended || giveaway.endsAt <= Date.now()) {
      await reply('❌ That giveaway has already ended.');
      return;
    }
    if (!giveaway.entries.includes(message.author.id)) {
      await reply("❌ You haven't entered that giveaway.");
      return;
    }
    updateGuild(guild.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g) g.entries = g.entries.filter(id => id !== message.author.id);
    });
    // Update the panel message
    try {
      const updatedGiveaway = loadGuild(guild.id).giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        const ch = await guild.channels.fetch(updatedGiveaway.channelId);
        if (ch?.isTextBased()) {
          const panelMsg = await (ch as BaseGuildTextChannel).messages.fetch(updatedGiveaway.messageId).catch(() => null);
          if (panelMsg) {
            const updatedEmbed = buildGiveawayEmbed(updatedGiveaway);
            const row = buildGiveawayRow(giveawayId, updatedGiveaway.entries.length);
            await panelMsg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => undefined);
          }
        }
      }
    } catch { /* ignore */ }
    await reply('✅ You have left the giveaway.');
    return;
  }

  // ── .gparticipants <id>  (view giveaway participants) ───────────────────────
  if (cmd === 'gparticipants') {
    const giveawayId = args[0]?.trim();
    if (!giveawayId) {
      await reply(`❌ Usage: \`${prefix}gparticipants <giveaway id>\``);
      return;
    }
    const data = loadGuild(guild.id);
    const giveaway = data.giveaways.find(g => g.id === giveawayId);
    if (!giveaway) {
      await reply(`❌ No giveaway found with ID \`${giveawayId}\`.`);
      return;
    }
    const entries = giveaway.entries;
    const participantList =
      entries.length === 0
        ? '*No participants yet.*'
        : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') +
          (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
    await reply({ embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`👥 Participants — ${giveaway.name}`)
      .setDescription(participantList)
      .setFooter({ text: `Total: ${entries.length} participant(s) • ID: ${giveawayId}` })] });
    return;
  }

  // ── .gremove <id> @user  (admin: remove a participant) ──────────────────────
  if (cmd === 'gremove') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission to remove participants.');
      return;
    }
    const giveawayId = args[0]?.trim();
    const targetUser = message.mentions.users.first();
    if (!giveawayId || !targetUser) {
      await reply(`❌ Usage: \`${prefix}gremove <giveaway id> @user\``);
      return;
    }
    const data = loadGuild(guild.id);
    const giveaway = data.giveaways.find(g => g.id === giveawayId);
    if (!giveaway) {
      await reply(`❌ No giveaway found with ID \`${giveawayId}\`.`);
      return;
    }
    if (giveaway.ended) {
      await reply('❌ That giveaway has already ended.');
      return;
    }
    if (!giveaway.entries.includes(targetUser.id)) {
      await reply(`❌ <@${targetUser.id}> is not in that giveaway.`);
      return;
    }
    updateGuild(guild.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g) g.entries = g.entries.filter(id => id !== targetUser.id);
    });
    // Update the panel message
    try {
      const updatedGiveaway = loadGuild(guild.id).giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        const ch = await guild.channels.fetch(updatedGiveaway.channelId);
        if (ch?.isTextBased()) {
          const panelMsg = await (ch as BaseGuildTextChannel).messages.fetch(updatedGiveaway.messageId).catch(() => null);
          if (panelMsg) {
            const updatedEmbed = buildGiveawayEmbed(updatedGiveaway);
            const row = buildGiveawayRow(giveawayId, updatedGiveaway.entries.length);
            await panelMsg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => undefined);
          }
        }
      }
    } catch { /* ignore */ }
    await reply(`✅ Removed <@${targetUser.id}> from giveaway **${giveaway.name}**.`);
    return;
  }

  // ── .gend <id>  (admin: force-end a giveaway now) ───────────────────────────
  if (cmd === 'gend') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission to end a giveaway.');
      return;
    }
    const input = args[0]?.trim();
    if (!input) {
      await reply(`❌ Usage: \`${prefix}gend <giveaway id or message id>\`\nThe giveaway ID is shown in the panel footer. You can also right-click the panel → Copy Message ID.`);
      return;
    }
    const data = loadGuild(guild.id);
    // Accept both the internal giveaway ID and the Discord message ID of the panel
    const giveaway = data.giveaways.find(g => g.id === input || g.messageId === input);
    if (!giveaway) {
      await reply(`❌ No giveaway found with ID or message ID \`${input}\`. Check the footer of the giveaway panel, or right-click the panel to copy its message ID.`);
      return;
    }
    if (giveaway.ended) {
      await reply('❌ That giveaway has already ended.');
      return;
    }
    await reply(`⏳ Ending giveaway **${giveaway.name}**…`);
    await endGiveaway(guild, giveaway);
    return;
  }

  // ── .music <subcommand> ───────────────────────────────────────────────────────
  if (cmd === 'music') {
    const sub = args[0]?.toLowerCase();
    const voiceChannel = (member as GuildMember).voice?.channel;

    if (!sub) {
      await reply(`❌ Usage: \`${prefix}music <play|skip|stop|pause|resume|queue|nowplaying>\``);
      return;
    }

    // ── .music play <query> ──────────────────────────────────────────────────
    if (sub === 'play') {
      if (!voiceChannel) { await reply('❌ Join a voice channel first.'); return; }
      const query = args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
      if (!query) { await reply(`❌ Usage: \`${prefix}music play <song name or URL>\``); return; }

      const searching = await message.channel.send('🔍 Searching YouTube...');
      const track = await searchTrack(query);
      await searching.delete().catch(() => undefined);

      if (!track) { await reply('❌ No results found. Try a different song name.'); return; }
      track.requestedBy = message.author.id;

      const { position } = await enqueue(guild, voiceChannel, message.channel, track);

      if (position === 1 && !getQueue(guild.id)?.current) {
        await reply(`✅ Starting **${track.title}** \`${track.duration}\``);
      } else {
        await reply(`✅ Added to queue **#${position}**: **${track.title}** \`${track.duration}\``);
      }
      return;
    }

    // ── .music skip ──────────────────────────────────────────────────────────
    if (sub === 'skip') {
      if (!voiceChannel) { await reply('❌ Join a voice channel first.'); return; }
      const skipped = skip(guild.id);
      await reply(skipped ? `⏭️ Skipped **${skipped.title}**.` : '❌ Nothing is playing right now.');
      return;
    }

    // ── .music stop ──────────────────────────────────────────────────────────
    if (sub === 'stop') {
      if (!voiceChannel) { await reply('❌ Join a voice channel first.'); return; }
      const q = getQueue(guild.id);
      if (!q) { await reply('❌ Nothing is playing right now.'); return; }
      stop(guild.id);
      await reply('⏹️ Stopped music and disconnected.');
      return;
    }

    // ── .music pause ─────────────────────────────────────────────────────────
    if (sub === 'pause') {
      const ok = pause(guild.id);
      await reply(ok ? '⏸️ Paused.' : '❌ Nothing is playing or already paused.');
      return;
    }

    // ── .music resume ────────────────────────────────────────────────────────
    if (sub === 'resume') {
      const ok = resume(guild.id);
      await reply(ok ? '▶️ Resumed.' : '❌ Nothing is paused right now.');
      return;
    }

    // ── .music queue ─────────────────────────────────────────────────────────
    if (sub === 'queue') {
      await reply({ embeds: [buildQueueEmbed(guild.id)] });
      return;
    }

    // ── .music nowplaying ────────────────────────────────────────────────────
    if (sub === 'nowplaying' || sub === 'np') {
      const q = getQueue(guild.id);
      if (!q?.current) { await reply('❌ Nothing is playing right now.'); return; }
      await reply({ embeds: [buildNowPlayingEmbed(q.current)] });
      return;
    }

    await reply(`❌ Unknown subcommand. Try \`${prefix}music play <song>\`, \`${prefix}music skip\`, \`${prefix}music stop\`, etc.`);
    return;
  }

  // ── .welcome ─────────────────────────────────────────────────────────────────
  // Usage: .welcome channel|message|enable|disable|view|test|embed
  if (cmd === 'welcome') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }
    const sub = args[0]?.toLowerCase();

    if (sub === 'channel') {
      const ch = message.mentions.channels.first();
      if (!ch) { await reply(`❌ Usage: \`${prefix}welcome channel #channel\``); return; }
      updateGuild(guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: true };
        d.welcome.channelId = ch.id;
        d.welcome.enabled   = true;
      });
      await reply(`✅ Welcome channel set to <#${ch.id}>.\n💡 Default message: \`Welcome {user}\` — change with \`${prefix}welcome message <text>\`\n💡 Add an embed with \`${prefix}welcome embed set\``);
      return;
    }

    if (sub === 'message') {
      const text = args.slice(1).join(' ');
      if (!text) { await reply(`❌ Usage: \`${prefix}welcome message <text>\``); return; }
      updateGuild(guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: true };
        d.welcome.message = text;
        d.welcome.enabled = true;
      });
      await reply(`✅ Welcome plain text set!\n\`\`\`\n${text.slice(0, 300)}\n\`\`\``);
      return;
    }

    if (sub === 'enable') {
      updateGuild(guild.id, d => { if (!d.welcome) d.welcome = { enabled: true }; d.welcome.enabled = true; });
      await reply('✅ Welcome system enabled.');
      return;
    }

    if (sub === 'disable') {
      updateGuild(guild.id, d => { if (!d.welcome) d.welcome = { enabled: false }; d.welcome.enabled = false; });
      await reply('✅ Welcome system disabled.');
      return;
    }

    if (sub === 'view') {
      const data = loadGuild(guild.id);
      const w    = data.welcome;
      const emb  = w?.embed;
      const embedLines = emb
        ? [
            `Status: ${emb.enabled ? '✅ On' : '❌ Off'}`,
            emb.title       ? `Title: ${emb.title}` : null,
            emb.description ? `Description: ${emb.description.slice(0, 80)}${emb.description.length > 80 ? '…' : ''}` : null,
            emb.thumbnailUrl ? `Thumbnail: ${emb.thumbnailUrl}` : null,
            emb.imageUrl    ? `Image: ${emb.imageUrl}` : null,
            emb.footerText  ? `Footer: ${emb.footerText}` : null,
          ].filter(Boolean).join('\n')
        : '*(not configured)*';
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('👋 Welcome System Configuration')
        .addFields(
          { name: '📊 Status',   value: w?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '📢 Channel',  value: w?.channelId ? `<#${w.channelId}>` : '*(not set)*', inline: true },
          { name: '\u200b',      value: '\u200b', inline: true },
          { name: '💬 Plain Text', value: `\`${(w?.message ?? DEFAULT_WELCOME_MESSAGE).slice(0, 500)}\`` },
          { name: '🖼️ Embed',    value: embedLines },
          { name: '🔤 Variables', value: VARIABLES_HELP },
        );
      await reply({ embeds: [embed] });
      return;
    }

    if (sub === 'test') {
      const data = loadGuild(guild.id);
      const w    = data.welcome;
      if (!w?.channelId) { await reply('❌ No welcome channel set.'); return; }
      const ch = guild.channels.cache.get(w.channelId) as TextChannel | undefined;
      if (!ch?.isTextBased()) { await reply('❌ Welcome channel not found.'); return; }
      const { content: wContent, embeds: wEmbeds } = resolveWelcomeSend(w, member, data.savedEmbeds ?? {});
      await ch.send({ content: wContent, embeds: wEmbeds });
      await reply(`✅ Test welcome sent to <#${w.channelId}>!`);
      return;
    }

    // ── .welcome embed <set|toggle|clear|preview> ─────────────────────────────
    if (sub === 'embed') {
      const esub = args[1]?.toLowerCase();

      if (esub === 'set') {
        // Format: .welcome embed set field:value field:value ...
        // Supported: title, description, color, thumbnail, image, footer
        const rest = args.slice(2).join(' ');
        if (!rest) {
          await reply(
            `❌ Usage: \`${prefix}welcome embed set title:Your Title description:Glad you joined! color:#5865F2 thumbnail:{user.avatar} image:https://... footer:Footer text\`\n` +
            `Each field is optional. Use \`field:value\` pairs separated by spaces.\n` +
            `**Variables:** \`{user}\`, \`{user.name}\`, \`{server}\`, \`{membercount}\`, \`{ordinal}\``,
          );
          return;
        }
        // Parse key:value pairs (value can contain spaces until next key:)
        const parsed: Record<string, string> = {};
        const pattern = /(\w+):([\s\S]*?)(?=\s+\w+:|$)/g;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(rest)) !== null) {
          parsed[m[1].toLowerCase()] = m[2].trim();
        }
        if (Object.keys(parsed).length === 0) {
          await reply(`❌ Could not parse fields. Use \`field:value\` format, e.g. \`title:Welcome!\``);
          return;
        }
        updateGuild(guild.id, d => {
          if (!d.welcome)       d.welcome       = { enabled: true };
          if (!d.welcome.embed) d.welcome.embed = { enabled: true };
          if (parsed.title)       d.welcome.embed.title        = parsed.title;
          if (parsed.description) d.welcome.embed.description  = parsed.description;
          if (parsed.thumbnail)   d.welcome.embed.thumbnailUrl = parsed.thumbnail;
          if (parsed.image)       d.welcome.embed.imageUrl     = parsed.image;
          if (parsed.footer)      d.welcome.embed.footerText   = parsed.footer;
          if (parsed.color) {
            const c = parseColor(parsed.color);
            if (c === undefined) { /* silently skip invalid color rather than crash */ }
            else d.welcome.embed.color = c;
          }
          d.welcome.embed.enabled = true;
        });
        await reply(`✅ Embed updated! Use \`${prefix}welcome test\` to preview it in the welcome channel.`);
        return;
      }

      if (esub === 'toggle') {
        const data = loadGuild(guild.id);
        const current = data.welcome?.embed?.enabled ?? false;
        updateGuild(guild.id, d => {
          if (!d.welcome)       d.welcome       = { enabled: true };
          if (!d.welcome.embed) d.welcome.embed = { enabled: !current };
          else d.welcome.embed.enabled = !current;
        });
        await reply(current ? '✅ Welcome embed **disabled**.' : '✅ Welcome embed **enabled**.');
        return;
      }

      if (esub === 'clear') {
        updateGuild(guild.id, d => { if (d.welcome) d.welcome.embed = undefined; });
        await reply('🗑️ Embed cleared. Welcome will be plain text only.');
        return;
      }

      if (esub === 'preview') {
        const data = loadGuild(guild.id);
        const cfg  = data.welcome?.embed;
        if (!cfg) { await reply(`❌ No embed configured. Use \`${prefix}welcome embed set ...\` first.`); return; }
        await reply({ content: '**Preview** *(variables shown as placeholders)*', embeds: [buildWelcomeEmbedPreview(cfg)] });
        return;
      }

      await reply(
        `❌ Usage:\n` +
        `\`${prefix}welcome embed set title:... description:... color:#hex thumbnail:url image:url footer:...\`\n` +
        `\`${prefix}welcome embed toggle\`\n` +
        `\`${prefix}welcome embed clear\`\n` +
        `\`${prefix}welcome embed preview\``,
      );
      return;
    }

    await reply(
      `❌ Usage:\n` +
      `\`${prefix}welcome channel #channel\`\n` +
      `\`${prefix}welcome message <text>\`\n` +
      `\`${prefix}welcome embed set title:... description:... color:#hex thumbnail:url image:url footer:...\`\n` +
      `\`${prefix}welcome enable|disable|view|test\``,
    );
    return;
  }

  // ── .greet ───────────────────────────────────────────────────────────────────
  // Usage: .greet [@user]  — test welcome message as a new joined member
  if (cmd === 'greet') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }
    const data = loadGuild(guild.id);
    const w    = data.welcome;
    if (!w?.enabled) { await reply('❌ Welcome system is disabled.'); return; }
    if (!w.channelId) { await reply('❌ No welcome channel set. Use `!welcome channel #channel` first.'); return; }
    const ch = guild.channels.cache.get(w.channelId) as TextChannel | undefined;
    if (!ch?.isTextBased()) { await reply('❌ Welcome channel not found.'); return; }

    const targetUser = message.mentions.users.first();
    let target: GuildMember = member;
    if (targetUser) {
      const fetched = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!fetched) { await reply('❌ Could not fetch that member.'); return; }
      target = fetched;
    }

    const { content: greetContent, embeds: greetEmbeds } = resolveWelcomeSend(w, target, data.savedEmbeds ?? {});
    await ch.send({ content: greetContent, embeds: greetEmbeds });
    await reply(`✅ Welcome message sent to <#${w.channelId}> for ${target}!`);
    return;
  }

  // ── .embed ───────────────────────────────────────────────────────────────────
  // Usage: .embed create <name> | .embed list | .embed preview <name> | .embed delete <name>
  //        .embed addfield <name> | <field name> | <field value> [inline]
  //        .embed set <name> title|description|color|thumbnail|image|footer|author <value>
  if (cmd === 'embed') {
    if (!perm(member, PermissionFlagsBits.ManageGuild)) {
      await reply('❌ You need **Manage Server** permission.');
      return;
    }
    const sub = args[0]?.toLowerCase();

    if (sub === 'list') {
      const data   = loadGuild(guild.id);
      const names  = Object.keys(data.savedEmbeds ?? {});
      if (!names.length) { await reply('📭 No saved embeds. Use `.embed create <name>` to make one.'); return; }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🖼️ Saved Embeds (${names.length})`)
        .setDescription(names.map((n, i) => `**${i + 1}.** \`${n}\``).join('\n'))
        .setFooter({ text: 'Use .welcome message {embed:name} to set one as welcome' });
      await reply({ embeds: [embed] });
      return;
    }

    if (sub === 'create') {
      const name = args[1]?.toLowerCase();
      if (!name) { await reply(`❌ Usage: \`${prefix}embed create <name>\``); return; }
      if (!/^[a-z0-9_-]+$/.test(name)) { await reply('❌ Name may only contain letters, numbers, hyphens, underscores.'); return; }
      const data = loadGuild(guild.id);
      if (data.savedEmbeds?.[name]) { await reply(`❌ Embed \`${name}\` already exists. Use \`${prefix}embed set ${name}\` to edit.`); return; }
      updateGuild(guild.id, d => {
        if (!d.savedEmbeds) d.savedEmbeds = {};
        d.savedEmbeds[name] = { name, fields: [] };
      });
      await reply(`✅ Embed \`${name}\` created!\nUse \`${prefix}embed set ${name} title Your Title\` to add content.\nUse \`${prefix}welcome message {embed:${name}}\` to set it as the welcome message.`);
      return;
    }

    if (sub === 'set') {
      // .embed set <name> <field> <value>
      const name  = args[1]?.toLowerCase();
      const field = args[2]?.toLowerCase();
      const value = args.slice(3).join(' ');
      if (!name || !field || !value) {
        await reply(`❌ Usage: \`${prefix}embed set <name> <title|description|color|thumbnail|image|footer|author> <value>\``);
        return;
      }
      const data = loadGuild(guild.id);
      if (!data.savedEmbeds?.[name]) { await reply(`❌ No embed named \`${name}\`. Use \`${prefix}embed create ${name}\`.`); return; }

      updateGuild(guild.id, d => {
        const e = d.savedEmbeds![name];
        if (field === 'title')       e.title        = value;
        else if (field === 'description') e.description  = value;
        else if (field === 'color')  e.color        = parseColor(value);
        else if (field === 'thumbnail') e.thumbnailUrl = value;
        else if (field === 'image')  e.imageUrl     = value;
        else if (field === 'footer') e.footerText   = value;
        else if (field === 'author') e.authorName   = value;
      });

      const saved = loadGuild(guild.id).savedEmbeds![name];
      await reply({ content: `✅ Set **${field}** on \`${name}\`.\n\n**Preview:**`, embeds: [buildEmbedPreview(saved)] });
      return;
    }

    if (sub === 'addfield') {
      // .embed addfield <name> | <field name> | <value> [inline]
      const name = args[1]?.toLowerCase();
      if (!name) { await reply(`❌ Usage: \`${prefix}embed addfield <name> | <field name> | <value> [inline]\``); return; }
      const rest = args.slice(2).join(' ');
      const parts = rest.split('|').map(p => p.trim());
      if (parts.length < 2) { await reply(`❌ Separate name and value with \`|\`. e.g. \`${prefix}embed addfield myembed | Field Name | Field Value\``); return; }
      const fieldName  = parts[0];
      const fieldValue = parts[1];
      const inline     = parts[2]?.toLowerCase() === 'inline' || parts[2]?.toLowerCase() === 'true';
      const data = loadGuild(guild.id);
      if (!data.savedEmbeds?.[name]) { await reply(`❌ No embed named \`${name}\`.`); return; }
      if ((data.savedEmbeds[name].fields?.length ?? 0) >= 25) { await reply('❌ Max 25 fields per embed.'); return; }
      updateGuild(guild.id, d => {
        if (!d.savedEmbeds![name].fields) d.savedEmbeds![name].fields = [];
        d.savedEmbeds![name].fields!.push({ name: fieldName, value: fieldValue, inline });
      });
      const saved = loadGuild(guild.id).savedEmbeds![name];
      await reply({ content: `✅ Field added to \`${name}\`.\n\n**Preview:**`, embeds: [buildEmbedPreview(saved)] });
      return;
    }

    if (sub === 'preview') {
      const name = args[1]?.toLowerCase();
      if (!name) { await reply(`❌ Usage: \`${prefix}embed preview <name>\``); return; }
      const data = loadGuild(guild.id);
      const saved = data.savedEmbeds?.[name];
      if (!saved) { await reply(`❌ No embed named \`${name}\`.`); return; }
      await reply({ content: `🖼️ **Preview of \`${name}\`**:`, embeds: [buildEmbedPreview(saved)] });
      return;
    }

    if (sub === 'delete') {
      const name = args[1]?.toLowerCase();
      if (!name) { await reply(`❌ Usage: \`${prefix}embed delete <name>\``); return; }
      const data = loadGuild(guild.id);
      if (!data.savedEmbeds?.[name]) { await reply(`❌ No embed named \`${name}\`.`); return; }
      updateGuild(guild.id, d => { delete d.savedEmbeds![name]; });
      await reply(`🗑️ Embed \`${name}\` deleted.`);
      return;
    }

    await reply(
      `❌ Unknown subcommand.\n` +
      `**Usage:**\n` +
      `\`${prefix}embed create <name>\`\n` +
      `\`${prefix}embed set <name> title|description|color|thumbnail|image|footer|author <value>\`\n` +
      `\`${prefix}embed addfield <name> | Field Name | Field Value [inline]\`\n` +
      `\`${prefix}embed preview <name>\`\n` +
      `\`${prefix}embed list\`\n` +
      `\`${prefix}embed delete <name>\``,
    );
    return;
  }
}
