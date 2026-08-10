import type { Message } from 'discord.js';
import { allCommands } from './commands/index.js';

const PREFIX_NATIVE = new Set([
  'ban','kick','mute','unmute','timeout','warn','warnings','clearwarns','purge','purgebots',
  'lock','unlock','slowmode','chatban','unchatban','jail','unjail','nick','afk','remindme','poll',
  'snipe','editsnipe','userinfo','serverinfo','rank','leaderboard','ticket','closeticket','ticketpanel',
  'roast','setprefix','gay','pro','noob','ship','autoresponder','help','levelconfig','createrole',
  'random','giveawaycreate','gleave','gparticipants','gremove','gend','music','welcome',
]);

function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) out.push((m[1] ?? m[2] ?? m[3]).replace(/\\(["'])/g, '$1'));
  return out;
}

function findCommand(name: string) {
  return allCommands.find(c => c.data.toJSON().name === name);
}

function getDefinitions(command: any, args: string[]) {
  const root = command.data.toJSON();
  const options = root.options ?? [];
  let selectedSubcommand: string | undefined;
  let selectedGroup: string | undefined;
  let defs = options;
  let cursor = 0;

  const firstName = args[cursor]?.toLowerCase();
  const firstDef = defs.find((x: any) => x.name === firstName);
  if (firstDef?.type === 2) {
    selectedGroup = firstName;
    cursor++;
    defs = firstDef.options ?? [];
    const subName = args[cursor]?.toLowerCase();
    const sub = defs.find((x: any) => x.name === subName);
    if (sub?.type === 1) {
      selectedSubcommand = subName;
      cursor++;
      defs = sub.options ?? [];
    }
  } else if (firstDef?.type === 1) {
    selectedSubcommand = firstName;
    cursor++;
    defs = firstDef.options ?? [];
  }

  return { selectedSubcommand, selectedGroup, defs, cursor };
}

function makeOptions(message: Message, command: any, rawArgs: string[]) {
  const parsed = getDefinitions(command, rawArgs);
  const values = new Map<string, unknown>();
  let cursor = parsed.cursor;
  const defs = parsed.defs.filter((d: any) => d.type >= 3 && d.type <= 11);
  let mentionUserIndex = 0;
  let mentionRoleIndex = 0;
  let mentionChannelIndex = 0;

  for (const def of defs) {
    if (def.type === 6) {
      const token = rawArgs[cursor];
      if (token?.startsWith('<@')) cursor++;
      const user = message.mentions.users.at(mentionUserIndex++);
      if (user) values.set(def.name, user);
      continue;
    }
    if (def.type === 8) {
      const token = rawArgs[cursor];
      if (token?.startsWith('<@&')) cursor++;
      const role = message.mentions.roles.at(mentionRoleIndex++);
      if (role) values.set(def.name, role);
      continue;
    }
    if (def.type === 7) {
      const token = rawArgs[cursor];
      if (token?.startsWith('<#')) cursor++;
      const channel = message.mentions.channels.at(mentionChannelIndex++);
      if (channel) values.set(def.name, channel);
      continue;
    }
    const value = rawArgs[cursor++];
    if (value === undefined) continue;
    if (def.type === 4) values.set(def.name, Number.parseInt(value, 10));
    else if (def.type === 10) values.set(def.name, Number.parseFloat(value));
    else if (def.type === 5) values.set(def.name, /^(true|yes|on|1)$/i.test(value));
    else values.set(def.name, value);
  }

  const get = (name: string) => values.get(name);
  return {
    getString(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return (v as string | undefined) ?? null; },
    getInteger(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return (v as number | undefined) ?? null; },
    getNumber(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return (v as number | undefined) ?? null; },
    getBoolean(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return (v as boolean | undefined) ?? null; },
    getUser(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return v ?? null; },
    getRole(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return v ?? null; },
    getChannel(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return v ?? null; },
    getMentionable(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return v ?? null; },
    getAttachment(name: string, required = false) { const v = get(name); if (v === undefined && required) throw new Error(`Missing required option: ${name}`); return v ?? null; },
    getSubcommand(required = false) { if (!parsed.selectedSubcommand && required) throw new Error('Missing subcommand'); return parsed.selectedSubcommand ?? null; },
    getSubcommandGroup(required = false) { if (!parsed.selectedGroup && required) throw new Error('Missing subcommand group'); return parsed.selectedGroup ?? null; },
  };
}

function shouldBridge(raw: string, commandName: string): boolean {
  if (commandName === 'setup') return /^setup\s+(shoprole|shop\s+colour)\b/i.test(raw);
  return !PREFIX_NATIVE.has(commandName);
}

export async function handleMissingPrefixCommand(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot || !message.content) return false;
  const prefix = (await import('./prefixHandler.js')).getGuildPrefix(message.guild.id);
  if (!message.content.startsWith(prefix)) return false;

  const raw = message.content.slice(prefix.length).trim();
  const tokens = tokenize(raw);
  const commandName = tokens.shift()?.toLowerCase();
  if (!commandName || !shouldBridge(raw, commandName)) return false;

  const command = findCommand(commandName);
  if (!command) return false;

  const options = makeOptions(message, command, tokens);
  let response: any = null;
  let deferred = false;
  const adapter: any = {
    client: message.client,
    user: message.author,
    member: message.member,
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    channelId: message.channelId,
    createdTimestamp: message.createdTimestamp,
    replied: false,
    deferred: false,
    options,
    isChatInputCommand: () => true,
    reply: async (payload: any) => { response = await message.reply(payload); adapter.replied = true; return response; },
    deferReply: async () => { deferred = true; adapter.deferred = true; },
    editReply: async (payload: any) => { if (response) return response.edit(payload); response = await message.reply(payload); return response; },
    deleteReply: async () => response?.delete().catch(() => undefined),
    fetchReply: async () => response,
    followUp: async (payload: any) => message.reply(payload),
  };

  try {
    await command.execute(adapter);
    return true;
  } catch (err) {
    console.error(`[prefix bridge:${commandName}]`, err);
    if (!adapter.replied && !deferred) await message.reply(`❌ Could not run \`${prefix}${raw}\`. Check the command arguments.`).catch(() => undefined);
    return true;
  }
}
