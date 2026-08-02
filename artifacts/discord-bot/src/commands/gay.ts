import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const gay: Command = {
  data: new SlashCommandBuilder()
    .setName('gay')
    .setDescription('Check how gay someone is 🌈')
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🌈'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🌈 Gay Meter')
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**${target.username}** is **${pct}% gay**\n\n${bar}`)
        .setTimestamp()],
    });
  },
};
