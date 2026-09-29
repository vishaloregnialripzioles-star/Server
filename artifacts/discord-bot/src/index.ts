import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';
import { registerEvents } from './events/index.js';
import { handleDashboardApi } from './dashboardApi.js';
import { initStorage } from './storage.js';
import { initGlobalAfk } from './globalAfk.js';
import { startRecoveryScheduler } from './recoveryScheduler.js';
import { allCommands } from './commands/index.js';

const port = Number(process.env.PORT ?? 3000);
const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessages],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

createServer(async (req, res) => { if (await handleDashboardApi(req, res, client)) return; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Sparxie bot is running'); }).listen(port, '0.0.0.0', () => console.log(`🌐 Health server listening on ${port}`));

client.commands = new Collection();
// Load the complete command map before the gateway connects so every slash
// interaction has a command ready immediately when Discord delivers it.
for (const command of allCommands) client.commands.set(command.data.name, command);
console.log(`📦 Preloaded ${client.commands.size} core slash commands before login`);
client.on('debug', message => { if (/identify|gateway|ready|heartbeat|resume/i.test(message)) console.log(`[Discord] ${message}`); });
registerEvents(client);

client.once('ready', async () => {
  console.log(`✅ DISCORD ONLINE: logged in as ${client.user?.tag}`);
  startRecoveryScheduler(client);

  try {
    const { game } = await import('./commands/games.js');
    client.commands.set(game.data.name, game);
    console.log('🎮 Loaded /game command');
  } catch (err) { console.error('❌ Failed to load /game command:', err); }

  try {
    const { allCommands } = await import('./commands/index.js');
    for (const command of allCommands) client.commands.set(command.data.name, command);
    console.log(`✅ Loaded ${client.commands.size} core commands`);
  } catch (err) { console.error('[Core command startup failed]', err); }

  try {
    const { startBloxStockTracker } = await import('./bloxStock.js');
    startBloxStockTracker(client);
    console.log('📈 Blox Fruits stock tracker started');
  } catch (err) { console.error('[Blox stock tracker startup failed]', err); }

  try {
    const { bloxValueCommand, setBloxValueChannelCommand } = await import('./commands/bloxvalue.js');
    client.commands.set(bloxValueCommand.data.name, bloxValueCommand);
    client.commands.set(setBloxValueChannelCommand.data.name, setBloxValueChannelCommand);
    console.log('🍈 Loaded Blox Fruits commands');
  } catch (err) { console.error('[Blox command startup failed]', err); }

  try {
    const { bloxscanner } = await import('./commands/bloxScanner.js');
    client.commands.set(bloxscanner.data.name, bloxscanner);
    console.log('🔎 Loaded /bloxscanner command');
  } catch (err) { console.error('[Blox scanner command startup failed]', err); }

  try {
    const { REST, Routes } = await import('discord.js');
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    const commandData = [...client.commands.values()].map(command => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);

    const commandNames = commandData.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    console.log(`📋 Registering slash commands (${commandNames.length}): ${commandNames.join(', ')}`);

    let registered: any[] = [];
    if (guildId && /^\d+$/.test(guildId)) {
      registered = await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commandData }) as any[];
      console.log(`✅ Synced ${registered.length} slash commands to guild ${guildId}`);
    } else {
      registered = await rest.put(Routes.applicationCommands(client.user!.id), { body: commandData }) as any[];
      console.log(`✅ Synced ${registered.length} global slash commands`);
    }

    const registeredNames = registered.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const missing = commandNames.filter(name => !registeredNames.includes(name));
    const extra = registeredNames.filter(name => !commandNames.includes(name));
    if (missing.length) console.error(`❌ Discord registration missing: ${missing.join(', ')}`);
    if (extra.length) console.warn(`⚠️ Discord has extra commands: ${extra.join(', ')}`);
    console.log(`🔎 Slash command verification: ${registeredNames.length}/${commandNames.length} present`);
  } catch (err) { console.error('[Slash sync failed]', err); }

  try {
    const [{ startLoops }, { registerGlobalGameEvents }] = await Promise.all([import('./loops.js'), import('./globalGameEvents.js')]);
    registerGlobalGameEvents(client); startLoops(client);
  } catch (err) { console.error('[Background startup failed]', err); }
});

client.on('error', err => console.error('[Discord error]', err));
client.on('warn', message => console.warn('[Discord warn]', message));
console.log('🔌 Connecting to Discord gateway...');
await initStorage();
await initGlobalAfk();
const loginPromise = client.login(token);
const timeout = setTimeout(() => console.error('❌ Discord gateway did not become ready within 30 seconds. Check the bot token and Discord gateway connectivity.'), 30000);
loginPromise.then(() => clearTimeout(timeout)).catch(err => { clearTimeout(timeout); console.error('[Discord login failed]', err); });
