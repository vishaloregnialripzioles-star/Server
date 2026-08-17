import type { GuildMember, TextChannel } from 'discord.js';
import { loadGuild } from '../storage.js';
import { resolveWelcomeSend } from '../welcomeUtils.js';
import { handleInviteRole } from '../inviteRoles.js';

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  await handleInviteRole(member);

  const data = loadGuild(member.guild.id);
  const w = data.welcome;

  if (!w?.enabled || !w.channelId) return;

  const channel = member.guild.channels.cache.get(w.channelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  try {
    const { content, embeds } = resolveWelcomeSend(w, member, data.savedEmbeds ?? {});
    await channel.send({ content, embeds });
  } catch (err) {
    console.error('[guildMemberAdd] Failed to send welcome message:', err);
  }
}
