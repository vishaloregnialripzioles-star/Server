import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog, parseDuration, formatDuration } from '../utils.js';

export const timeoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily restrict a member from chatting, reacting, or joining voice')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption(o =>
      o.setName('duration')
        .setDescription('Duration (e.g. 10m, 1h, 1d, 1w — max 28 days)')
        .setRequired(true),
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason for timeout')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      await interaction.editReply('❌ Invalid duration. Examples: `10m`, `1h`, `2d`, `1w`');
      return;
    }

    const MAX_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_MS) {
      await interaction.editReply('❌ Timeout cannot exceed 28 days (Discord limit).');
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }
    if (!member.moderatable) {
      await interaction.editReply('❌ I cannot timeout this user.');
      return;
    }

    try {
      await member.timeout(durationMs, `${reason} | Mod: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⏱️ Member Timed Out')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Duration', value: formatDuration(durationMs), inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendLog(interaction.guild, embed);
    } catch {
      await interaction.editReply('❌ Failed to timeout this user.');
    }
  },
};
