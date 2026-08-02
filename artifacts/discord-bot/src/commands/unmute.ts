import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog } from '../utils.js';
import { loadGuild } from '../storage.js';

export const unmute: Command = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove the mute from a member (removes timeout and mute role)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }

    const auditReason = `${reason} | Mod: ${interaction.user.tag}`;
    const actions: string[] = [];

    // Remove Discord native timeout if active
    if (member.communicationDisabledUntil) {
      await member.timeout(null, auditReason).catch(() => null);
      actions.push('⏱️ Discord timeout removed');
    }

    // Remove mute role if configured and member has it
    const data = loadGuild(interaction.guild.id);
    if (data.config.muteRole && member.roles.cache.has(data.config.muteRole)) {
      await member.roles.remove(data.config.muteRole, auditReason).catch(() => null);
      actions.push('🔇 Mute role removed');
    }

    if (actions.length === 0) {
      await interaction.editReply('ℹ️ This member has no active timeout or mute role to remove.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00CC44)
      .setTitle('🔊 Member Unmuted')
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Actions', value: actions.join('\n') },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    await sendLog(interaction.guild, embed);
  },
};
