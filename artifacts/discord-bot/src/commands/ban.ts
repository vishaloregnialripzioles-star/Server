import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog } from '../utils.js';
import { BAN_EMBED_COLOR, createBanCase, sendBanDm } from '../banAppeals.js';

export const ban: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Permanently ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban'))
    .addIntegerOption(o =>
      o.setName('delete_days')
        .setDescription('Days of messages to delete (0–7)')
        .setMinValue(0).setMaxValue(7),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    const caseId = 'BAN-' + Date.now().toString(36).toUpperCase();

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      if (!member.bannable) {
        await interaction.editReply('❌ I cannot ban this user — they may have a higher role than me.');
        return;
      }
      if ((interaction.member as { roles: { highest: { position: number } } }).roles.highest.position <= member.roles.highest.position) {
        await interaction.editReply('❌ You cannot ban someone with an equal or higher role.');
        return;
      }
    }

    try {
      await sendBanDm(target, interaction.guild, reason, caseId);
      await interaction.guild.members.ban(target, {
        reason: `${reason} | Mod: ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
      createBanCase(interaction.guild, target, reason, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(BAN_EMBED_COLOR)
        .setTitle('🔨 Member Banned')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendLog(interaction.guild, embed);
    } catch {
      await interaction.editReply('❌ Failed to ban this user.');
    }
  },
};
