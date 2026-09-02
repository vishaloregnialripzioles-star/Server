import type { Client, Message } from 'discord.js';
import { allCommands } from './commands/index.js';
import { handleMissingPrefixCommand } from './prefixBridge.js';
import { getGuildPrefix } from './prefixHandler.js';
import { claimCommandMessage } from './storage.js';

const ids = [process.env.OWNER_USER_ID ?? '', ...(process.env.OWNER_USER_IDS ?? '').split(/[\s,]+/), '1405884975860940854'];
const PREFIXLESS_USERS = new Set(ids.map(id => id.trim()).filter(Boolean));
const names = new Set(allCommands.map(c => c.data.toJSON().name.toLowerCase()));

export function registerPrefixless(client: Client) {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot || !message.guild || !PREFIXLESS_USERS.has(message.author.id)) return;
    const text = message.content.trim();
    if (!text || text.startsWith(getGuildPrefix(message.guild.id))) return;
    const command = text.split(/\s+/)[0]?.toLowerCase();
    if (!names.has(command)) return;
    const claimed = await claimCommandMessage(message.id);
    if (!claimed) {
      console.warn(`[Command dedupe] Skipping already-claimed prefixless message ${message.id}`);
      return;
    }
    const proxy = Object.create(message) as Message;
    Object.defineProperty(proxy, 'content', { value: `${getGuildPrefix(message.guild.id)}${text}`, enumerable: true });
    await handleMissingPrefixCommand(proxy, true).catch(err => console.error('[prefixless]', err));
  });
}
