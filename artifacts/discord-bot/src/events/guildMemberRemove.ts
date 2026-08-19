import type { GuildMember } from 'discord.js';
import { handleInviteMemberLeave } from '../inviteRoles.js';

export async function handleGuildMemberRemove(member: GuildMember): Promise<void> {
  await handleInviteMemberLeave(member);
}
