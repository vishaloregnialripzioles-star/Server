import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const roleconnection: Command = {
  data: new SlashCommandBuilder().setName('roleconnection').setDescription('Configure role-connection guidance for your server').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('set').setDescription('Set the role connection channel, role and message').addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Instructions shown to members').setMaxLength(2000).setRequired(true)))
    .addSubcommand(s=>s.setName('enable').setDescription('Enable role connections')).addSubcommand(s=>s.setName('disable').setDescription('Disable role connections')).addSubcommand(s=>s.setName('view').setDescription('View configuration')),
  async execute(interaction){
    if(!interaction.guild)return; const sub=interaction.options.getSubcommand();
    if(sub==='set'){const channel=interaction.options.getChannel('channel',true),role=interaction.options.getRole('role',true),message=interaction.options.getString('message',true);updateGuild(interaction.guild.id,d=>{d.config.roleConnections={enabled:true,channelId:channel.id,roleId:role.id,message};});await interaction.reply({content:`Role Connections configured for ${role} in ${channel}.`,ephemeral:true});return;}
    if(sub==='enable'||sub==='disable'){updateGuild(interaction.guild.id,d=>{d.config.roleConnections ??= {enabled:false,message:'Connect your account to receive the role.'};d.config.roleConnections.enabled=sub==='enable';});await interaction.reply({content:sub==='enable'?'Role Connections enabled.':'Role Connections disabled.',ephemeral:true});return;}
    const x=loadGuild(interaction.guild.id).config.roleConnections;await interaction.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('Role Connections').setDescription(x?.roleId?`${x.enabled?'Enabled':'Disabled'} — <@&${x.roleId}> in <#${x.channelId}>`:'Not configured.').setTimestamp()]});
  },
};
