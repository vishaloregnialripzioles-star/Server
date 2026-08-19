import type { Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { loadGuild } from '../storage.js';
import { matchesHinglishCursedWord } from '../automod-hinglish.js';

export async function handleHinglishCursedWords(message: Message): Promise<void> {
  if (!message.guild || !message.member || message.author.bot) return;
  const data = loadGuild(message.guild.id);
  const cfg = data.config.automod;
  if (!cfg?.enabled || !cfg.hinglishCursedWords?.length) return;
  if (message.author.id === message.guild.ownerId) return;
  if ((data.extraOwners ?? []).includes(message.author.id)) return;
  if ((data.antiNuke?.whitelist ?? []).includes(message.author.id)) return;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

  const rule = cfg.hinglishCursedWordsRule;
  if (rule?.enabled === false) return;
  const matched = matchesHinglishCursedWord(message.content, cfg.hinglishCursedWords);
  if (!matched) return;

  const effectiveRule = rule ?? { action: cfg.action ?? 'delete_timeout' as const };
  const action = effectiveRule.action ?? cfg.action ?? 'delete_timeout';
  const template = effectiveRule.templateId ? (data.config.moderationTemplates ?? []).find(x => x.id === effectiveRule.templateId) : undefined;
  const reason = `Hinglish cursed word: ${matched}`;

  if (action === 'delete' || action === 'delete_timeout' || action === 'dm_warn') {
    await message.delete().catch(() => undefined);
  }
  if (action === 'warn' || action === 'dm_warn') {
    const text = template?.message ?? `⚠️ Your message was removed by AutoMod: **${reason}**`;
    if (action === 'dm_warn') await message.author.send(text).catch(() => undefined);
    else await message.reply(text).catch(() => undefined);
  }
  if (action === 'timeout' || action === 'delete_timeout') {
    await message.member.timeout(10 * 60 * 1000, `AutoMod: ${reason}`).catch(() => undefined);
  }
}
