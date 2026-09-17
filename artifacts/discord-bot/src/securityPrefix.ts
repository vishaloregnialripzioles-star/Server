import { EmbedBuilder, PermissionFlagsBits, type Guild, type Message } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { isOwnerOrExtraOwner } from './security.js';
import { createRecoveryBackup, restoreRecoveryBackup } from './recovery.js';
import { getGuildPrefix } from './prefixHandler.js';
import type { AutoModAction, AutoModRule, AntiNukeAction, AntiNukeConfig, AntiNukeLimit } from './types.js';

const ACCENT = 0x5865f2;
const SUCCESS = 0x57f287;
const WARNING = 0xfee75c;
const DANGER = 0xed4245;

function embed(title: string, description: string, color = ACCENT): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}
function actionName(action: AutoModAction | string): string { return ({ delete: 'Delete', warn: 'Warn', timeout: 'Mute / Timeout', delete_timeout: 'Delete + Mute', dm_warn: 'DM + Warn', kick: 'Kick', ban: 'Ban' } as Record<string,string>)[action] ?? action; }
function parseDuration(value?: string): number | null {
  if (!value) return null;
  const m = /^([0-9]+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const mult = ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string,number>)[m[2].toLowerCase()];
  const ms = n * mult;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
function parseWindow(value?: string): number | null { const ms = parseDuration(value); return ms ? Math.max(1, Math.min(60, Math.round(ms / 1000))) : null; }
function parsePositive(value?: string, max = 1000): number | null { const n = Number(value); return Number.isInteger(n) && n > 0 && n <= max ? n : null; }
function rule(data: any, key: string): AutoModRule { return { windowSeconds: data?.[key]?.windowSeconds ?? 5, maxCount: data?.[key]?.maxCount ?? 5, action: data?.[key]?.action ?? 'delete_timeout' }; }
function applyRule(guildId: string, key: string, enabled: boolean, maxCount?: number, windowSeconds?: number, action?: AutoModAction): void {
  updateGuild(guildId, d => {
    const a = d.config.automod ?? { enabled: true, bannedWords: [], action: 'delete_timeout' as AutoModAction };
    a.enabled = true;
    const current = (a as any)[key] ?? {};
    (a as any)[key] = { ...current, enabled, maxCount: maxCount ?? current.maxCount ?? 5, windowSeconds: windowSeconds ?? current.windowSeconds ?? 5, action: action ?? current.action ?? 'delete_timeout' };
    d.config.automod = a;
  });
}
function ensureOwner(guild: Guild, message: Message): boolean { return isOwnerOrExtraOwner(guild, message.author.id); }
async function reply(message: Message, e: EmbedBuilder): Promise<void> { await message.reply({ embeds: [e] }).catch(() => undefined); }

export async function handleSecurityPrefix(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;
  const prefix = getGuildPrefix(message.guild.id);
  if (!message.content.startsWith(prefix)) return false;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = (args.shift() ?? '').toLowerCase();
  const guild = message.guild;
  const guildId = guild.id;
  const member = message.member;

  // .spam automod ..., .mention automod ..., .emoji automod ..., .ping automod ..., .lines automod ...
  const automodKinds: Record<string, { key: string; label: string; defaultMax: number }> = {
    spam: { key: 'spam', label: 'Message Spam', defaultMax: 5 },
    mention: { key: 'mentions', label: 'Mention Spam', defaultMax: 5 },
    emoji: { key: 'emoji', label: 'Emoji Spam', defaultMax: 10 },
    ping: { key: 'ping', label: '@everyone / @here Spam', defaultMax: 2 },
    lines: { key: 'lines', label: 'Lines / Character Spam', defaultMax: 10 },
  };
  const kind = automodKinds[command];
  if (kind && args.shift()?.toLowerCase() === 'automod') {
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild) && !ensureOwner(guild, message)) {
      await reply(message, embed('🔒 AutoMod Setup Locked', 'You need **Manage Server** or server-owner access to configure AutoMod.', DANGER)); return true;
    }
    const sub = (args.shift() ?? '').toLowerCase();
    if (sub === 'enable' || sub === 'disable') {
      applyRule(guildId, kind.key, sub === 'enable');
      await reply(message, embed(`🛡️ ${kind.label}`, `**${sub === 'enable' ? 'Enabled' : 'Disabled'}**\n\nUse \`${prefix}${command} automod limit <count> <window>\` to tune the trigger.` , sub === 'enable' ? SUCCESS : WARNING));
      return true;
    }
    if (sub === 'limit') {
      const count = parsePositive(args[0], 100);
      const seconds = parseWindow(args[1]);
      if (!count || !seconds) { await reply(message, embed('⚙️ Invalid AutoMod Limit', `Usage: \`${prefix}${command} automod limit 5 3s\`` , WARNING)); return true; }
      if (kind.key === 'lines' && args[2]?.toLowerCase() === 'chars') {
        updateGuild(guildId, d => { const a = d.config.automod!; const r: any = (a as any).lines ?? {}; (a as any).lines = { ...r, enabled: true, maxCount: count, windowSeconds: seconds, charLimit: count }; });
      } else applyRule(guildId, kind.key, true, count, seconds);
      await reply(message, embed(`⚙️ ${kind.label} Updated`, `Trigger: **${count}** within **${seconds}s**`, SUCCESS)); return true;
    }
    if (sub === 'action') {
      const action = (args[0] ?? '').toLowerCase() as AutoModAction;
      const valid = ['delete','warn','timeout','delete_timeout','dm_warn','kick','ban'];
      if (!valid.includes(action)) { await reply(message, embed('⚙️ Invalid Action', `Choose: \`delete\`, \`warn\`, \`timeout\`, \`kick\`, \`ban\`, \`delete_timeout\`, \`dm_warn\`.`, WARNING)); return true; }
      const duration = parseDuration(args[1]);
      if ((action === 'timeout' || action === 'delete_timeout') && (!duration || duration > 28 * 86_400_000)) { await reply(message, embed('⏱️ Timeout Duration Required', 'Use a duration such as `10m`, `20m` or `1h` (maximum 28 days).', WARNING)); return true; }
      updateGuild(guildId, d => { const a = d.config.automod!; const r: any = (a as any)[kind.key] ?? {}; (a as any)[kind.key] = { ...r, enabled: true, action }; });
      await reply(message, embed(`⚙️ ${kind.label} Action`, `Punishment: **${actionName(action)}**${duration ? `\nDuration: **${args[1]}**` : ''}`, SUCCESS)); return true;
    }
    if (sub === 'status') {
      const a: any = loadGuild(guildId).config.automod ?? {};
      const r: any = a[kind.key] ?? rule(a, kind.key);
      await reply(message, embed(`🛡️ ${kind.label}`, `Status: **${r.enabled ? '🟢 Enabled' : '🔴 Disabled'}**\nLimit: **${r.maxCount ?? kind.defaultMax}** in **${r.windowSeconds ?? 5}s**\nAction: **${actionName(r.action ?? 'delete_timeout')}**`, r.enabled ? SUCCESS : DANGER)); return true;
    }
    await reply(message, embed(`🛡️ ${kind.label} Help`, `\`${prefix}${command} automod enable\`\n\`${prefix}${command} automod disable\`\n\`${prefix}${command} automod limit 5 3s\`\n\`${prefix}${command} automod action timeout 10m\`\n\`${prefix}${command} automod status\``)); return true;
  }

  if (command === 'antinuke') {
    if (!ensureOwner(guild, message)) { await reply(message, embed('🔒 Anti-Nuke Locked', 'Only the **server owner** or an **extra owner** can configure Anti-Nuke.', DANGER)); return true; }
    const sub = (args.shift() ?? '').toLowerCase();
    if (sub === 'enable' || sub === 'disable') {
      if (sub === 'enable') {
        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        const missing = me ? ['ViewAuditLog','ManageChannels','ManageRoles','KickMembers','BanMembers'].filter(p => !me.permissions.has(p as any)) : [];
        if (missing.length) { await reply(message, embed('🛡️ Anti-Nuke Needs Permissions', `Grant the bot: **${missing.join(', ')}** and run the command again.`, WARNING)); return true; }
      }
      updateGuild(guildId, d => { d.antiNuke.enabled = sub === 'enable'; });
      await reply(message, embed(`🛡️ Anti-Nuke ${sub === 'enable' ? 'Enabled' : 'Disabled'}`, sub === 'enable' ? 'Live audit-log protection is now active.' : 'Protection is paused.', sub === 'enable' ? SUCCESS : WARNING)); return true;
    }
    if (sub === 'limit') {
      const action = (args.shift() ?? '').toLowerCase() as keyof AntiNukeConfig['limits'];
      const count = parsePositive(args.shift(), 100);
      const seconds = parseWindow(args.shift());
      const valid = ['channel_delete','channel_create','role_delete','role_create','member_ban','member_kick','webhook_create','webhook_delete','permission_update'];
      if (!valid.includes(action) || !count || !seconds) { await reply(message, embed('⚙️ Anti-Nuke Limit', `Usage: \`${prefix}antinuke limit channel_delete 5 10s\`\nActions: ${valid.map(x => `\`${x}\``).join(', ')}`, WARNING)); return true; }
      updateGuild(guildId, d => { d.antiNuke.limits[action] = { maxCount: count, windowSeconds: seconds }; });
      await reply(message, embed('⚙️ Anti-Nuke Limit Updated', `**${action}** → **${count}** actions in **${seconds}s**`, SUCCESS)); return true;
    }
    if (sub === 'punishment') {
      const p = (args.shift() ?? '').toLowerCase() as AntiNukeAction;
      if (!['strip','kick','ban'].includes(p)) { await reply(message, embed('⚙️ Invalid Punishment', 'Choose `strip`, `kick` or `ban`.', WARNING)); return true; }
      updateGuild(guildId, d => { d.antiNuke.punishment = p; });
      await reply(message, embed('⚙️ Anti-Nuke Punishment', `Threshold violations now use **${p}**.`, SUCCESS)); return true;
    }
    if (sub === 'logs') {
      const channel = message.mentions.channels.first();
      if (!channel || !channel.isTextBased()) { await reply(message, embed('📋 Anti-Nuke Logs', `Usage: \`${prefix}antinuke logs #channel\``, WARNING)); return true; }
      updateGuild(guildId, d => { d.antiNuke.logChannelId = channel.id; });
      await reply(message, embed('📋 Anti-Nuke Logs Updated', `Security events will be sent to ${channel}.`, SUCCESS)); return true;
    }
    if (sub === 'whitelist') {
      const user = message.mentions.users.first();
      const mode = (args[0] ?? '').toLowerCase();
      if (!user || !['add','remove'].includes(mode)) { await reply(message, embed('👥 Anti-Nuke Whitelist', `Usage: \`${prefix}antinuke whitelist add @user\` or \`${prefix}antinuke whitelist remove @user\``, WARNING)); return true; }
      updateGuild(guildId, d => { if (mode === 'add' && !d.antiNuke.whitelist.includes(user.id)) d.antiNuke.whitelist.push(user.id); if (mode === 'remove') d.antiNuke.whitelist = d.antiNuke.whitelist.filter(id => id !== user.id); });
      await reply(message, embed('👥 Anti-Nuke Whitelist', `${mode === 'add' ? 'Added' : 'Removed'} ${user} ${mode === 'add' ? 'to' : 'from'} the trusted list.`, SUCCESS)); return true;
    }
    if (sub === 'status') {
      const a = loadGuild(guildId).antiNuke;
      const limits = Object.entries(a.limits).map(([k,v]) => `**${k}** • ${(v as AntiNukeLimit).maxCount} / ${(v as AntiNukeLimit).windowSeconds}s`).join('\n');
      await reply(message, embed('🛡️ Anti-Nuke Status', `Status: **${a.enabled ? '🟢 Enabled' : '🔴 Disabled'}**\nPunishment: **${a.punishment}**\nLogs: ${a.logChannelId ? `<#${a.logChannelId}>` : '**Not configured**'}\n\n${limits}`)); return true;
    }
    await reply(message, embed('🛡️ Anti-Nuke Help', `\`${prefix}antinuke enable\`\n\`${prefix}antinuke limit channel_delete 5 10s\`\n\`${prefix}antinuke punishment strip|kick|ban\`\n\`${prefix}antinuke logs #channel\`\n\`${prefix}antinuke whitelist add @user\`\n\`${prefix}antinuke status\``)); return true;
  }

  if (command === 'recovery') {
    if (!ensureOwner(guild, message)) { await reply(message, embed('🔒 Recovery Locked', 'Only the **server owner** or an **extra owner** can manage recovery.', DANGER)); return true; }
    const sub = (args.shift() ?? '').toLowerCase();
    if (sub === 'enable' || sub === 'disable') {
      updateGuild(guildId, d => { d.recovery.enabled = sub === 'enable'; });
      if (sub === 'enable') {
        try { const backup = await createRecoveryBackup(guild); updateGuild(guildId, d => { d.recoveryBackups = [backup, ...(d.recoveryBackups ?? [])].slice(0, 25); }); await reply(message, embed('💾 Recovery Enabled', `Automatic recovery saves are **enabled**.\nFirst save created: \`${backup.id}\`\nSchedule: every **${loadGuild(guildId).recovery.intervalMinutes} minutes**.`, SUCCESS)); }
        catch (e) { await reply(message, embed('⚠️ Recovery Enabled With Warning', `Automatic saves are enabled, but the first save failed: ${e instanceof Error ? e.message : 'unknown error'}`, WARNING)); }
      } else await reply(message, embed('💾 Recovery Disabled', 'Automatic recovery saves are paused.', WARNING));
      return true;
    }
    if (sub === 'save') {
      try { const backup = await createRecoveryBackup(guild); updateGuild(guildId, d => { d.recoveryBackups = [backup, ...(d.recoveryBackups ?? [])].slice(0, 25); }); await reply(message, embed('💾 Recovery Saved', `Recovery point \`${backup.id}\` created.\nRoles: **${backup.roles.length}** • Channels: **${backup.channels.length}** • Emojis: **${backup.emojis.length}**`, SUCCESS)); }
      catch (e) { await reply(message, embed('❌ Recovery Save Failed', e instanceof Error ? e.message : 'Unknown error', DANGER)); }
      return true;
    }
    if (sub === 'list') {
      const backups = [...loadGuild(guildId).recoveryBackups].sort((a,b) => b.createdAt-a.createdAt);
      await reply(message, embed('💾 Recovery Points', backups.length ? backups.slice(0,10).map((b,i) => `**${i+1}.** \`${b.id}\` • ${b.roles.length} roles • ${b.channels.length} channels • <t:${Math.floor(b.createdAt/1000)}:R>`).join('\n') : 'No recovery points yet.')); return true;
    }
    if (sub === 'restore') {
      const id = args[0]; const backup = loadGuild(guildId).recoveryBackups.find(b => b.id === id);
      if (!backup) { await reply(message, embed('❌ Recovery Not Found', `Use \`${prefix}recovery list\` to view valid recovery IDs.`, DANGER)); return true; }
      await reply(message, embed('⚠️ Recovery Starting', 'The saved structure will be rebuilt. **Current channels will be deleted.** Do not make server changes while recovery is running.', WARNING));
      try { const result = await restoreRecoveryBackup(guild, backup); await reply(message, embed('✅ Recovery Complete', `Restored **${result.roles} roles**, **${result.channels} channels** and **${result.emojis} emojis**.\nSkipped: **${result.skipped.length}**`, SUCCESS)); }
      catch (e) { await reply(message, embed('❌ Recovery Failed', e instanceof Error ? e.message : 'Unknown error', DANGER)); }
      return true;
    }
    await reply(message, embed('💾 Recovery Help', `\`${prefix}recovery enable\`\n\`${prefix}recovery disable\`\n\`${prefix}recovery save\`\n\`${prefix}recovery list\`\n\`${prefix}recovery restore <id>\``)); return true;
  }
  return false;
}
