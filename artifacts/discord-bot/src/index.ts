import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Sparxie bot is running');
}).listen(port, '0.0.0.0', () => console.log(`🌐 Health server listening on ${port}`));

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

// Keep the gateway client reliable for both slash commands and the existing
// prefix/message/voice features. The command collection is required by the
// interaction handler to resolve every slash command.
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

client.on('debug', message => {
  if (/identify|gateway|ready|heartbeat|resume/i.test(message)) {
    console.log(`[Discord] ${message}`);
  }
});

client.once('ready', async () => {
  console.log(`✅ DISCORD ONLINE: logged in as ${client.user?.tag}`);

  // Load the command/event modules only after Discord is connected so a bad
  // optional module cannot prevent the bot from coming online.
  try {
    const [{ allCommands }, { registerEvents }, { startLoops }, { registerGlobalGameEvents }, { primeHelpApplicationEmojis }] = await Promise.all([
      import('./commands/index.js'),
      import('./events/index.js'),
      import('./loops.js'),
      import('./globalGameEvents.js'),
      import('./commands/help.js'),
    ]);

    // Restore the command registry used by interactionCreate.ts.
    client.commands.clear();
    for (const command of allCommands) {
      client.commands.set(command.data.name, command);
    }

    registerEvents(client);
    registerGlobalGameEvents(client);
    startLoops(client);
    void primeHelpApplicationEmojis(client).catch(err => console.error('[Help emoji cache]', err));

    console.log(`✅ Loaded ${client.commands.size} commands`);

    try {
      const { REST, Routes } = await import('discord.js');
      const guildId = process.env.DISCORD_GUILD_ID?.trim();
      const commandData = allCommands.map(command => command.data.toJSON());
      const rest = new REST({ version: '10' }).setToken(token);
      if (guildId && /^\d+$/.test(guildId)) {
        await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commandData });
        console.log(`✅ Synced ${commandData.length} slash commands to guild ${guildId}`);
      } else {
        await rest.put(Routes.applicationCommands(client.user!.id), { body: commandData });
        console.log(`✅ Synced ${commandData.length} global slash commands`);
      }
    } catch (err) {
      console.error('[Slash sync skipped]', err);
    }
  } catch (err) {
    console.error('[Command startup failed — Discord remains online]', err);
  }
});

client.on('error', err => console.error('[Discord error]', err));
client.on('warn', message => console.warn('[Discord warn]', message));

console.log('🔌 Connecting to Discord gateway...');
const loginPromise = client.login(token);
const timeout = setTimeout(() => {
  console.error('❌ Discord gateway did not become ready within 30 seconds. Check the bot token and Discord gateway connectivity.');
}, 30_000);

loginPromise
  .then(() => clearTimeout(timeout))
  .catch(err => {
    clearTimeout(timeout);
    console.error('[Discord login failed]', err);
    // Do not crash Render with an unhandled rejection; the explicit error above
    // makes the failure visible in logs.
  });
