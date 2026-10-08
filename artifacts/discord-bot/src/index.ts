import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';
import { lookup } from 'node:dns/promises';
import { connect as tlsConnect } from 'node:tls';
import { registerEvents } from './events/index.js';
import { handleDashboardApi } from './dashboardApi.js';
import { initStorage } from './storage.js';
import { initGlobalAfk } from './globalAfk.js';
import { startRecoveryScheduler } from './recoveryScheduler.js';
import { allCommands } from './commands/index.js';

const port = Number(process.env.PORT ?? 3000);
const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

process.on('unhandledRejection', reason => console.error('[Process] Unhandled rejection:', reason));
process.on('uncaughtException', error => {
  console.error('[Process] Uncaught exception:', error);
  process.exitCode = 1;
});

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
  // Render can occasionally take longer to establish the Discord WebSocket.
  // Give the Gateway handshake enough time to complete while keeping failures visible.
  ws: {
    handshakeTimeout: 45_000,
    helloTimeout: 60_000,
    readyTimeout: 45_000,
  },
});

// The bot intentionally has several independent interaction handlers.
// Keep their behavior unchanged while avoiding a misleading EventEmitter warning.
client.setMaxListeners(25);

createServer(async (req, res) => { if (await handleDashboardApi(req, res, client)) return; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Sparxie bot is running'); }).listen(port, '0.0.0.0', () => console.log(`🌐 Health server listening on ${port}`));

client.commands = new Collection();
// Load the complete command map before the gateway connects so every slash
// interaction has a command ready immediately when Discord delivers it.
for (const command of allCommands) client.commands.set(command.data.name, command);
console.log(`📦 Preloaded ${client.commands.size} core slash commands before login`);
client.on('debug', message => {
  // discord.js can include the bot token in its own debug message. Never write it to Render logs.
  if (/provided token/i.test(message)) return;
  console.log(`[Discord DEBUG] ${message}`);
});
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
    const target = guildId && /^\d+$/.test(guildId) ? 'guild' : 'global';
    const route = target === 'guild'
      ? Routes.applicationGuildCommands(client.user!.id, guildId!)
      : Routes.applicationCommands(client.user!.id);

    try {
      registered = await rest.put(route, { body: commandData }) as any[];
      console.log(`✅ Synced ${registered.length} ${target} slash commands${target === 'guild' ? ` to guild ${guildId}` : ''}`);
    } catch (bulkError) {
      // One invalid command can reject a bulk overwrite. Register commands
      // individually so one broken command cannot hide the healthy commands.
      console.error('❌ Bulk slash-command sync failed:', bulkError);
      console.log('🛠️ Falling back to individual slash-command registration...');
      registered = [];
      for (const command of commandData) {
        try {
          const result = await rest.post(route, { body: command }) as any;
          registered.push(result);
        } catch (commandError) {
          console.error(`❌ Failed to register /${String(command.name)}:`, commandError);
        }
      }
      console.log(`🛠️ Individual sync completed: ${registered.length}/${commandData.length} commands registered`);
    }

    const registeredNames = registered.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const missing = commandNames.filter(name => !registeredNames.includes(name));
    const extra = registeredNames.filter(name => !commandNames.includes(name));
    if (missing.length) console.error(`❌ Discord registration missing: ${missing.join(', ')}`);
    if (extra.length) console.warn(`⚠️ Discord has extra commands: ${extra.join(', ')}`);
    console.log(`🔎 Slash command verification: ${registeredNames.length}/${commandNames.length} present`);
    console.log(`🔐 Slash sync target: ${target}${target === 'guild' ? ` (${guildId})` : ' (global)'}`);
  } catch (err) { console.error('[Slash sync failed]', err); }

  try {
    const [{ startLoops }, { registerGlobalGameEvents }] = await Promise.all([import('./loops.js'), import('./globalGameEvents.js')]);
    registerGlobalGameEvents(client); startLoops(client);
  } catch (err) { console.error('[Background startup failed]', err); }
});

client.on('error', err => console.error('[Discord error]', err));
client.on('warn', message => console.warn('[Discord warn]', message));

// Gateway lifecycle diagnostics. These expose Discord close codes such as 4013/4014,
// connection errors, reconnects, and the exact point where the Gateway stops progressing.
client.on('shardReady', shardId => console.log('[Discord] shard ' + shardId + ' READY'));
client.on('shardReconnecting', shardId => console.warn('[Discord] shard ' + shardId + ' reconnecting...'));
client.on('shardResume', (shardId, replayedEvents) => console.log('[Discord] shard ' + shardId + ' RESUMED; replayedEvents=' + replayedEvents));
client.on('shardError', (error, shardId) => console.error('[Discord] shard ' + shardId + ' error:', error));
client.on('shardDisconnect', (closeEvent, shardId) => {
  console.error('[Discord] shard ' + shardId + ' disconnected (code ' + closeEvent.code + ', reason: ' + (closeEvent.reason || 'none') + ')');
});
client.on('invalidated', () => console.error('[Discord] Session invalidated by Discord.'));

console.log('🔌 Starting Discord authentication + gateway connection...');
await initStorage();
await initGlobalAfk();

const gatewayDiagnostics = async () => {
  const host = 'gateway.discord.gg';
  console.log('[Discord NET] Probing Discord Gateway DNS...');
  try {
    const addresses = await lookup(host, { all: true });
    console.log(
      '[Discord NET] DNS OK: ' +
      addresses.map(address => `${address.address} (IPv${address.family})`).join(', '),
    );
  } catch (error) {
    console.error('[Discord NET] DNS FAILED:', error);
    return;
  }

  console.log('[Discord NET] Probing TLS connection to gateway.discord.gg:443...');
  await new Promise<void>(resolve => {
    const startedAt = Date.now();
    const socket = tlsConnect({
      host,
      port: 443,
      servername: host,
      timeout: 15000,
      rejectUnauthorized: true,
    });

    let settled = false;
    const finish = (label: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) console.error(`[Discord NET] TLS ${label} FAILED after ${Date.now() - startedAt}ms:`, error);
      else console.log(`[Discord NET] TLS ${label} OK after ${Date.now() - startedAt}ms`);
      resolve();
    };

    socket.once('secureConnect', () => finish('handshake'));
    socket.once('error', error => finish('connection', error));
    socket.once('timeout', () => finish('connection', new Error('TLS socket timeout after 15000ms')));
  });
};

void gatewayDiagnostics().catch(error => console.error('[Discord NET] Diagnostic probe crashed:', error));

const gatewayWatchdog = setTimeout(() => {
  if (!client.isReady()) {
    console.error(
      '❌ Discord gateway has not reached READY after 90 seconds. ' +
      'The full Gateway debug stream above should show whether the connection, handshake, identify, or READY phase is stuck.',
    );
  }
}, 90000);

client.once('ready', () => clearTimeout(gatewayWatchdog));

try {
  // client.login() is the authoritative authentication + Gateway handshake.
  // Do not call /gateway/bot on every restart: it is unnecessary for login and can
  // itself consume Discord REST rate-limit budget. DNS/TLS diagnostics above remain.
  console.log('[Discord] Calling client.login() now...');
  const loginTimeoutMs = 120_000;
  let loginTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.login(token),
      new Promise<never>((_, reject) => {
        loginTimer = setTimeout(
          () => reject(new Error(`Discord gateway login timed out after ${loginTimeoutMs / 1000}s before READY.`)),
          loginTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (loginTimer) clearTimeout(loginTimer);
  }
  console.log(`[Discord] client.login() resolved; isReady=${client.isReady()}, user=${client.user?.tag ?? 'unknown'}`);
} catch (err) {
  clearTimeout(gatewayWatchdog);
  console.error('[Discord login failed]', err);
  process.exitCode = 1;
  try { client.destroy(); } catch {}
  throw err;
}
