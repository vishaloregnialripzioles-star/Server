import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { SnipedMessage } from './types.js';

export function buildSnipeEmbed(
  messages: SnipedMessage[],
  index: number,
  type: 'delete' | 'edit',
): EmbedBuilder {
  const msg = messages[index];
  const sinceMs = Date.now() - msg.timestamp;
  const sinceStr = sinceMs < 60_000
    ? `${Math.floor(sinceMs / 1000)}s ago`
    : `${Math.floor(sinceMs / 60_000)}m ago`;

  const embed = new EmbedBuilder()
    .setColor(type === 'delete' ? 0x5865F2 : 0xFFAA00)
    .setAuthor({ name: msg.authorName, iconURL: msg.authorAvatar ?? undefined })
    .setDescription(msg.content || '*[No text content]*')
    .setFooter({
      text: `${type === 'delete' ? '🗑️ Deleted' : '✏️ Edited'} ${sinceStr} • ${index + 1}/${messages.length}`,
    })
    .setTimestamp(msg.timestamp);

  if (type === 'delete' && msg.imageUrl) embed.setImage(msg.imageUrl);
  return embed;
}

export function buildSnipeButtons(
  channelId: string,
  index: number,
  total: number,
  type: 'snipe' | 'editsnipe',
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${type}_nav:${channelId}:${index - 1}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId(`${type}_nav:${channelId}:${index + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
  );
}
