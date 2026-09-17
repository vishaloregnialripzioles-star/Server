import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { createTicketForUser, getTicketPanel } from '../ticketUtils.js';

export const ticket: Command = {
  data:new SlashCommandBuilder().setName('ticket').setDescription('Create a private support ticket')
    .addStringOption(o=>o.setName('reason').setDescription('What do you need help with?').setRequired(true))
    .addStringOption(o=>o.setName('panel').setDescription('Saved ticket panel name (optional)')),
  async execute(interaction){if(!interaction.guild)return;await interaction.deferReply({ephemeral:true});const reason=interaction.options.getString('reason',true),panelName=interaction.options.getString('panel')??undefined;const panel=panelName?getTicketPanel(interaction.guild,panelName):getTicketPanel(interaction.guild);if(panelName&&!panel){await interaction.editReply('❌ That ticket panel does not exist.');return;}const result=await createTicketForUser(interaction.guild,interaction.user,interaction.client,reason,panel?.name);if(result.success)await interaction.editReply(`✅ Your ticket has been created: <#${result.channel.id}>`);else await interaction.editReply(`❌ ${result.message}`);},
};
