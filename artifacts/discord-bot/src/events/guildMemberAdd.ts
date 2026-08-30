import { EmbedBuilder, type GuildMember, type TextChannel } from 'discord.js';
import { loadGuild } from '../storage.js';
import { resolveWelcomeSend } from '../welcomeUtils.js';
import { handleInviteRole } from '../inviteRoles.js';

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const inviteResult = await handleInviteRole(member);
  const data = loadGuild(member.guild.id);

  const joinRole = data.config.joinRole;
  if (joinRole?.enabled && joinRole.roleId) {
    try {
      const role = await member.guild.roles.fetch(joinRole.roleId);
      if (role) await member.roles.add(role, 'Sparxie Join Role');
    } catch (err) { console.error('[guildMemberAdd] Failed to assign join role:', err); }
  }

  // Invite notification goes to the configured moderation/log channel.
  if (inviteResult) {
    const logChannelId = data.config.logging?.channelId || data.config.logChannel;
    if (logChannelId) {
      const channel = member.guild.channels.cache.get(logChannelId) as TextChannel | undefined;
      if (channel?.isTextBased()) {
        try {
          const inviter = await member.guild.members.fetch(inviteResult.inviterId).catch(() => null);
          const inviterName = inviter?.user.username || 'Unknown inviter';
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: `${member.guild.name} • Invite Tracker`, iconURL: member.guild.iconURL() || undefined })
            .setTitle('📨 Member Invited')
            .setDescription(`**${member}** joined the server and was invited by **${inviter ? inviter : `<@${inviteResult.inviterId}>`}**.`)
            .addFields(
              { name: '👤 New Member', value: `${member}\n\`${member.id}\``, inline: true },
              { name: '🤝 Invited By', value: `${inviter ? inviter : `<@${inviteResult.inviterId}>`}\n\`${inviteResult.inviterId}\``, inline: true },
              { name: '📈 Total Invites', value: `**${inviteResult.inviteCount}**`, inline: true },
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: 'Invite tracking • Valid invite counted' })
            .setTimestamp();
          await channel.send({ embeds: [embed] });
        } catch (err) { console.error('[guildMemberAdd] Failed to send invite notification:', err); }
      }
    }
  }

  const w = data.welcome;
  if (!w?.enabled || !w.channelId) return;
  const channel = member.guild.channels.cache.get(w.channelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;
  try { const { content, embeds } = resolveWelcomeSend(w, member, data.savedEmbeds ?? {}); await channel.send({ content, embeds }); }
  catch (err) { console.error('[guildMemberAdd] Failed to send welcome message:', err); }
}
