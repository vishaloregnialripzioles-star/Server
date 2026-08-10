import type { Client } from 'discord.js';
import { handleGlobalButton } from './commands/globalGames.js';

export function registerGlobalGameEvents(client: Client): void {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('global:')) return;
    try {
      await handleGlobalButton(interaction, client);
    } catch (error) {
      console.error('[Global game error]', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Global matchmaking could not process that action.', ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
