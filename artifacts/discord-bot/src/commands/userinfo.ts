import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { levelFromXp } from '../utils.js';

export const userinfo: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show detailed information about a member')
    .addUserOption(o => o.setName('user').setDescription('User to look up (defaults to you)')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const data = loadGuild(interaction.guild.id);

    const levelEntry = data.levels[target.id];
    const xp = levelEntry?.xp ?? 0;
    const level = levelEntry?.level ?? 0;
    const warnCount = (data.warnings[target.id] ?? []).length;

    const roles = member
      ? [...member.roles.cache.values()]
          .filter(r => r.id !== interaction.guild!.id)
          .sort((a, b) => b.position - a.position)
          .slice(0, 10)
          .map(r => `<@&${r.id}>`)
          .join(' ') || 'None'
      : 'N/A';

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor ?? 0x5865F2)
      .setTitle(`👤 ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 User ID', value: target.id, inline: true },
        { name: '🤖 Bot', value: target.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true },
        ...(member ? [
          { name: '📥 Joined Server', value: `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:D>`, inline: true },
          { name: '🎨 Display Name', value: member.displayName, inline: true },
          { name: '📈 Level', value: `${level} (${xp.toLocaleString()} XP)`, inline: true },
          { name: '⚠️ Warnings', value: `${warnCount}`, inline: true },
          { name: `🎭 Roles [${member.roles.cache.size - 1}]`, value: roles },
        ] : []),
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
