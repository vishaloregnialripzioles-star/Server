import type { Client, Message } from 'discord.js';
import { Events } from 'discord.js';
import { loadGuild } from './storage.js';
import { buildBloxValueEmbed, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';

const REGISTERED = Symbol.for('sparxie.bloxvalue.registered');

export function registerBloxValueEvents(client: Client): void {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;

  // Blox value auto-lookup is intentionally the only job of this listener.
  // Prefix commands are handled by the unified messageCreate pipeline, so a
  // command such as `.bloxvalue yeti` can never be replied to twice.
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild || !message.client.user) return;

      const prefix = getGuildPrefix(message.guild.id);
      const channelId = loadGuild(message.guild.id).config.bloxValueChannelId;
      if (!channelId || channelId !== message.channelId) return;
      if (!message.mentions.users.has(message.client.user.id)) return;

      const query = message.content
        .replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '')
        .trim();
      if (!query || query.startsWith('/') || query.startsWith(prefix)) return;

      const entry = findBloxValue(query);
      if (!entry) return;

      await message.reply({
        embeds: [buildBloxValueEmbed(entry)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('[BloxValue] Message lookup failed:', error);
    }
  });
}
