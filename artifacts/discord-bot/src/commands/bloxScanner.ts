import { PermissionFlagsBits, SlashCommandBuilder, ChannelType } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild, loadGuild } from '../storage.js';

export const bloxscanner: Command = {
  data: new SlashCommandBuilder()
    .setName('bloxscanner')
    .setDescription('Configure the Blox Fruits W/F/L screenshot scanner')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('enable').setDescription('Enable the scanner in this channel'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the scanner'))
    .addSubcommand(s => s.setName('status').setDescription('Show scanner status'))
    .addSubcommand(s => s.setName('scan').setDescription('Scan your saved trade screenshot now')),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply({ content: '❌ This command only works in a server.', ephemeral: true }); return; }
    const sub = interaction.options.getSubcommand();
    if (sub === 'enable') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ You need **Manage Server**.', ephemeral: true }); return; }
      if (interaction.channel?.type !== ChannelType.GuildText && interaction.channel?.type !== ChannelType.GuildAnnouncement) { await interaction.reply({ content: '❌ Use this command in a text channel.', ephemeral: true }); return; }
      updateGuild(interaction.guildId, g => { g.config.bloxScannerChannelId = interaction.channelId; });
      await interaction.reply(`✅ **Blox W/F/L Scanner enabled** in <#${interaction.channelId}>.\n\nSend a **trade screenshot** here, then send **ss** to scan it.`);
      return;
    }
    if (sub === 'disable') {
      updateGuild(interaction.guildId, g => { g.config.bloxScannerChannelId = undefined; g.config.bloxScannerScreenshots = undefined; });
      await interaction.reply('✅ Blox W/F/L Scanner disabled.');
      return;
    }
    if (sub === 'status') {
      const g = loadGuild(interaction.guildId);
      const channel = g.config.bloxScannerChannelId ? `<#${g.config.bloxScannerChannelId}>` : '`Not configured`';
      await interaction.reply(`📊 **Blox W/F/L Scanner**\nStatus: ${g.config.bloxScannerChannelId ? '🟢 Enabled' : '🔴 Disabled'}\nChannel: ${channel}`);
      return;
    }
    await interaction.reply('📸 Send a trade screenshot in the configured scanner channel first, then send **ss**.');
  },
};
