import type { MessageReaction, PartialMessageReaction, User, PartialUser, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';

export async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;
  if (reaction.emoji.name !== '⭐') return;

  // Fetch partial data
  if (reaction.partial) {
    try { reaction = await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const message = reaction.message;
  if (!message.guild || !message.author) return;
  if (message.author.bot) return;

  const data = loadGuild(message.guild.id);
  if (!data.config.starboardChannel) return;
  if (message.channelId === data.config.starboardChannel) return;

  const threshold = data.config.starboardThreshold;
  const starCount = reaction.count ?? 0;
  if (starCount < threshold) return;

  const existing = data.starboard[message.id];

  const starboardChannel = await message.guild.channels
    .fetch(data.config.starboardChannel)
    .catch(() => null);

  if (!starboardChannel?.isTextBased()) return;
  const sbChannel = starboardChannel as TextChannel;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(message.content ?? null)
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})`, inline: true })
    .setTimestamp(message.createdAt);

  // Add image if present
  const attachment = message.attachments.find(a => a.contentType?.startsWith('image/') ?? false);
  if (attachment) embed.setImage(attachment.url);

  const starHeader = `⭐ **${starCount}** | <#${message.channelId}>`;

  if (existing) {
    // Update existing starboard message
    try {
      const sbMsg = await sbChannel.messages.fetch(existing.starboardMessageId);
      await sbMsg.edit({ content: starHeader, embeds: [embed] });
      updateGuild(message.guild.id, d => {
        if (d.starboard[message.id]) d.starboard[message.id].count = starCount;
      });
    } catch {
      // Starboard message was deleted, create new one
      const sent = await sbChannel.send({ content: starHeader, embeds: [embed] });
      updateGuild(message.guild.id, d => {
        d.starboard[message.id] = { starboardMessageId: sent.id, count: starCount };
      });
    }
  } else {
    // Create new starboard message
    const sent = await sbChannel.send({ content: starHeader, embeds: [embed] });
    updateGuild(message.guild.id, d => {
      d.starboard[message.id] = { starboardMessageId: sent.id, count: starCount };
    });
  }
}
