import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const purge: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete a specified number of messages from the channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName('amount')
        .setDescription('Number of messages to delete (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user')),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply({ flags: 64 });

    const amount = interaction.options.getInteger('amount', true);
    const filterUser = interaction.options.getUser('user');

    if (!interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.editReply('❌ This command can only be used in server text channels.');
      return;
    }

    try {
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      let toDelete = [...messages.values()].slice(0, amount + 50);

      // Filter by user if specified
      if (filterUser) {
        toDelete = toDelete.filter(m => m.author.id === filterUser.id);
      }

      toDelete = toDelete.slice(0, amount);

      // Discord only allows bulk-deleting messages < 14 days old
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const deletable = toDelete.filter(m => m.createdTimestamp > twoWeeksAgo);

      const deleted = await interaction.channel.bulkDelete(deletable, true);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(`🗑️ Deleted **${deleted.size}** message(s)${filterUser ? ` from ${filterUser.tag}` : ''}.`)
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to delete messages. Messages older than 14 days cannot be bulk-deleted.');
    }
  },
};
