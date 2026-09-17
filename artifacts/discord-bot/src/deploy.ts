import { REST, Routes } from 'discord.js';
import { allCommands } from './commands/index.js';

const token = process.env.DISCORD_BOT_TOKEN?.trim();
// DISCORD_CLIENT_ID is no longer trusted for registration. The application ID
// is read from the same token that the bot actually uses, preventing commands
// from being registered to a different Discord application by mistake.
const configuredClientId = process.env.DISCORD_CLIENT_ID?.trim();
const rawGuildId = process.env.DISCORD_GUILD_ID;
const guildId = rawGuildId && /^\d+$/.test(rawGuildId.trim()) ? rawGuildId.trim() : undefined;

if (!token) {
  throw new Error('Missing DISCORD_BOT_TOKEN environment variable');
}

const rest = new REST({ version: '10' }).setToken(token);
const me = await rest.get(Routes.user()) as { id: string; username?: string; discriminator?: string };
const clientId = me.id;

if (configuredClientId && !/^\d+$/.test(configuredClientId)) {
  console.warn('⚠️ DISCORD_CLIENT_ID is not numeric; ignoring it because the application ID is taken from DISCORD_BOT_TOKEN.');
}
if (configuredClientId && /^\d+$/.test(configuredClientId) && configuredClientId !== clientId) {
  console.warn(`⚠️ DISCORD_CLIENT_ID (${configuredClientId}) does not match the application authenticated by DISCORD_BOT_TOKEN (${clientId}). Using authenticated application ID.`);
}

const commandData = allCommands.map(c => c.data.toJSON());

console.log(`📤 Registering ${commandData.length} slash commands for ${me.username ?? 'Sparxie'} (${clientId})`);
commandData.forEach((c, i) => console.log(`  ${i + 1}. /${c.name}`));

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
  const data = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commandData },
  ) as unknown[];
  console.log(`\n✅ Registered ${data.length} commands to guild ${guildId} (instant)`);
} else {
  const data = await rest.put(
    Routes.applicationCommands(clientId),
    { body: commandData },
  ) as unknown[];
  console.log(`\n✅ Registered ${data.length} global commands`);
}
