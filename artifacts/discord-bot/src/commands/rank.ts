import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { levelFromXp, xpToNextLevel } from '../utils.js';

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your current level and XP ranking')
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const data = loadGuild(interaction.guild.id);

    const levelEntry = data.levels[target.id] ?? { xp: 0, level: 0, lastMessage: 0 };
    const { xp, level } = levelEntry;
    const nextLevelXp = xpToNextLevel(level);

    // Calculate server rank
    const sorted = Object.entries(data.levels)
      .sort(([, a], [, b]) => b.xp - a.xp);
    const rank = sorted.findIndex(([id]) => id === target.id) + 1;
    const rankStr = rank > 0 ? `#${rank} of ${sorted.length}` : 'Unranked';

    // XP bar (10 segments)
    const progress = Math.min(xp / nextLevelXp, 1);
    const filled = Math.round(progress * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`📈 ${target.username}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '🏅 Level', value: `${level}`, inline: true },
        { name: '✨ Total XP', value: xp.toLocaleString(), inline: true },
        { name: '🏆 Server Rank', value: rankStr, inline: true },
        {
          name: `Progress to Level ${level + 1}`,
          value: `\`${bar}\` ${xp.toLocaleString()} / ${Math.round(nextLevelXp).toLocaleString()} XP`,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
