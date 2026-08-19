import type { Client, Guild, GuildMember } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';

const inviteUses = new Map<string, Map<string, number>>();

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
  const thresholds = Object.entries(mappings)
    .map(([n, id]) => [Number(n), id] as const)
    .filter(([n, id]) => Number.isInteger(n) && n > 0 && /^\d+$/.test(String(id)))
    .sort((a, b) => a[0] - b[0]);
  for (const [threshold, roleId] of thresholds) {
    try {
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed) continue;
      if (count >= threshold) {
        if (!member.roles.cache.has(roleId)) await member.roles.add(role, `Auto invite role: ${count} valid invites reached ${threshold}`);
      } else if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role, `Auto invite role: below ${threshold} valid invites`);
      }
    } catch (error) { console.error(`[inviteRoles] Failed to sync role ${roleId} for ${member.id}:`, error); }
  }
}

export async function syncAllInviteRoles(guild: Guild): Promise<void> {
  const data = loadGuild(guild.id);
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    await syncRoles(member, data.invites?.[member.id] ?? 0);
  }
}

export async function handleInviteRole(member: GuildMember): Promise<void> {
  try {
    // Bot accounts and joins without a real inviter never count as valid invites.
    if (member.user.bot) return;
    const invites = await member.guild.invites.fetch();
    const previous = inviteUses.get(member.guild.id);
    const current = new Map<string, number>();
    for (const invite of invites.values()) current.set(invite.code, invite.uses ?? 0);
    inviteUses.set(member.guild.id, current);
    if (!previous) return;

    let best: { inviterId: string; delta: number } | undefined;
    for (const invite of invites.values()) {
      const oldUses = previous.get(invite.code) ?? 0;
      const newUses = invite.uses ?? 0;
      const delta = newUses - oldUses;
      const inviterId = invite.inviter?.id;
      if (delta <= 0 || !inviterId || inviterId === member.id) continue;
      const inviter = member.guild.members.cache.get(inviterId);
      if (inviter?.user.bot) continue;
      if (!best || delta > best.delta) best = { inviterId, delta };
    }
    if (!best) return;

    updateGuild(member.guild.id, data => {
      data.invites ??= {};
      data.inviteSources ??= {};
      // Prevent double-counting the same member if Discord delivers duplicate join events.
      if (data.inviteSources[member.id]) return;
      data.inviteSources[member.id] = best!.inviterId;
      data.invites[best!.inviterId] = (data.invites[best!.inviterId] ?? 0) + 1;
    });

    const inviter = await member.guild.members.fetch(best.inviterId).catch(() => null);
    if (inviter) await syncRoles(inviter, loadGuild(member.guild.id).invites?.[best.inviterId] ?? 0);
  } catch (error) { console.error('[inviteRoles] Join tracking failed:', error); }
}

export async function handleInviteMemberLeave(member: GuildMember): Promise<void> {
  try {
    const data = loadGuild(member.guild.id);
    const inviterId = data.inviteSources?.[member.id];
    if (!inviterId) return;
    updateGuild(member.guild.id, current => {
      current.inviteSources ??= {};
      current.invites ??= {};
      delete current.inviteSources[member.id];
      current.invites[inviterId] = Math.max(0, (current.invites[inviterId] ?? 0) - 1);
    });
    const inviter = await member.guild.members.fetch(inviterId).catch(() => null);
    if (inviter) await syncRoles(inviter, loadGuild(member.guild.id).invites?.[inviterId] ?? 0);
  } catch (error) { console.error('[inviteRoles] Leave tracking failed:', error); }
}

export async function getInviteCount(guildId: string, userId: string): Promise<number> { return loadGuild(guildId).invites?.[userId] ?? 0; }
