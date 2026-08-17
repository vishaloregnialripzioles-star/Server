import type { Client } from 'discord.js';
import { primeHelpApplicationEmojis } from '../commands/help.js';
import { primeInviteCache } from '../inviteRoles.js';

export async function handleReady(client: Client<true>): Promise<void> {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} guild(s)`);
  client.user.setActivity('Use /help • Moderation & Fun');
  await primeHelpApplicationEmojis(client);
  await primeInviteCache(client);
}
