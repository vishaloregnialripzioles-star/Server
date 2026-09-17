import { EmbedBuilder, PermissionFlagsBits, type Client, type Message } from 'discord.js';
import { loadGuild } from '../storage.js';
import { isAntiNukeTrusted } from '../security.js';
import type { AutoModAction, AutoModRule } from '../types.js';

const windows = new Map<string, number[]>();
const emojiRegex = /(?:<a?:\w+:\d+>|[\p{Extended_Pictographic}\uFE0F])/gu;
const push = (key: string, seconds: number): number[] => { const now = Date.now(); const arr = (windows.get(key) ?? []).filter(t => now - t < seconds * 1000); arr.push(now); windows.set(key, arr); return arr; };
const actionName = (a: AutoModAction) => ({delete:'Delete',warn:'Warn',timeout:'Mute / Timeout',delete_timeout:'Delete + Mute',dm_warn:'DM + Warn',kick:'Kick',ban:'Ban'} as Record<string,string>)[a] ?? a;

async function punish(message: Message, reason: string, rule: AutoModRule): Promise<void> {
  const action = rule.action ?? 'delete_timeout';
  if (action === 'delete' || action === 'delete_timeout' || action === 'dm_warn') await message.delete().catch(() => undefined);
  if (action === 'warn' || action === 'dm_warn') await message.author.send({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('⚠️ AutoMod Warning').setDescription(`Your message was flagged for **${reason}**.`).setFooter({text: message.guild?.name ?? 'Server'}).setTimestamp()] }).catch(async () => { await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('⚠️ AutoMod Warning').setDescription(`${message.author}, your message was flagged for **${reason}**.`).setTimestamp()] }).catch(() => undefined); });
  if (action === 'timeout' || action === 'delete_timeout') { const ms = Math.min(28 * 86_400_000, Math.max(1_000, (rule.timeoutSeconds ?? 600) * 1000)); await message.member?.timeout(ms, `AutoMod: ${reason}`).catch(() => undefined); }
  if (action === 'kick') await message.member?.kick(`AutoMod: ${reason}`).catch(() => undefined);
  if (action === 'ban') await message.member?.ban({ reason: `AutoMod: ${reason}` }).catch(() => undefined);
}

function isImmune(message: Message): boolean { const g = message.guild; if (!g || !message.member) return true; return isAntiNukeTrusted(g, message.author.id) || message.member.permissions.has(PermissionFlagsBits.ManageGuild); }

export function registerEnhancedAutoMod(client: Client): void {
  const registered = Symbol.for('sparxie.enhanced.automod');
  if ((client as any)[registered]) return;
  (client as any)[registered] = true;
  client.on('messageCreate', async (message: Message) => {
    if (!message.guild || !message.member || message.author.bot || isImmune(message)) return;
    const cfg: any = loadGuild(message.guild.id).config.automod;
    if (!cfg?.enabled) return;
    let reason: string | undefined;
    let selected: AutoModRule | undefined;

    const spam = cfg.spam as AutoModRule | undefined;
    if (!reason && spam?.enabled) { const hit = push(`spam:${message.guild.id}:${message.author.id}`, spam.windowSeconds ?? 5); if (hit.length >= (spam.maxCount ?? 5)) { reason = `message spam (${hit.length} messages / ${spam.windowSeconds ?? 5}s)`; selected = spam; } }
    const mentions = cfg.mentions as AutoModRule | undefined;
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (!reason && mentions?.enabled && mentionCount > 0) { const hit = push(`mention:${message.guild.id}:${message.author.id}`, mentions.windowSeconds ?? 5); if (mentionCount >= (mentions.maxCount ?? 5) || hit.length >= (mentions.maxCount ?? 5)) { reason = `mention spam (${mentionCount} mentions)`; selected = mentions; } }
    const emoji = cfg.emoji as AutoModRule | undefined;
    const emojiCount = (message.content.match(emojiRegex) ?? []).length;
    if (!reason && emoji?.enabled && emojiCount >= (emoji.maxCount ?? 10)) { reason = `emoji spam (${emojiCount} emojis)`; selected = emoji; }
    const ping = cfg.ping as AutoModRule | undefined;
    const pingCount = (message.content.match(/@(everyone|here)/gi) ?? []).length;
    if (!reason && ping?.enabled && pingCount > 0) { const hit = push(`ping:${message.guild.id}:${message.author.id}`, ping.windowSeconds ?? 10); if (pingCount >= (ping.maxCount ?? 2) || hit.length >= (ping.maxCount ?? 2)) { reason = `@everyone/@here spam (${pingCount} pings)`; selected = ping; } }
    const lines = cfg.lines as AutoModRule | undefined;
    const lineCount = message.content ? message.content.split(/\r?\n/).length : 0;
    const charCount = message.content.length;
    if (!reason && lines?.enabled && (lineCount >= (lines.lineLimit ?? lines.maxCount ?? 10) || charCount >= (lines.charLimit ?? 2000))) { reason = `message too large (${lineCount} lines / ${charCount} characters)`; selected = lines; }
    if (reason && selected) await punish(message, reason, selected);
  });
}
