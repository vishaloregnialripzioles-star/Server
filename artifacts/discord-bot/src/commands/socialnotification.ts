import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const socialnotification: Command = {
  data: new SlashCommandBuilder().setName('socialnotification').setDescription('Configure social notification messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('set').setDescription('Set platform, channel and notification message').addStringOption(o => o.setName('platform').setDescription('YouTube, Twitch, TikTok, etc.').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('Notification channel').setRequired(true)).addStringOption(o => o.setName('message').setDescription('Notification text').setMaxLength(2000).setRequired(true)))
    .addSubcommand(s => s.setName('enable').setDescription('Enable social notifications')).addSubcommand(s => s.setName('disable').setDescription('Disable social notifications')).addSubcommand(s => s.setName('test').setDescription('Send a test notification')),
  async execute(interaction) {
    if (!interaction.guild) return; const sub = interaction.options.getSubcommand();
    if (sub === 'set') { const platform=interaction.options.getString('platform',true), channel=interaction.options.getChannel('channel',true), message=interaction.options.getString('message',true); updateGuild(interaction.guild.id,d=>{d.config.socialNotifications={enabled:true,platform,channelId:channel.id,message};}); await interaction.reply({content:`Social Notifications configured for **${platform}** in ${channel}.`,ephemeral:true}); return; }
    if (sub === 'enable' || sub === 'disable') { updateGuild(interaction.guild.id,d=>{d.config.socialNotifications ??= {enabled:false,platform:'YouTube',message:'New {platform} notification!'}; d.config.socialNotifications.enabled=sub==='enable';}); await interaction.reply({content:sub==='enable'?'Social Notifications enabled.':'Social Notifications disabled.',ephemeral:true}); return; }
    const x=loadGuild(interaction.guild.id).config.socialNotifications; if(!x?.channelId){await interaction.reply({content:'Configure Social Notifications first.',ephemeral:true});return;} const channel=await interaction.guild.channels.fetch(x.channelId).catch(()=>null); if(!channel?.isTextBased()){await interaction.reply({content:'The configured notification channel is unavailable.',ephemeral:true});return;} const text=(x.message||'New {platform} notification!').replaceAll('{platform}',x.platform||'Social'); await (channel as TextChannel).send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(`${x.platform||'Social'} Notification`).setDescription(text).setTimestamp()]}); await interaction.reply({content:'Test notification sent.',ephemeral:true});
  },
};
