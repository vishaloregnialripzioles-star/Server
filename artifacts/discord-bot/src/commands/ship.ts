import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const ship: Command = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Ship two users together 💕')
    .addUserOption(o => o.setName('user1').setDescription('First user').setRequired(true))
    .addUserOption(o => o.setName('user2').setDescription('Second user (defaults to you)')),

  async execute(interaction) {
    const user1 = interaction.options.getUser('user1', true);
    const user2 = interaction.options.getUser('user2') ?? interaction.user;
    const pct = Math.floor(Math.random() * 101);
    const hearts = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
    const label =
      pct >= 90 ? 'Perfect match! 💍' :
      pct >= 70 ? 'Great chemistry! 💕' :
      pct >= 50 ? 'Pretty good! 🥰' :
      pct >= 30 ? 'Needs work... 😬' : 'Not meant to be 💔';
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('💕 Ship Meter')
        .setDescription(
          `**${user1.username}** ❤️ **${user2.username}**\n\n` +
          `Compatibility: **${pct}%**\n${hearts}\n\n*${label}*`,
        )
        .setTimestamp()],
    });
  },
};
