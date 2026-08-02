import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog } from '../utils.js';
import { loadGuild } from '../storage.js';

export const jail: Command = {
  data: new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Manually place a member in a restricted Jail role until released')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('User to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const data = loadGuild(interaction.guild.id);
    if (!data.config.jailRole) {
      await interaction.editReply('❌ No jail role configured. Use `/setup jailrole` first.');
      return;
    }

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }

    if (target.id === interaction.guild.ownerId) {
      await interaction.editReply('❌ The server owner cannot be jailed.');
      return;
    }

    try {
      await member.roles.add(data.config.jailRole, `${reason} | Mod: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0x888888)
        .setTitle('🔒 Member Jailed')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setFooter({ text: 'Use /unjail to release them.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendLog(interaction.guild, embed);
    } catch {
      await interaction.editReply('❌ Failed to jail this user.');
    }
  },
};
