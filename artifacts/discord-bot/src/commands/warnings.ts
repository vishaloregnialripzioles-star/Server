import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { formatTimestamp } from '../utils.js';

export const warnings: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warning history for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to look up').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return;

    const target = interaction.options.getUser('user', true);
    const data = loadGuild(interaction.guild.id);
    const userWarnings = data.warnings[target.id] ?? [];

    const embed = new EmbedBuilder()
      .setColor(0xFFCC00)
      .setTitle(`⚠️ Warnings — ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        userWarnings.length === 0
          ? '✅ No warnings on record.'
          : userWarnings
              .slice(-10) // show last 10
              .map((w, i) =>
                `**#${i + 1}** \`${w.id}\`\n> Reason: ${w.reason}\n> Mod: <@${w.moderatorId}> • ${formatTimestamp(w.timestamp)}`,
              )
              .join('\n\n'),
      )
      .setFooter({ text: `Total: ${userWarnings.length} warning(s)` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
