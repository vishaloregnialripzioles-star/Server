import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const noob: Command = {
  data: new SlashCommandBuilder()
    .setName('noob')
    .setDescription('Check how noob someone is 💀')
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const pct = Math.floor(Math.random() * 101);
    const bar = '🟥'.repeat(Math.round(pct / 10)) + '⬛'.repeat(10 - Math.round(pct / 10));
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF3333)
        .setTitle('💀 Noob Meter')
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**${target.username}** is **${pct}% noob**\n\n${bar}`)
        .setTimestamp()],
    });
  },
};
