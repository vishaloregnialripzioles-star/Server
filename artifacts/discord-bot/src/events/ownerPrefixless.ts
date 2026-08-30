import type { Message } from 'discord.js';
import { handlePrefixCommand, getGuildPrefix } from '../prefixHandler.js';
import { allCommands } from '../commands/index.js';

const OWNER_USER_IDS = new Set(
  [process.env.OWNER_USER_ID ?? '', '1323664778488582284']
    .map(id => id.trim())
    .filter(Boolean),
);

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

/** Allows the configured owner and trusted co-owner to run existing commands without a prefix. */
export async function handleOwnerPrefixlessCommand(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot || !OWNER_USER_IDS.has(message.author.id)) return false;

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
