import type { Guild, GuildMember } from 'discord.js';
import { loadGuild } from './storage.js';

export function isExtraOwner(guild: Guild, userId: string): boolean {
  return loadGuild(guild.id).extraOwners.includes(userId);
}

export function isOwnerOrExtraOwner(guild: Guild, userId: string): boolean {
  return guild.ownerId === userId || isExtraOwner(guild, userId);
}

export function isAntiNukeTrusted(guild: Guild, userId: string): boolean {
  return guild.ownerId === userId || userId === guild.client.user?.id || isExtraOwner(guild, userId) || loadGuild(guild.id).antiNuke.whitelist.includes(userId);
}

export function canManageExtraOwner(guild: Guild, userId: string): boolean {
  return guild.ownerId === userId;
}

export function hasGuildManageAccess(member: GuildMember): boolean {
  return member.permissions.has('ManageGuild') || member.permissions.has('Administrator');
}
