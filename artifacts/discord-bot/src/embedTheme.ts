import {
  EmbedBuilder,
  Message,
  CommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  TextChannel,
  ThreadChannel,
  NewsChannel,
} from 'discord.js';

const FALLBACK = ['✨', '🎮', '⚡', '🎁', '🛡️', '🔧', '🎵', '📊', '🎯', '💎'];
const WRAPPED = Symbol.for('sparxie.animatedEmbedTheme');

function pickAnimatedEmoji(guild: any, seed: string): string {
  const animated = guild?.emojis?.cache?.filter((e: any) => e.animated) ?? [];
  const list = [...animated.values()];
  if (!list.length) return FALLBACK[Math.abs(hash(seed)) % FALLBACK.length];
  return list[Math.abs(hash(seed)) % list.length].toString();
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return h;
}

function decorateEmbed(embed: any, guild: any, seed: string): any {
  if (!embed) return embed;
  const emoji = pickAnimatedEmoji(guild, seed);
  if (typeof embed.setTitle === 'function') {
    const title = embed.data?.title;
    if (title && !/^<a?:[^>]+>/.test(title) && !/^[✨🎮⚡🎁🛡️🔧🎵📊🎯💎]/u.test(title)) {
      embed.setTitle(`${emoji} ${title}`);
    } else if (!title && embed.data?.description && !/^<a?:[^>]+>/.test(embed.data.description)) {
      embed.setDescription(`${emoji} ${embed.data.description}`);
    }
    return embed;
  }
  const copy = { ...embed };
  if (copy.title && !/^<a?:[^>]+>/.test(copy.title)) copy.title = `${emoji} ${copy.title}`;
  else if (!copy.title && copy.description && !/^<a?:[^>]+>/.test(copy.description)) copy.description = `${emoji} ${copy.description}`;
  return copy;
}

export function decorateEmbedPayload(payload: any, guild: any): any {
  if (!payload || !guild) return payload;
  const target = payload?.data && !payload.embeds && payload.data.embeds ? payload.data : payload;
  if (!target?.embeds || !Array.isArray(target.embeds)) return payload;
  target.embeds = target.embeds.map((embed: any, index: number) => {
    const title = embed?.data?.title ?? embed?.title ?? '';
    return decorateEmbed(embed, guild, `${guild.id}:${title}:${index}`);
  });
  return payload;
}

function wrap(proto: any, method: string): void {
  const original = proto?.[method];
  if (typeof original !== 'function' || original[WRAPPED]) return;
  const wrapped = function (this: any, payload: any, ...rest: any[]) {
    return original.call(this, decorateEmbedPayload(payload, this.guild), ...rest);
  };
  wrapped[WRAPPED] = true;
  proto[method] = wrapped;
}

export function installAnimatedEmbedTheme(): void {
  for (const ctor of [Message, CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction]) {
    for (const method of ['reply', 'editReply', 'followUp', 'update']) wrap((ctor as any).prototype, method);
  }
  for (const ctor of [TextChannel, ThreadChannel, NewsChannel]) wrap((ctor as any).prototype, 'send');
}
