import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const pro: Command = {
  data: new SlashCommandBuilder()
    .setName('pro')
    .setDescription('Check how pro someone is 🎮')
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🟩'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00CC44)
        .setTitle('🎮 Pro Meter')
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**${target.username}** is **${pct}% pro**\n\n${bar}`)
        .setTimestamp()],
    });
  },
};
