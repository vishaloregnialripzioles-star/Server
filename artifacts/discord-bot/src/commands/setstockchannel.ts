import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const setstockchannel: Command = {
  data: new SlashCommandBuilder()
    .setName('setstockchannel')
    .setDescription('Set the channel used for automatic Blox Fruits stock updates')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o
      .setName('channel')
      .setDescription('Text channel where stock updates will be posted')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)),
  async execute(i: ChatInputCommandInteraction) {
    if (!i.guildId) {
      await i.reply({ content: '❌ This command only works in a server.', ephemeral: true });
      return;
    }
    const channel = i.options.getChannel('channel', true);
    updateGuild(i.guildId, d => {
      d.config.bloxStock = { ...(d.config.bloxStock ?? { enabled: false }), channelId: channel.id };
    });
    const current = loadGuild(i.guildId).config.bloxStock;
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📡 Stock Channel Saved')
      .setDescription(`Blox Fruits stock updates will be posted in <#${channel.id}>.`)
      .addFields({
        name: 'Status',
        value: current?.enabled ? '🟢 Stock tracker is already enabled.' : '🟡 Stock tracker is ready — run **/stock enable**.',
        inline: false,
      })
      .setFooter({ text: 'Sparxie • Blox Fruits Stock' })
      .setTimestamp();
    await i.reply({ embeds: [embed] });
  },
};
