import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { reopenTicketById } from '../ticketUtils.js';

export const reopen: Command = {
  data: new SlashCommandBuilder().setName('reopen').setDescription('Reopen the current closed ticket'),
  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    const data = loadGuild(interaction.guild.id);
    const ticket = Object.values(data.tickets).find(t => t.channelId === interaction.channelId);
    if (!ticket || !ticket.closed) { await interaction.reply({content:'❌ This channel is not a closed ticket.',ephemeral:true}); return; }
    const isStaff = (interaction.member as { permissions: { has(p: bigint): boolean } }).permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isStaff && ticket.creatorId !== interaction.user.id) { await interaction.reply({content:'❌ Only staff or the ticket owner can reopen this ticket.',ephemeral:true}); return; }
    const ok = await reopenTicketById(interaction.guild,ticket.id);
    await interaction.reply({content:ok?'🔓 Ticket reopened successfully.':'❌ I could not reopen this ticket.',ephemeral:true});
  }
};
