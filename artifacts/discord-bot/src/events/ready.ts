import type { Client } from 'discord.js';

export function handleReady(client: Client<true>): void {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} guild(s)`);
  client.user.setActivity('Use /help • Moderation & Fun');
}
