import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { postBloxStockNow } from '../bloxStock.js';

export const stockenable: Command = {
  data: new SlashCommandBuilder()
    .setName('stockenable')
    .setDescription('Enable automatic Blox Fruits stock notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(i: ChatInputCommandInteraction) {
    if (!i.guildId) {
      await i.reply({ content: '❌ This command only works in a server.', ephemeral: true });
      return;
    }
    const current = loadGuild(i.guildId).config.bloxStock;
    if (!current?.channelId) {
      await i.reply({ content: '❌ Set a stock channel first with **/setstockchannel**.', ephemeral: true });
      return;
    }
    updateGuild(i.guildId, d => {
      d.config.bloxStock = { ...(d.config.bloxStock ?? { enabled: false }), enabled: true };
    });
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🟢 Stock Tracker Enabled')
      .setDescription(`Automatic stock updates are now active in <#${current.channelId}>.`)
      .addFields(
        { name: 'Refresh check', value: 'Every 60 seconds', inline: true },
        { name: 'Timezone', value: 'Asia/Kolkata (IST)', inline: true },
      )
      .setFooter({ text: 'Sparxie • Blox Fruits Stock' })
      .setTimestamp();
    await i.reply({ embeds: [embed] });
    void postBloxStockNow(i.client, i.guildId);
  },
};
