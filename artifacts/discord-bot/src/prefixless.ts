import type { Client, Message } from 'discord.js';
import { allCommands } from './commands/index.js';
import { handleMissingPrefixCommand } from './prefixBridge.js';
import { getGuildPrefix } from './prefixHandler.js';
import { claimCommandMessage } from './storage.js';

const ids = [
  process.env.OWNER_USER_ID ?? '',
  ...(process.env.OWNER_USER_IDS ?? '').split(/[\s,]+/),
  '1405884975860940854',
];
export const PREFIXLESS_USERS = new Set(ids.map(id => id.trim()).filter(Boolean));
export const PREFIXLESS_COMMAND_NAMES = new Set(allCommands.map(c => c.data.toJSON().name.toLowerCase()));

export function isPrefixlessUser(userId: string): boolean {
  return PREFIXLESS_USERS.has(userId);
}

/**
 * Handles an owner/friend command without a prefix. This is intentionally a
 * helper rather than a second messageCreate listener: there must be exactly one
 * message processing pipeline so prefix and prefixless commands cannot execute
 * twice.
 */
export async function handlePrefixlessMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild || !isPrefixlessUser(message.author.id)) return false;
  const text = message.content.trim();
  if (!text || text.startsWith(getGuildPrefix(message.guild.id))) return false;

  const command = text.split(/\s+/)[0]?.toLowerCase();
  if (!PREFIXLESS_COMMAND_NAMES.has(command)) return false;

  const claimed = await claimCommandMessage(message.id);
  if (!claimed) {
    console.warn(`[Command dedupe] Skipping already-claimed prefixless message ${message.id}`);
    return true;
  }

  const proxy = Object.create(message) as Message;
  Object.defineProperty(proxy, 'content', {
    value: `${getGuildPrefix(message.guild.id)}${text}`,
    enumerable: true,
  });
  await handleMissingPrefixCommand(proxy, true, true).catch(err => console.error('[prefixless]', err));
  return true;
}

// Kept as a compatibility export for any older imports. The actual listener is
// intentionally not registered here; events/messageCreate.ts owns the pipeline.
export function registerPrefixless(_client: Client): void {
  console.log('[Prefixless] Using unified messageCreate handler.');
}
