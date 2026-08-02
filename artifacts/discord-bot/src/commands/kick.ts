import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog } from '../utils.js';

export const kick: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remove a member from the server without banning them')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ That user is not in this server.');
      return;
    }
    if (!member.kickable) {
      await interaction.editReply('❌ I cannot kick this user.');
      return;
    }

    try {
      await member.kick(`${reason} | Mod: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0xFF8800)
        .setTitle('👢 Member Kicked')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendLog(interaction.guild, embed);
    } catch {
      await interaction.editReply('❌ Failed to kick this user.');
    }
  },
};
