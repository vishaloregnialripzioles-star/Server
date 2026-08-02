import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog, ensureChatBanRole } from '../utils.js';

export const chatban: Command = {
  data: new SlashCommandBuilder()
    .setName('chatban')
    .setDescription('Block a member from sending messages in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('User to chat-ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (target.bot) {
      await interaction.editReply('❌ You cannot chat-ban a bot.');
      return;
    }

    if (target.id === interaction.guild.ownerId) {
      await interaction.editReply('❌ The server owner cannot be chat-banned.');
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ That user is not in this server.');
      return;
    }

    // Auto-creates the Chat Banned role + channel overwrites if needed
    const role = await ensureChatBanRole(interaction.guild);
    await member.roles.add(role, `${reason} | Mod: ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('💬❌ Member Chat-Banned')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.guild, embed);
  },
};
