import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { levelFromXp } from '../utils.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top members by XP and level')
    .addIntegerOption(o =>
      o.setName('top')
        .setDescription('How many members to show (default 10, max 25)')
        .setMinValue(3)
        .setMaxValue(25),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const limit = interaction.options.getInteger('top') ?? 10;
    const data = loadGuild(interaction.guild.id);

    const entries = Object.entries(data.levels)
      .map(([userId, entry]) => ({
        userId,
        xp: entry.xp,
        level: levelFromXp(entry.xp),
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);

    if (entries.length === 0) {
      await interaction.editReply('📭 No leveling data yet — members earn XP by chatting!');
      return;
    }

    // Resolve display names for all entries in one batch
    const memberIds = entries.map(e => e.userId);
    const members = await interaction.guild.members
      .fetch({ user: memberIds })
      .catch(() => null);

    const rows = entries.map((entry, i) => {
      const position = i + 1;
      const medal = MEDALS[i] ?? `**#${position}**`;
      const member = members?.get(entry.userId);
      const name = member?.displayName ?? `<@${entry.userId}>`;
      const xpFormatted = entry.xp.toLocaleString();
      return `${medal} ${name} — Level **${entry.level}** · ${xpFormatted} XP`;
    });

    // Find the requesting user's rank
    const allSorted = Object.entries(data.levels).sort(([, a], [, b]) => b.xp - a.xp);
    const myRank = allSorted.findIndex(([id]) => id === interaction.user.id) + 1;
    const myEntry = data.levels[interaction.user.id];
    const myFooter = myRank > 0 && myEntry
      ? `Your rank: #${myRank} of ${allSorted.length} — Level ${levelFromXp(myEntry.xp)} · ${myEntry.xp.toLocaleString()} XP`
      : undefined;

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`🏆 ${interaction.guild.name} — Leaderboard`)
      .setDescription(rows.join('\n'))
      .setTimestamp();

    if (myFooter) embed.setFooter({ text: myFooter });

    await interaction.editReply({ embeds: [embed] });
  },
};
