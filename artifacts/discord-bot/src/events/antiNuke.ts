import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import { loadGuild } from '../storage.js';
import { isAntiNukeTrusted } from '../security.js';

const PROTECTED_ACTIONS = new Set<AuditLogEvent>([
  AuditLogEvent.BotAdd,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.RoleUpdate,
]);

async function punish(guild: Guild, executorId: string, reason: string, targetId?: string | null): Promise<void> {
  if (isAntiNukeTrusted(guild, executorId)) return;

  try {
    await guild.members.ban(executorId, { reason: `Anti-nuke: ${reason}` });
    console.log(`[anti-nuke] Banned ${executorId} in ${guild.id}: ${reason}`);
  } catch (err) {
    console.error(`[anti-nuke] Could not ban executor ${executorId} in ${guild.id}:`, err);
  }

  if (targetId && reason === 'unauthorized bot added') {
    const botMember = await guild.members.fetch(targetId).catch(() => null);
    if (botMember?.user.bot) {
      await botMember.kick('Anti-nuke: unauthorized bot added').catch(() => undefined);
    }
  }
}

export async function handleAntiNukeAudit(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  const data = loadGuild(guild.id);
  if (!data.antiNuke.enabled) return;
  if (!PROTECTED_ACTIONS.has(entry.action as AuditLogEvent)) return;

  const executorId = entry.executorId;
  if (!executorId || executorId === guild.client.user?.id) return;

  switch (entry.action) {
    case AuditLogEvent.BotAdd:
      await punish(guild, executorId, 'unauthorized bot added', entry.targetId);
      break;
    case AuditLogEvent.MemberRoleUpdate:
      await punish(guild, executorId, 'unauthorized member role change', entry.targetId);
      break;
    case AuditLogEvent.RoleCreate:
      await punish(guild, executorId, 'unauthorized role created', entry.targetId);
      break;
    case AuditLogEvent.RoleDelete:
      await punish(guild, executorId, 'unauthorized role deleted', entry.targetId);
      break;
    case AuditLogEvent.RoleUpdate:
      await punish(guild, executorId, 'unauthorized role changed', entry.targetId);
      break;
  }
}
