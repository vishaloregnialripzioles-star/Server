import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog, parseDuration, formatDuration } from '../utils.js';
import { loadGuild } from '../storage.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord 28-day limit

export const mute: Command = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member — applies a timed Discord timeout (and mute role if configured)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o =>
      o.setName('duration')
        .setDescription('How long to mute (e.g. 10m, 1h, 2d) — required for timeout')
        .setRequired(true),
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason for mute')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      await interaction.editReply('❌ Invalid duration. Examples: `10s`, `10m`, `1h`, `2d`');
      return;
    }

    if (durationMs > MAX_TIMEOUT_MS) {
      await interaction.editReply('❌ Duration cannot exceed 28 days (Discord limit).');
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }

    if (!member.moderatable) {
      await interaction.editReply('❌ I cannot mute this user (they may have a higher role).');
      return;
    }

    const auditReason = `${reason} | Mod: ${interaction.user.tag}`;
    const actions: string[] = [];

    // Apply Discord native timeout
    try {
      await member.timeout(durationMs, auditReason);
      actions.push(`⏱️ Discord timeout applied for **${formatDuration(durationMs)}**`);
    } catch {
      await interaction.editReply('❌ Failed to apply timeout to this user.');
      return;
    }

    // Also apply mute role if configured
    const data = loadGuild(interaction.guild.id);
    if (data.config.muteRole) {
      await member.roles.add(data.config.muteRole, auditReason).catch(() => null);
      actions.push('🔇 Mute role assigned');
    }

    const embed = new EmbedBuilder()
      .setColor(0xAAAAAA)
      .setTitle('🔇 Member Muted')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Reason', value: reason },
        { name: 'Actions', value: actions.join('\n') },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.guild, embed);
  },
};
