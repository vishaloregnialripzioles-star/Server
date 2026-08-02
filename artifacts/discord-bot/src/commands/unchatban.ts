import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog, ensureChatBanRole } from '../utils.js';

export const unchatban: Command = {
  data: new SlashCommandBuilder()
    .setName('unchatban')
    .setDescription('Remove the chat ban from a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('User to un-chat-ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

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

    // Auto-creates the Chat Banned role if it somehow doesn't exist yet
    const role = await ensureChatBanRole(interaction.guild);
    await member.roles.remove(role, `${reason} | Mod: ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(0x00CC44)
      .setTitle('💬✅ Chat Ban Removed')
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
