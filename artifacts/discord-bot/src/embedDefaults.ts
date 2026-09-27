import { EmbedBuilder } from 'discord.js';

export const DEFAULT_EMBED_COLOR = 0xD30000;

export function withDefaultEmbedColor(embed: EmbedBuilder): EmbedBuilder {
  const json: any = embed.toJSON();
  if (json.color === undefined || json.color === null) embed.setColor(DEFAULT_EMBED_COLOR);
  return embed;
}
