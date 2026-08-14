import type { Client } from 'discord.js';
import { Events } from 'discord.js';

function safe(name: string, fn: (...args: any[]) => any) {
  return (...args: any[]) => {
    try {
      Promise.resolve(fn(...args)).catch((err: unknown) => console.error(`[${name}]`, err));
    } catch (err) {
      console.error(`[${name}]`, err);
    }
  };
}

// Register the gateway listeners immediately. The actual feature modules are
// loaded lazily so a bad/optional command module can never prevent Discord
// events from being received. This also guarantees prefix messages and slash
// interactions are attached before the first interaction arrives.
export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, safe('ready', async (...args: any[]) => {
    const { handleReady } = await import('./ready.js');
    return handleReady(...args);
  }));

  client.on(Events.InteractionCreate, safe('interactionCreate', async (...args: any[]) => {
    const { handleInteractionCreate } = await import('./interactionCreate.js');
    return handleInteractionCreate(...args);
  }));

  client.on(Events.MessageCreate, safe('messageCreate', async (...args: any[]) => {
    const { handleMessageCreate } = await import('./messageCreate.js');
    return handleMessageCreate(...args);
  }));

  client.on(Events.MessageDelete, safe('messageDelete', async (...args: any[]) => {
    const { handleMessageDelete } = await import('./messageDelete.js');
    return handleMessageDelete(...args);
  }));

  client.on(Events.MessageUpdate, safe('messageUpdate', async (...args: any[]) => {
    const { handleMessageUpdate } = await import('./messageUpdate.js');
    return handleMessageUpdate(...args);
  }));

  client.on(Events.MessageReactionAdd, safe('messageReactionAdd', async (...args: any[]) => {
    const { handleMessageReactionAdd } = await import('./messageReactionAdd.js');
    return handleMessageReactionAdd(...args);
  }));

  client.on(Events.GuildMemberAdd, safe('guildMemberAdd', async (...args: any[]) => {
    const { handleGuildMemberAdd } = await import('./guildMemberAdd.js');
    return handleGuildMemberAdd(...args);
  }));

  client.on(Events.GuildAuditLogEntryCreate, safe('guildAuditLogEntryCreate', async (...args: any[]) => {
    const { handleAntiNukeAudit } = await import('./antiNuke.js');
    return handleAntiNukeAudit(...args);
  }));
}
