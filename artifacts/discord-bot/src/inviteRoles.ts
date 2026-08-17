import type { Client, Guild, GuildMember } from 'discord.js';
import { loadGuild } from './storage.js';

const inviteUses = new Map<string, Map<string, number>>();

async function snapshotGuild(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const invite of invites.values()) map.set(invite.code, invite.uses ?? 0);
    inviteUses.set(guild.id, map);
  } catch {
    // Missing Manage Guild permission or invite access; leave the previous snapshot.
  }
}

export async function primeInviteCache(client: Client<true>): Promise<void> {
  await Promise.all(client.guilds.cache.map(guild => snapshotGuild(guild)));
}

export async function handleInviteRole(member: GuildMember): Promise<void> {
  const data = loadGuild(member.guild.id);
  const mappings = data.config.inviteRoles ?? {};
  if (!Object.keys(mappings).length) return;

  try {
    const invites = await member.guild.invites.fetch();
    const previous = inviteUses.get(member.guild.id) ?? new Map<string, number>();
    let usedBy: string | undefined;
    let usedCode: string | undefined;
    let usedNow = 0;

    for (const invite of invites.values()) {
      const oldUses = previous.get(invite.code) ?? 0;
      const currentUses = invite.uses ?? 0;
      if (currentUses > oldUses) {
        usedBy = invite.inviter?.id;
        usedCode = invite.code;
        usedNow = currentUses;
        break;
      }
    }

    const current = new Map<string, number>();
    for (const invite of invites.values()) current.set(invite.code, invite.uses ?? 0);
    inviteUses.set(member.guild.id, current);

    if (!usedBy || !usedCode) return;

    // The invite count is the number of uses by the inviter. Remove lower
    // invite reward roles first, then grant every configured threshold reached.
    const inviter = await member.guild.members.fetch(usedBy).catch(() => null);
    if (!inviter) return;

    const thresholds = Object.entries(mappings)
      .map(([count, roleId]) => [Number(count), roleId] as const)
      .filter(([count, roleId]) => Number.isInteger(count) && count > 0 && /^\d+$/.test(roleId))
      .sort((a, b) => a[0] - b[0]);

    const reached = thresholds.filter(([count]) => usedNow >= count);
    for (const [, roleId] of reached) await inviter.roles.add(roleId).catch(() => undefined);
  } catch (err) {
    console.error('[inviteRoles]', err);
  }
}
