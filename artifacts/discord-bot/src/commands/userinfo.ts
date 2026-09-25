import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
const KEY_PERMISSIONS=[
  ['Administrator',PermissionFlagsBits.Administrator],
  ['Manage Server',PermissionFlagsBits.ManageGuild],
  ['Manage Channels',PermissionFlagsBits.ManageChannels],
  ['Manage Roles',PermissionFlagsBits.ManageRoles],
  ['Manage Messages',PermissionFlagsBits.ManageMessages],
  ['Kick Members',PermissionFlagsBits.KickMembers],
  ['Ban Members',PermissionFlagsBits.BanMembers],
  ['Timeout Members',PermissionFlagsBits.ModerateMembers],
  ['Manage Nicknames',PermissionFlagsBits.ManageNicknames],
  ['Manage Webhooks',PermissionFlagsBits.ManageWebhooks],
  ['View Audit Log',PermissionFlagsBits.ViewAuditLog],
  ['Mention Everyone',PermissionFlagsBits.MentionEveryone],
  ['Manage Threads',PermissionFlagsBits.ManageThreads],
] as const;

function permissionSummary(member:any,guildOwnerId:string):string{
  if(member.id===guildOwnerId)return 'Server Owner';
  const granted=KEY_PERMISSIONS.filter(([,bit])=>member.permissions.has(bit)).map(([name])=>name);
  return granted.length?granted.map(name=>`**${name}**`).join(', '):'No key permissions';
}


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
      : [];
    const roleText = roles.length
      ? roles.slice(0, 12).map(r => `<@&${r.id}>`).join(' ') + (roles.length > 12 ? ` +${roles.length - 12} more` : '')
      : 'None';

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor ?? 0x111827)
      .setAuthor({ name: member?.displayName ?? target.username, iconURL: target.displayAvatarURL({ size: 128 }) })
      .setTitle('User Information')
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Username', value: `@${target.username}`, inline: true },
        { name: 'User ID', value: `\\${target.id}\\`, inline: true },
        { name: 'Account Type', value: target.bot ? 'Bot' : 'User', inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:F>`, inline: true },
        ...(member ? [
          { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown', inline: true },
          { name: 'Highest Role', value: member.roles.highest.id === interaction.guild.id ? '@everyone' : `<@&${member.roles.highest.id}>`, inline: true },
          { name: 'Key Permissions', value: permissionSummary(member, interaction.guild.ownerId), inline: false },
          { name: `Roles (${roles.length})`, value: roleText, inline: false },
          { name: 'Level', value: `${level} • ${xp.toLocaleString()} XP`, inline: true },
          { name: 'Warnings', value: String(warnCount), inline: true },
          { name: 'Server Boost', value: member.premiumSince ? 'Yes' : 'No', inline: true },
          { name: 'Voice', value: member.voice.channelId ? 'Connected' : 'Not in voice', inline: true },
        ] : []),
      )
      .setFooter({ text: `Sparxie • ${interaction.guild.name}` })
      .setTimestamp();

    if (member?.communicationDisabledUntilTimestamp) {
      embed.addFields({ name: 'Timeout Until', value: `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
