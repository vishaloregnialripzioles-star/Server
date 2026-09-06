import type { Client, Message } from 'discord.js';
import { Events } from 'discord.js';
import { loadGuild, claimMessageEvent } from './storage.js';
import { buildBloxValueEmbed, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';

const REGISTERED = Symbol.for('sparxie.bloxvalue.registered');

export function registerBloxValueEvents(client: Client): void {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;

  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild || !message.client.user) return;

      const guildData = loadGuild(message.guild.id);
      const channelId = guildData.config.bloxValueChannelId;
      if (!channelId || channelId !== message.channelId) return;
      if (!message.mentions.users.has(message.client.user.id)) return;

      // This listener is the sole owner of Blox-value mention messages.
      // The database-backed claim also prevents duplicate replies if two bot
      // processes happen to receive the same Discord message.
      if (!(await claimMessageEvent(`bloxvalue:${message.id}`))) return;

      const prefix = getGuildPrefix(message.guild.id);
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
