import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { buildSnipeEmbed, buildSnipeButtons } from '../snipeUtils.js';

export const editsnipe: Command = {
  data: new SlashCommandBuilder()
    .setName('editsnipe')
    .setDescription('View recently edited messages (original content) in this channel (up to 10)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.guild) return;

    const data = loadGuild(interaction.guild.id);

    if (!data.config.snipeEnabled) {
      await interaction.reply({ content: '❌ The snipe feature is disabled in this server.', flags: 64 });
      return;
    }

    const messages = data.lastEdited[interaction.channelId];
    if (!messages || messages.length === 0) {
      await interaction.reply({ content: '❌ No edited messages to snipe in this channel.', flags: 64 });
      return;
    }

    const index = 0;
    const embed = buildSnipeEmbed(messages, index, 'edit');
    const row = buildSnipeButtons(interaction.channelId, index, messages.length, 'editsnipe');

    await interaction.reply({ embeds: [embed], components: messages.length > 1 ? [row] : [] });
  },
};
