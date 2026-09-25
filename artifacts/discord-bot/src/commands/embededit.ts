import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { buildEmbedEditorSelection } from '../embedEditor.js';
export const embededit: Command = { data:new SlashCommandBuilder().setName('embededit').setDescription('Select an embed by name and edit it visually').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});await i.editReply(buildEmbedEditorSelection(i.guild.id));} };