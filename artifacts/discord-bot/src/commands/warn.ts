import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog, generateId } from '../utils.js';
import { updateGuild } from '../storage.js';

export const warn: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member and record it')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (target.bot) {
      await interaction.editReply('❌ You cannot warn a bot.');
      return;
    }

    const warnId = generateId();
    const warning = {
      id: warnId,
      moderatorId: interaction.user.id,
      reason,
      timestamp: Date.now(),
    };

    let totalWarnings = 0;
    updateGuild(interaction.guild.id, data => {
      if (!data.warnings[target.id]) data.warnings[target.id] = [];
      data.warnings[target.id].push(warning);
      totalWarnings = data.warnings[target.id].length;
    });

    const embed = new EmbedBuilder()
      .setColor(0xFFCC00)
      .setTitle('⚠️ Member Warned')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Warning ID', value: `\`${warnId}\``, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Total Warnings', value: `${totalWarnings}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.guild, embed);

    // DM the warned user
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFCC00)
          .setTitle(`⚠️ You received a warning in ${interaction.guild.name}`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: interaction.user.tag },
          )
          .setTimestamp(),
      ],
    }).catch(() => undefined);
  },
};
