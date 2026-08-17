import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export const warnsLeaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('warns-leaderboard')
    .setDescription('Show the members with the most warnings')
    .addIntegerOption(o => o.setName('top').setDescription('How many members to show (default 10, max 25)').setMinValue(3).setMaxValue(25)),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();
    const limit = interaction.options.getInteger('top') ?? 10;
    const data = loadGuild(interaction.guild.id);

    const entries = Object.entries(data.warnings)
      .map(([userId, warnings]) => ({ userId, count: warnings.length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    if (!entries.length) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFCC00).setTitle('⚠️ Warns Leaderboard').setDescription('No warnings have been recorded in this server yet.').setTimestamp()] });
      return;
    }

    const members = await interaction.guild.members.fetch({ user: entries.map(x => x.userId) }).catch(() => null);
    const rows = entries.map((entry, i) => {
      const medal = MEDALS[i] ?? `**#${i + 1}**`;
      const member = members?.get(entry.userId);
      const name = member ? `${member}` : `<@${entry.userId}>`;
      return `${medal} ${name} — **${entry.count}** warning${entry.count === 1 ? '' : 's'}`;
    });

    const total = Object.values(data.warnings).reduce((sum, list) => sum + list.length, 0);
    const embed = new EmbedBuilder()
      .setColor(0xFFCC00)
      .setTitle(`⚠️ ${interaction.guild.name} — Warns Leaderboard`)
      .setDescription(rows.join('\n'))
      .addFields({ name: 'Total Warnings', value: `${total}`, inline: true }, { name: 'Members Warned', value: `${Object.values(data.warnings).filter(x => x.length > 0).length}`, inline: true })
      .setTimestamp()
      .setFooter({ text: 'Ranked by total recorded warnings' });

    await interaction.editReply({ embeds: [embed] });
  },
};
