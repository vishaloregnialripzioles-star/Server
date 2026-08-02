import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { createTicketForUser } from '../ticketUtils.js';

export const ticket: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create a private support ticket')
    .addStringOption(o =>
      o.setName('reason')
        .setDescription('What do you need help with?')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ flags: 64 });

    const reason = interaction.options.getString('reason', true);
    const result = await createTicketForUser(
      interaction.guild,
      interaction.user,
      interaction.client,
      reason,
    );

    if (result.success) {
      await interaction.editReply(`✅ Your ticket has been created: <#${result.channel.id}>`);
    } else {
      await interaction.editReply(`❌ ${result.message}`);
    }
  },
};
