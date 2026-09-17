import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import { loadGuild } from '../storage.js';
import { isAntiNukeTrusted } from '../security.js';
import type { AntiNukeLimit } from '../types.js';

const counters = new Map<string, number[]>();
const ACTIONS: Record<number, keyof ReturnType<typeof loadGuild>['antiNuke']['limits'] | 'bot_add'> = {
  [AuditLogEvent.ChannelDelete]:'channel_delete', [AuditLogEvent.ChannelCreate]:'channel_create',
  [AuditLogEvent.RoleDelete]:'role_delete', [AuditLogEvent.RoleCreate]:'role_create',
  [AuditLogEvent.MemberBanAdd]:'member_ban', [AuditLogEvent.MemberKick]:'member_kick',
  [AuditLogEvent.WebhookCreate]:'webhook_create', [AuditLogEvent.WebhookDelete]:'webhook_delete',
  [AuditLogEvent.ChannelUpdate]:'permission_update', [AuditLogEvent.RoleUpdate]:'permission_update',
  [AuditLogEvent.BotAdd]:'bot_add',
};

function hit(key: string, limit: AntiNukeLimit): number {
  const now = Date.now(); const arr = (counters.get(key) ?? []).filter(t => now - t < limit.windowSeconds * 1000); arr.push(now); counters.set(key, arr); return arr.length;
}
async function log(guild: Guild, title: string, description: string, color: number, fields: {name:string,value:string,inline?:boolean}[] = []): Promise<void> {
  const id = loadGuild(guild.id).antiNuke.logChannelId; const channel = id ? await guild.channels.fetch(id).catch(() => null) : null;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).addFields(fields).setFooter({text:'Sparxie • Anti-Nuke Security'}).setTimestamp();
  if (channel?.isTextBased()) await channel.send({embeds:[embed]}).catch(() => undefined); else console.warn(`[AntiNuke] ${title}: ${description}`);
}
async function stripDangerousRoles(guild: Guild, executorId: string): Promise<string[]> {
  const member = await guild.members.fetch(executorId).catch(() => null); if (!member) return [];
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null); if (!me) return [];
  const removed: string[] = [];
  for (const role of [...member.roles.cache.values()]) {
    if (role.id === guild.id || !role.editable || role.position >= me.roles.highest.position) continue;
    if (role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageGuild) || role.permissions.has(PermissionFlagsBits.ManageChannels) || role.permissions.has(PermissionFlagsBits.ManageRoles) || role.permissions.has(PermissionFlagsBits.BanMembers) || role.permissions.has(PermissionFlagsBits.KickMembers) || role.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
      await member.roles.remove(role, 'Anti-Nuke: dangerous permissions removed').catch(() => undefined); removed.push(role.name);
    }
  }
  return removed;
}
async function punish(guild: Guild, executorId: string, action: string, count: number, limit: AntiNukeLimit): Promise<void> {
  const data = loadGuild(guild.id).antiNuke; if (isAntiNukeTrusted(guild, executorId)) { await log(guild,'🛡️ Trusted Security Event',`Trusted executor <@${executorId}> crossed the **${action}** threshold. No punishment was applied.`,0x5865f2,[{name:'Activity',value:`${count} / ${limit.maxCount} in ${limit.windowSeconds}s`,inline:true}]); return; }
  let result = 'No enforcement action completed.';
  if (data.punishment === 'strip') { const removed = await stripDangerousRoles(guild, executorId); result = removed.length ? `Removed: ${removed.map(x => `**${x}**`).join(', ')}` : 'No manageable dangerous roles could be removed.'; }
  if (data.punishment === 'kick') { const member = await guild.members.fetch(executorId).catch(() => null); if (member?.kickable) { await member.kick(`Anti-Nuke: ${action} threshold exceeded`); result = 'Executor kicked.'; } else result = 'Executor could not be kicked due to role hierarchy.'; }
  if (data.punishment === 'ban') { const member = await guild.members.fetch(executorId).catch(() => null); if (member?.bannable) { await member.ban({reason:`Anti-Nuke: ${action} threshold exceeded`}); result = 'Executor banned.'; } else result = 'Executor could not be banned due to role hierarchy.'; }
  await log(guild,'🚨 Anti-Nuke Triggered',`A security threshold was exceeded and enforcement was applied.`,0xed4245,[{name:'Executor',value:`<@${executorId}>`,inline:true},{name:'Action',value:action,inline:true},{name:'Activity',value:`${count} / ${limit.maxCount} in ${limit.windowSeconds}s`,inline:true},{name:'Enforcement',value:`**${data.punishment}** • ${result}`}]);
  const owner = await guild.fetchOwner().catch(() => null); if (owner) await owner.send({embeds:[new EmbedBuilder().setColor(0xed4245).setTitle('🚨 Anti-Nuke Alert').setDescription(`Anti-Nuke triggered in **${guild.name}**.`).addFields({name:'Executor',value:`<@${executorId}>`},{name:'Trigger',value:`${action}: ${count}/${limit.maxCount} in ${limit.windowSeconds}s`},{name:'Enforcement',value:`${data.punishment} • ${result}`}).setTimestamp()]}).catch(() => undefined);
}

export async function handleAntiNukeAudit(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  const data = loadGuild(guild.id); if (!data.antiNuke.enabled) return;
  const action = ACTIONS[entry.action as number]; if (!action) return;
  const executorId = entry.executorId; if (!executorId || executorId === guild.client.user?.id || isAntiNukeTrusted(guild, executorId)) return;
  if (action === 'bot_add') { await punish(guild, executorId, 'unauthorized bot addition', 1, {maxCount:0,windowSeconds:1}); const botId = entry.targetId; if (botId) { const added = await guild.members.fetch(botId).catch(() => null); if (added?.user.bot) await added.kick('Anti-Nuke: unauthorized bot addition').catch(() => undefined); } return; }
  const limit = data.antiNuke.limits[action]; if (!limit) return;
  const count = hit(`${guild.id}:${executorId}:${action}`, limit); if (count >= limit.maxCount) await punish(guild, executorId, action, count, limit);
}
