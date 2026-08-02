import { REST, Routes } from 'discord.js';
import { allCommands } from './commands/index.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
// Only treat DISCORD_GUILD_ID as valid if it looks like a Discord snowflake (numeric string)
const rawGuildId = process.env.DISCORD_GUILD_ID;
const guildId = rawGuildId && /^\d+$/.test(rawGuildId.trim()) ? rawGuildId.trim() : undefined;

if (!token || !clientId) {
  throw new Error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID environment variables');
}

const rest = new REST({ version: '10' }).setToken(token);
const commandData = allCommands.map(c => c.data.toJSON());

console.log(`📤 Registering ${commandData.length} slash commands:`);
commandData.forEach((c, i) => console.log(`  ${i + 1}. /${c.name}`));

if (guildId) {
  // First wipe all existing guild commands, then push fresh
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
  console.log(`\n✅ Registered ${data.length} global commands (may take up to 1 hour to appear)`);
}
