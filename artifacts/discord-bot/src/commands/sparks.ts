import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';

const MEDALS = ['🥇','🥈','🥉'];

export const coinLeaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('coinleaderboard')
    .setDescription('Show the ⚡ sparks leaderboard')
    .addIntegerOption(o => o.setName('top').setDescription('How many members to show').setMinValue(3).setMaxValue(25)),
  async execute(interaction) {
    if (!interaction.guild) return;
    const data = loadGuild(interaction.guild.id);
    const limit = interaction.options.getInteger('top') ?? 10;
    const entries = Object.entries(data.sparks)
      .map(([userId, sparks]) => ({ userId, sparks }))
      .sort((a,b) => b.sparks - a.sparks)
      .slice(0, limit);
    if (!entries.length) {
      await interaction.reply('📭 No ⚡ sparks yet. Win a game to earn some!');
      return;
    }
    const rows = entries.map((e,i) => `${MEDALS[i] ?? `**#${i+1}**`} <@${e.userId}> — **⚡ ${e.sparks.toLocaleString()} sparks**`);
    const all = Object.entries(data.sparks).sort(([,a],[,b]) => b-a);
    const rank = all.findIndex(([id]) => id === interaction.user.id) + 1;
    const mine = data.sparks[interaction.user.id] ?? 0;
    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`⚡ ${interaction.guild.name} — Sparks Leaderboard`)
      .setDescription(rows.join('\n'))
      .setFooter({ text:`Your rank: #${rank || '—'} · ⚡ ${mine.toLocaleString()} sparks` })
      .setTimestamp();
    await interaction.reply({ embeds:[embed] });
  },
};
