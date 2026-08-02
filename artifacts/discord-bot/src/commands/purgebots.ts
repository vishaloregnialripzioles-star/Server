import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';

export const purgebots: Command = {
  data: new SlashCommandBuilder()
    .setName('purgebots')
    .setDescription('Delete bot messages from the channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName('amount')
        .setDescription('Max messages to scan (1–100, default 50)')
        .setMinValue(1).setMaxValue(100),
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply({ flags: 64 });

    const scanAmount = interaction.options.getInteger('amount') ?? 50;

    if (!interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.editReply('❌ Text channels only.');
      return;
    }

    try {
      const messages = await interaction.channel.messages.fetch({ limit: scanAmount });
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const botMessages = [...messages.values()].filter(
        m => m.author.bot && m.createdTimestamp > twoWeeksAgo,
      );

      if (botMessages.length === 0) {
        await interaction.editReply('✅ No bot messages found.');
        return;
      }

      const deleted = await interaction.channel.bulkDelete(botMessages, true);
      await interaction.editReply(`🤖 Deleted **${deleted.size}** bot message(s).`);
    } catch {
      await interaction.editReply('❌ Failed to delete bot messages.');
    }
  },
};
