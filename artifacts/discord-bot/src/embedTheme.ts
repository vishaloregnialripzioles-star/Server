import { Message, CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, TextChannel, ThreadChannel, NewsChannel } from 'discord.js';
const HELP_HEADER_EMOJI = ':Sparxie_help:';
const WRAPPED = Symbol.for('sparxie.helpHeaderEmojiTheme');
function decorateHelpEmbed(embed: any): any {
  if (!embed) return embed;
  const authorName = embed.data?.author?.name ?? embed.author?.name;
  if (authorName === 'Sparxie Help Menu') {
    const nextName = `${HELP_HEADER_EMOJI} Sparxie Help Menu`;
    if (typeof embed.setAuthor === 'function') embed.setAuthor({ ...(embed.data?.author ?? {}), name: nextName });
    else if (embed.author) embed.author = { ...embed.author, name: nextName };
  }
  return embed;
}
export function decorateEmbedPayload(payload: any, _guild: any): any {
  if (!payload) return payload;
  const target = payload?.data && !payload.embeds && payload.data.embeds ? payload.data : payload;
  if (!target?.embeds || !Array.isArray(target.embeds)) return payload;
  target.embeds = target.embeds.map((embed: any) => decorateHelpEmbed(embed));
  return payload;
}
function wrap(proto: any, method: string): void {
  const original = proto?.[method];
  if (typeof original !== 'function' || original[WRAPPED]) return;
  const wrapped: any = function (this: any, payload: any, ...rest: any[]) { return original.call(this, decorateEmbedPayload(payload, this.guild), ...rest); };
  wrapped[WRAPPED] = true;
  proto[method] = wrapped;
}
export function installAnimatedEmbedTheme(): void {
  for (const ctor of [Message, CommandInteraction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction]) for (const method of ['reply', 'editReply', 'followUp', 'update']) wrap((ctor as any).prototype, method);
  for (const ctor of [TextChannel, ThreadChannel, NewsChannel]) wrap((ctor as any).prototype, 'send');
}
