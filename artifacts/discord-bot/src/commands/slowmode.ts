import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import type { GuildTextBasedChannel } from 'discord.js';

export const slowmode: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set or disable slowmode in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o =>
      o.setName('seconds')
        .setDescription('Slowmode delay in seconds (0 = disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply();

    const seconds = interaction.options.getInteger('seconds', true);
    const channel = interaction.channel as GuildTextBasedChannel;

    try {
      await (channel as { setRateLimitPerUser(s: number): Promise<unknown> }).setRateLimitPerUser(seconds);

      const description = seconds === 0
        ? '🔵 Slowmode disabled.'
        : `🐌 Slowmode set to **${seconds} second(s)**.`;

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(seconds === 0 ? 0x00CC44 : 0xFFAA00)
            .setTitle('⏱️ Slowmode Updated')
            .setDescription(description)
            .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true })
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to update slowmode.');
    }
  },
};
