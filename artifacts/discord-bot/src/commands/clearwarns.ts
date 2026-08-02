import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild, loadGuild } from '../storage.js';
import { sendLog } from '../utils.js';

export const clearwarns: Command = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('User to clear warnings for').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const data = loadGuild(interaction.guild.id);
    const count = (data.warnings[target.id] ?? []).length;

    updateGuild(interaction.guild.id, d => {
      d.warnings[target.id] = [];
    });

    const embed = new EmbedBuilder()
      .setColor(0x00CC44)
      .setTitle('🗑️ Warnings Cleared')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Warnings Removed', value: `${count}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.guild, embed);
  },
};
