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

export async function isPrefixlessUser(message: Message): Promise<boolean> {
  if (PREFIXLESS_USERS.has(message.author.id)) return true;

  // Also resolve the Discord application owner so prefixless owner commands do
  // not depend on an OWNER_USER_ID environment variable being present.
  try {
    const application = message.client.application;
    if (application) {
      const owner = application.owner ?? (await application.fetch()).owner;
      if (owner && 'id' in owner && owner.id === message.author.id) return true;
      if (owner && 'members' in owner && owner.members?.has(message.author.id)) return true;
    }
  } catch (error) {
    console.warn('[Prefixless] Could not resolve application owner:', error);
  }
  return false;
}

/**
 * Handles an owner/friend command without a prefix. This is intentionally a
 * helper rather than a second messageCreate listener: there must be exactly one
 * message processing pipeline so prefix and prefixless commands cannot execute
 * twice.
 */
export async function handlePrefixlessMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild || !(await isPrefixlessUser(message))) return false;
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

// Compatibility export. The actual listener is intentionally not registered here.
export function registerPrefixless(_client: Client): void {
  console.log('[Prefixless] Using unified messageCreate handler.');
}
