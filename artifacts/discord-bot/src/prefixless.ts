import type { Client, Message } from 'discord.js';
import { allCommands } from './commands/index.js';
import { handleMissingPrefixCommand } from './prefixBridge.js';
import { getGuildPrefix } from './prefixHandler.js';
import { claimCommandMessage } from './storage.js';

const ids = [
  process.env.OWNER_USER_ID ?? '',
  ...(process.env.OWNER_USER_IDS ?? '').split(/[\s,]+/),
  '1405884975860940854',
  '1530840594115596309',
  '1425090863947714613',
];
export const PREFIXLESS_USERS = new Set(ids.map(id => id.trim()).filter(Boolean));
export const PREFIXLESS_COMMAND_NAMES = new Set(allCommands.map(c => c.data.toJSON().name.toLowerCase()));

// Resolve the application owner in the background, never inside the hot
// message-processing path. A slow Discord REST request here used to hold every
// ordinary prefix command (including .ping) before it reached the dispatcher.
let ownerLookupStarted = false;
function warmApplicationOwner(client: Message['client']): void {
  if (ownerLookupStarted) return;
  ownerLookupStarted = true;
  void (async () => {
    try {
      const application = client.application;
      if (!application) return;
      const resolved = application.owner ? application : await application.fetch();
      const owner = resolved.owner;
      if (owner && 'id' in owner) PREFIXLESS_USERS.add(owner.id);
      if (owner && 'members' in owner) {
        for (const [, member] of owner.members ?? []) PREFIXLESS_USERS.add(member.id);
      }
      console.log('[Prefixless] Application owner lookup completed.');
    } catch (error) {
      console.warn('[Prefixless] Background application owner lookup failed:', error);
    }
  })();
}

export async function isPrefixlessUser(message: Message): Promise<boolean> {
  if (PREFIXLESS_USERS.has(message.author.id)) return true;
  warmApplicationOwner(message.client);
  // Do not await application.fetch() here: command dispatch must never depend
  // on the latency or availability of the Discord application REST endpoint.
  return PREFIXLESS_USERS.has(message.author.id);
}

/**
 * Handles an owner/friend command without a prefix. This is intentionally a
 * helper rather than a second messageCreate listener: there must be exactly one
 * message processing pipeline so prefix and prefixless commands cannot execute
 * twice.
 */
export async function handlePrefixlessMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;
  const authorized = await isPrefixlessUser(message);
  if (!authorized) {
    console.log(`[Prefixless] Rejected non-allowlisted user=${message.author.id} messageId=${message.id}`);
    return false;
  }
  const text = message.content.trim();
  if (!text) {
    console.log(`[Prefixless] Ignored empty message from user=${message.author.id} messageId=${message.id}`);
    return false;
  }
  const prefix = getGuildPrefix(message.guild.id);
  if (text.startsWith(prefix)) return false;

  const command = text.split(/\\s+/)[0]?.toLowerCase();
  if (!PREFIXLESS_COMMAND_NAMES.has(command)) {
    console.log(`[Prefixless] Unknown command token=${JSON.stringify(command)} user=${message.author.id} messageId=${message.id}`);
    return false;
  }
  console.log(`[Prefixless] Accepted command=${command} user=${message.author.id} messageId=${message.id}`);

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
