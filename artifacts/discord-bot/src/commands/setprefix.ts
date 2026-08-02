import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export const setprefix: Command = {
  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Change the bot prefix for this server (default: .)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('prefix')
        .setDescription('New prefix (max 5 characters)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(5),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;

    const newPrefix = interaction.options.getString('prefix', true);

    updateGuild(interaction.guild.id, d => {
      d.config.prefix = newPrefix;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✅ Prefix Updated')
      .addFields(
        { name: 'New Prefix', value: `\`${newPrefix}\``, inline: true },
        { name: 'Example', value: `\`${newPrefix}roast\`, \`${newPrefix}setprefix\``, inline: true },
      )
      .setFooter({ text: `Changed by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
