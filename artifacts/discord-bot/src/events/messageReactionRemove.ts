import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { loadGuild } from '../storage.js';

function reactionKey(reaction: MessageReaction | PartialMessageReaction): string { return reaction.emoji.id ?? reaction.emoji.name ?? ''; }

export async function handleMessageReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  if (user.bot) return;
  if (reaction.partial) { try { reaction = await reaction.fetch(); } catch { return; } }
  if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }
  const message = reaction.message;
  if (!message.guild) return;
  const roleId = loadGuild(message.guild.id).config.reactionRoles?.[message.id]?.[reactionKey(reaction)];
  if (!roleId) return;
  try {
    const role = await message.guild.roles.fetch(roleId);
    const member = await message.guild.members.fetch(user.id);
    if (role && member && member.roles.cache.has(role.id)) await member.roles.remove(role, 'Sparxie Reaction Role');
  } catch (err) { console.error('[reactionRole] Failed to remove role:', err); }
}
