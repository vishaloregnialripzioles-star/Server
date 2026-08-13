import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';

const port = process.env.PORT ?? 3000;
createServer((_, res) => res.end('OK')).listen(port, '0.0.0.0', () => {
  console.log(`🌐 Health server listening on ${port}`);
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

client.commands = new Collection();
client.on('error', err => console.error('[Discord error]', err));
client.on('warn', msg => console.warn('[Discord warn]', msg));

// Discord login is the first application task. Nothing from the command/music
// tree is imported until the gateway connection is established.
try {
  await client.login(token);
  console.log(`✅ DISCORD ONLINE: logged in as ${client.user?.tag}`);
} catch (err) {
  console.error('[Discord login failed]', err);
  process.exit(1);
}

// Load the rest only after the bot is online. If an optional command module
// fails, keep the Discord connection alive instead of killing the whole bot.
try {
  const [{ allCommands }, { registerEvents }, { startLoops }, { registerGlobalGameEvents }, { primeHelpApplicationEmojis }] = await Promise.all([
    import('./commands/index.js'),
    import('./events/index.js'),
    import('./loops.js'),
    import('./globalGameEvents.js'),
    import('./commands/help.js'),
  ]);

  for (const command of allCommands) client.commands.set(command.data.name, command);
  registerEvents(client);
  registerGlobalGameEvents(client);
  startLoops(client);
  void primeHelpApplicationEmojis(client).catch(err => console.error('[Help emoji cache]', err));

  console.log(`✅ Loaded ${client.commands.size} commands`);

  // Slash sync is deliberately best-effort; a REST/rate-limit failure must not
  // disconnect an otherwise healthy Discord gateway session.
  try {
    const { REST, Routes } = await import('discord.js');
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    const commandData = allCommands.map(command => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);
    if (guildId && /^\d+$/.test(guildId)) {
      await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commandData });
    } else {
      await rest.put(Routes.applicationCommands(client.user!.id), { body: commandData });
    }
    console.log(`✅ Synced ${commandData.length} slash commands`);
  } catch (err) {
    console.error('[Slash sync skipped]', err);
  }
} catch (err) {
  console.error('[Command startup failed — Discord will remain online]', err);
}
