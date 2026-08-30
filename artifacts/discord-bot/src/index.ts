import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';
import { registerEvents } from './events/index.js';
import { handleDashboardApi } from './dashboardApi.js';
import { initStorage } from './storage.js';

const port = Number(process.env.PORT ?? 3000);
const token = process.env.DISCORD_BOT_TOKEN?.trim();
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

createServer(async (req, res) => {
  if (await handleDashboardApi(req, res, client)) return;
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Sparxie bot is running');
}).listen(port, '0.0.0.0', () => console.log(`🌐 Health server listening on ${port}`));

client.commands = new Collection();

client.on('debug', message => {
  if (/identify|gateway|ready|heartbeat|resume/i.test(message)) console.log(`[Discord] ${message}`);
});

// Register Discord event listeners BEFORE login/ready.
registerEvents(client);

client.once('ready', async () => {
  console.log(`✅ DISCORD ONLINE: logged in as ${client.user?.tag}`);

  // Load the game command independently first. This guarantees /game is
  // available even if an unrelated command module fails during bulk loading.
  try {
    const { game } = await import('./commands/games.js');
    client.commands.set(game.data.name, game);
    console.log('🎮 Loaded /game command');
  } catch (err) {
    console.error('❌ Failed to load /game command:', err);
  }

  let allCommands: import('./types.js').Command[] = [];
  try {
    const commandsModule = await import('./commands/index.js');
    allCommands = commandsModule.allCommands;
    for (const command of allCommands) client.commands.set(command.data.name, command);
    console.log(`✅ Loaded ${client.commands.size} commands`);
  } catch (err) {
    console.error('[Command startup failed — /game remains available]', err);
  }

  // Always sync whatever commands were successfully loaded. Use the logged-in
  // bot application's ID so DISCORD_CLIENT_ID cannot point at another app.
  try {
    const { REST, Routes } = await import('discord.js');
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    const commandData = [...client.commands.values()].map(command => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);
    if (guildId && /^\d+$/.test(guildId)) {
      await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commandData });
      console.log(`✅ Synced ${commandData.length} slash commands to guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user!.id), { body: commandData });
      console.log(`✅ Synced ${commandData.length} global slash commands`);
    }
  } catch (err) {
    console.error('[Slash sync failed]', err);
  }

  try {
    const [{ startLoops }, { registerGlobalGameEvents }, { primeHelpApplicationEmojis }] = await Promise.all([
      import('./loops.js'),
      import('./globalGameEvents.js'),
      import('./commands/help.js'),
    ]);
    registerGlobalGameEvents(client);
    startLoops(client);
    void primeHelpApplicationEmojis(client).catch(err => console.error('[Help emoji cache]', err));
  } catch (err) {
    console.error('[Background startup failed]', err);
  }
});

client.on('error', err => console.error('[Discord error]', err));
client.on('warn', message => console.warn('[Discord warn]', message));

console.log('🔌 Connecting to Discord gateway...');

// Load durable guild progression before the gateway can deliver events.
await initStorage();

const loginPromise = client.login(token);
const timeout = setTimeout(() => {
  console.error('❌ Discord gateway did not become ready within 30 seconds. Check the bot token and Discord gateway connectivity.');
}, 30_000);
loginPromise.then(() => clearTimeout(timeout)).catch(err => { clearTimeout(timeout); console.error('[Discord login failed]', err); });
