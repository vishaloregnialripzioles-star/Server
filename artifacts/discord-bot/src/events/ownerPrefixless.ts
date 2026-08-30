import type { Message } from 'discord.js';
import { handlePrefixCommand, getGuildPrefix } from '../prefixHandler.js';
import { allCommands } from '../commands/index.js';

const OWNER_USER_ID = (process.env.OWNER_USER_ID ?? '').trim();

const LEGACY_COMMANDS = new Set([
  'ban','kick','mute','unmute','timeout','warn','warnings','clearwarns','purge','purgebots',
  'lock','unlock','slowmode','chatban','unchatban','jail','unjail','nick','afk','remindme','poll',
  'snipe','editsnipe','userinfo','serverinfo','rank','leaderboard','ticket','closeticket','ticketpanel',
  'roast','setprefix','gay','pro','noob','ship','autoresponder','help','levelconfig','createrole',
  'random','giveawaycreate','gleave','gparticipants','gremove','gend','music','welcome',
]);

function knownCommand(name: string): boolean {
  if (LEGACY_COMMANDS.has(name)) return true;
  return allCommands.some(command => command.data.toJSON().name === name);
}

/**
 * Allows exactly one Discord user to run existing bot commands without the
 * configured prefix. Existing prefixed commands and everyone else's messages
 * are completely untouched.
 *
 * Configure OWNER_USER_ID in the bot environment with the owner's Discord ID.
 */
export async function handleOwnerPrefixlessCommand(message: Message): Promise<boolean> {
  if (!OWNER_USER_ID || !message.guild || message.author.bot) return false;
  if (message.author.id !== OWNER_USER_ID) return false;

  const raw = message.content.trim();
  if (!raw) return false;

  const prefix = getGuildPrefix(message.guild.id);
  if (raw.startsWith(prefix)) return false;

  const commandName = raw.split(/\s+/)[0]?.toLowerCase();
  if (!commandName || !knownCommand(commandName)) return false;

  const proxiedMessage = new Proxy(message, {
    get(target, property, receiver) {
      if (property === 'content') return `${prefix}${raw}`;
      return Reflect.get(target, property, receiver);
    },
  });

  await handlePrefixCommand(proxiedMessage);
  return true;
}
