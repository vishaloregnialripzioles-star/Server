import type { Message, PartialMessage } from 'discord.js';
import { updateGuild, loadGuild } from '../storage.js';

const MAX_SNIPE = 10;

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const data = loadGuild(oldMessage.guild.id);
  if (!data.config.snipeEnabled) return;

  let old: Message | PartialMessage = oldMessage;
  if (oldMessage.partial) {
    try { old = await oldMessage.fetch(); } catch { return; }
  }

  if (!old.author || old.author.bot) return;
  if (!old.content) return;

  updateGuild(oldMessage.guild.id, d => {
    const existing = d.lastEdited[oldMessage.channelId] ?? [];
    d.lastEdited[oldMessage.channelId] = [
      {
        content: old.content ?? '',
        authorId: old.author!.id,
        authorName: old.author!.tag,
        authorAvatar: old.author!.displayAvatarURL() ?? null,
        timestamp: Date.now(),
      },
      ...existing,
    ].slice(0, MAX_SNIPE);
  });
}
