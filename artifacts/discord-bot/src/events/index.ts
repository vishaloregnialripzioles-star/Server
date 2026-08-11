import type { Client } from 'discord.js';
import { Events } from 'discord.js';
import { handleReady } from './ready.js';
import { handleInteractionCreate } from './interactionCreate.js';
import { handleMessageCreate } from './messageCreate.js';
import { handleMessageDelete } from './messageDelete.js';
import { handleMessageUpdate } from './messageUpdate.js';
import { handleMessageReactionAdd } from './messageReactionAdd.js';
import { handleGuildMemberAdd } from './guildMemberAdd.js';
import { handleAntiNukeAudit } from './antiNuke.js';

function safe(name: string, fn: (...args: any[]) => any) {
  return (...args: any[]) => {
    try {
      Promise.resolve(fn(...args)).catch((err: unknown) => console.error(`[${name}]`, err));
    } catch (err) {
      console.error(`[${name}]`, err);
    }
  };
}

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, safe('ready', handleReady));
  client.on(Events.InteractionCreate, safe('interactionCreate', handleInteractionCreate));
  client.on(Events.MessageCreate, safe('messageCreate', handleMessageCreate));
  client.on(Events.MessageDelete, safe('messageDelete', handleMessageDelete));
  client.on(Events.MessageUpdate, safe('messageUpdate', handleMessageUpdate));
  client.on(Events.MessageReactionAdd, safe('messageReactionAdd', handleMessageReactionAdd));
  client.on(Events.GuildMemberAdd, safe('guildMemberAdd', handleGuildMemberAdd));
  client.on(Events.GuildAuditLogEntryCreate, safe('guildAuditLogEntryCreate', handleAntiNukeAudit));
}
