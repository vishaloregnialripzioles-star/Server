import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { closeTicketById } from '../ticketUtils.js';

export const closeticket: Command = {
  data: new SlashCommandBuilder().setName('closeticket').setDescription('Close the current support ticket').addStringOption(o=>o.setName('reason').setDescription('Closing reason')),
  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    const data=loadGuild(interaction.guild.id);
    const ticket=Object.values(data.tickets).find(t=>t.channelId===interaction.channelId&&!t.closed);
    if(!ticket){await interaction.reply({content:'❌ This channel is not an open ticket.',ephemeral:true});return;}
    const isStaff=(interaction.member as {permissions:{has(p:bigint):boolean}}).permissions.has(PermissionFlagsBits.ManageGuild);
    if(!isStaff&&ticket.creatorId!==interaction.user.id){await interaction.reply({content:'❌ Only staff or the ticket creator can close this ticket.',ephemeral:true});return;}
    await interaction.deferReply({ephemeral:true});
    const reason=interaction.options.getString('reason')??'Resolved';
    const ok=await closeTicketById(interaction.guild,ticket.id,reason,interaction.user.tag);
    await interaction.editReply(ok?'🔒 Ticket closed. Use the buttons on the closed-ticket message to save the transcript, reopen it, or permanently close the channel.':'❌ I could not close this ticket.');
  }
};
