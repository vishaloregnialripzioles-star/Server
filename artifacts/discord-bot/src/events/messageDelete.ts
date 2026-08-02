import type { Message, PartialMessage } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';

const MAX_SNIPE = 10;

export async function handleMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;

  const data = loadGuild(message.guild.id);
  if (!data.config.snipeEnabled) return;

  // Try to fetch full message if partial
  let full: Message | PartialMessage = message;
  if (message.partial) {
    try {
      full = await message.fetch();
    } catch {
      return;
    }
  }

  if (!full.author || full.author.bot) return;
  if (!full.content && full.attachments.size === 0) return;

  const imageAttachment = full.attachments.find(a =>
    a.contentType?.startsWith('image/') ?? false,
  );

  updateGuild(message.guild.id, d => {
    const existing = d.lastDeleted[message.channelId] ?? [];
    d.lastDeleted[message.channelId] = [
      {
        content: full.content ?? '',
        authorId: full.author!.id,
        authorName: full.author!.tag,
        authorAvatar: full.author!.displayAvatarURL() ?? null,
        timestamp: Date.now(),
        imageUrl: imageAttachment?.url,
      },
      ...existing,
    ].slice(0, MAX_SNIPE);
  });
}
