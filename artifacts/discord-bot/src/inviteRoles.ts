import type { Client, Guild, GuildMember } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';

const inviteUses = new Map<string, Map<string, number>>();
const invitedBy = new Map<string, Map<string, string>>();

async function snapshotGuild(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const invite of invites.values()) map.set(invite.code, invite.uses ?? 0);
    inviteUses.set(guild.id, map);
  } catch (error) { console.error(`[inviteRoles] Could not snapshot invites for ${guild.id}:`, error); }
}

export async function primeInviteCache(client: Client<true>): Promise<void> { await Promise.all(client.guilds.cache.map(snapshotGuild)); }

async function syncRoles(member: GuildMember, count: number): Promise<void> {
  const mappings = loadGuild(member.guild.id).config.inviteRoles ?? {};
  const thresholds = Object.entries(mappings).map(([n, id]) => [Number(n), id] as const)
    .filter(([n, id]) => Number.isInteger(n) && n > 0 && /^\d+$/.test(String(id)))
    .sort((a, b) => a[0] - b[0]);
  for (const [threshold, roleId] of thresholds) {
    try {
      if (count >= threshold) await member.roles.add(roleId, `Auto invite role: ${count} valid invites reached ${threshold}`);
      else await member.roles.remove(roleId, `Auto invite role: below ${threshold} valid invites`);
    } catch (error) { console.error(`[inviteRoles] Failed to sync role ${roleId} for ${member.id}:`, error); }
  }
}

export async function handleInviteRole(member: GuildMember): Promise<void> {
  try {
    const invites = await member.guild.invites.fetch();
    const previous = inviteUses.get(member.guild.id) ?? new Map<string, number>();
    let usedBy: string | undefined;
    for (const invite of invites.values()) {
      if ((invite.uses ?? 0) > (previous.get(invite.code) ?? 0)) { usedBy = invite.inviter?.id; break; }
    }
    const current = new Map<string, number>();
    for (const invite of invites.values()) current.set(invite.code, invite.uses ?? 0);
    inviteUses.set(member.guild.id, current);
    if (!usedBy) return;

    const guildMembers = invitedBy.get(member.guild.id) ?? new Map<string, string>();
    guildMembers.set(member.id, usedBy);
    invitedBy.set(member.guild.id, guildMembers);
    updateGuild(member.guild.id, data => { data.invites ??= {}; data.invites[usedBy!] = (data.invites[usedBy!] ?? 0) + 1; });

    const inviter = await member.guild.members.fetch(usedBy).catch(() => null);
    if (inviter) await syncRoles(inviter, loadGuild(member.guild.id).invites?.[usedBy] ?? 0);
  } catch (error) { console.error('[inviteRoles] Join tracking failed:', error); }
}

export async function handleInviteMemberLeave(member: GuildMember): Promise<void> {
  try {
    const guildMap = invitedBy.get(member.guild.id);
    const inviterId = guildMap?.get(member.id);
    if (!inviterId) return;
    guildMap?.delete(member.id);
    const current = Math.max(0, loadGuild(member.guild.id).invites?.[inviterId] ?? 0);
    const next = Math.max(0, current - 1);
    updateGuild(member.guild.id, data => { data.invites ??= {}; data.invites[inviterId] = next; });
    const inviter = await member.guild.members.fetch(inviterId).catch(() => null);
    if (inviter) await syncRoles(inviter, next);
  } catch (error) { console.error('[inviteRoles] Leave tracking failed:', error); }
}

export async function getInviteCount(guildId: string, userId: string): Promise<number> { return loadGuild(guildId).invites?.[userId] ?? 0; }
