import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const closeticket: Command = {
  data: new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close the current support ticket')
    .addStringOption(o => o.setName('reason').setDescription('Closing reason')),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply();

    const data = loadGuild(interaction.guild.id);
    const ticket = Object.values(data.tickets).find(
      t => t.channelId === interaction.channelId && !t.closed,
    );

    if (!ticket) {
      await interaction.editReply('❌ This channel is not an open ticket.');
      return;
    }

    const isStaff = (interaction.member as { permissions: { has(p: bigint): boolean } })
      .permissions.has(PermissionFlagsBits.ManageGuild);
    const isOwner = ticket.creatorId === interaction.user.id;

    if (!isStaff && !isOwner) {
      await interaction.editReply('❌ Only staff or the ticket creator can close this ticket.');
      return;
    }

    const reason = interaction.options.getString('reason') ?? 'Resolved';

    const closeEmbed = new EmbedBuilder()
      .setColor(0xFF3333)
      .setTitle('🔒 Ticket Closed')
      .addFields(
        { name: 'Closed By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [closeEmbed] });

    // Mark as closed
    updateGuild(interaction.guild.id, d => {
      const t = Object.values(d.tickets).find(t => t.channelId === interaction.channelId);
      if (t) t.closed = true;
    });

    // Delete channel after a short delay
    setTimeout(async () => {
      await (interaction.channel as TextChannel).delete(`Ticket closed by ${interaction.user.tag}: ${reason}`)
        .catch(() => undefined);
    }, 5000);
  },
};
