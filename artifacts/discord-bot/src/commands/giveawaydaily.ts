import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const giveawayDaily: Command = {
  data: new SlashCommandBuilder()
    .setName('giveawaydaily')
    .setDescription('Configure daily reminders for active giveaways')
    .addSubcommand(s => s.setName('enable').setDescription('Enable daily giveaway reminders'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable daily giveaway reminders'))
    .addSubcommand(s => s.setName('status').setDescription('Show daily reminder settings'))
    .addSubcommand(s => s.setName('channel').setDescription('Set the reminder channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel for reminders').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('message').setDescription('Set the reminder message')
      .addStringOption(o => o.setName('message').setDescription('Reminder text').setRequired(true))),
  async execute(interaction) {
    if (!interaction.guild) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
      return;
    }
    const sub = interaction.options.getSubcommand(true);
    updateGuild(interaction.guild.id, d => {
      const g = d.config.giveawayDaily ?? { enabled: false, message: '🎁 Don’t forget to enter our active giveaway!' };
      if (sub === 'enable') g.enabled = true;
      if (sub === 'disable') g.enabled = false;
      if (sub === 'channel') g.channelId = interaction.options.getChannel('channel', true).id;
      if (sub === 'message') g.message = interaction.options.getString('message', true).slice(0, 1000);
      d.config.giveawayDaily = g;
    });
    const cfg = loadGuild(interaction.guild.id).config.giveawayDaily!;
    if (sub === 'status') {
      await interaction.reply({ content: `🎁 **Giveaway Daily Messages**\nEnabled: **${cfg.enabled ? 'Yes' : 'No'}**\nChannel: ${cfg.channelId ? `<#${cfg.channelId}>` : 'Not set'}\nMessage: ${cfg.message ?? 'Default'}`, flags: 64 });
      return;
    }
    await interaction.reply(`✅ Giveaway daily reminders ${sub === 'disable' ? '**disabled**' : sub === 'enable' ? '**enabled**' : '**updated**'}.`);
  },
};
