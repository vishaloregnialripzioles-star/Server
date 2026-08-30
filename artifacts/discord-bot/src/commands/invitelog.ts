import { PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder, type CommandInteraction, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const invitelog: Command = {
  data: new SlashCommandBuilder()
    .setName('invitelog')
    .setDescription('Configure the separate invite tracker log channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('set').setDescription('Set the invite log channel').addChannelOption(o => o.setName('channel').setDescription('Channel where invite joins will be logged').setRequired(true)))
    .addSubcommand(sub => sub.setName('view').setDescription('View the current invite log channel'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable the separate invite tracker logs')),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ You need **Manage Server** to use this command.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const data = loadGuild(interaction.guild.id);
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased() || channel.isDMBased()) return interaction.reply({ content: '❌ Please choose a text channel.', ephemeral: true });
      const me = interaction.guild.members.me;
      const permissions = me && channel.permissionsFor(me);
      if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) return interaction.reply({ content: '❌ I need **View Channel**, **Send Messages**, and **Embed Links** in that channel.', ephemeral: true });
      updateGuild(interaction.guild.id, current => { current.config.inviteLogChannel = channel.id; });
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('📨 Invite Tracker Enabled').setDescription(`Invite join notifications will now be posted in <#${channel.id}>.`).addFields({ name: 'Configured by', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Channel', value: `<#${channel.id}>`, inline: true }).setTimestamp().setFooter({ text: 'Sparxie • Invite Tracker' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (sub === 'disable') {
      updateGuild(interaction.guild.id, current => { current.config.inviteLogChannel = undefined; });
      return interaction.reply({ content: '✅ Separate invite tracker logs have been disabled.', ephemeral: true });
    }
    const channelId = data.config.inviteLogChannel;
    return interaction.reply({ content: channelId ? `📨 Invite logs are currently sent to <#${channelId}>.` : 'ℹ️ Separate invite logs are currently disabled. Use `/invitelog set` to enable them.', ephemeral: true });
  },
};
