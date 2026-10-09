import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
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
// Safe Gateway diagnostics: log command event metadata only, never message content or tokens.
client.on('interactionCreate', interaction => {
  if (interaction.isChatInputCommand()) console.log('[Gateway Dispatch] InteractionCreate /' + interaction.commandName + ' id=' + interaction.id);
});
client.on('messageCreate', message => {
  if (!message.author.bot && message.guild) console.log('[Gateway Dispatch] MessageCreate id=' + message.id + ' guild=' + message.guild.id + ' contentLength=' + message.content.length + ' memberCached=' + Boolean(message.member));
});
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
    const guildId = process.env.DISCORD_GUILD_ID?.trim();
    const commandData = [...client.commands.values()].map(command => command.data.toJSON());
    const commandNames = commandData.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const target = guildId && /^\d+$/.test(guildId) ? 'guild' : 'global';
    const applicationId = client.user!.id;
    const route = target === 'guild'
      ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${applicationId}/commands`;
    const authHeaders = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
    console.log(`📋 Registering slash commands (${commandNames.length}): ${commandNames.join(', ')}`);
    console.log(`🔐 Slash sync target: ${target}${target === 'guild' ? ` (${guildId})` : ' (global)'}`);

    // Use a bounded native fetch for this single bulk overwrite. The previous
    // REST queue could remain pending without printing success/failure, leaving
    // startup logs ambiguous and slash-command registration unverified.
    const response = await fetch(route, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(commandData),
      signal: AbortSignal.timeout(20000),
    });
    const responseText = await response.text();
    let registered: any[] = [];
    if (response.ok) {
      try {
        const parsed = JSON.parse(responseText);
        registered = Array.isArray(parsed) ? parsed : [];
      } catch {
        throw new Error('Discord returned a successful status with an invalid JSON response.');
      }
      console.log(`✅ Synced ${registered.length} ${target} slash commands${target === 'guild' ? ` to guild ${guildId}` : ''}`);
    } else {
      console.error(`❌ Discord slash sync failed: HTTP ${response.status} ${response.statusText}; response=${responseText.slice(0, 3000)}`);
      throw new Error(`Discord rejected slash-command registration with HTTP ${response.status}`);
    }

    const registeredNames = registered.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const missing = commandNames.filter(name => !registeredNames.includes(name));
    const extra = registeredNames.filter(name => !commandNames.includes(name));
    if (missing.length) console.error(`❌ Discord registration missing: ${missing.join(', ')}`);
    if (extra.length) console.warn(`⚠️ Discord has extra commands: ${extra.join(', ')}`);
    console.log(`🔎 Slash command verification: ${registeredNames.length}/${commandNames.length} present`);
  } catch (err) {
    console.error('[Slash sync failed]', err);
  }

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

// discord.js 14.x uses the bundled @discordjs/ws 1.x manager, which does not
// expose fetchGatewayInformation(). In that version the manager stores the
// Gateway URL in its internal "gateway" field and otherwise discovers it through
// /gateway/bot. That endpoint has been rate-limited on this Render instance,
// while a direct WebSocket upgrade to the canonical Gateway succeeds with 101.
// This bot uses one shard, so safely seed the canonical Gateway URL and avoid
// making a rate-limited discovery request part of startup.
const installGatewayDiscoveryFallback = () => {
  // discord.js 14.27 creates its internal @discordjs/ws manager inside
  // client.ws.connect(), then fetches /gateway/bot before opening the socket.
  // Overriding client.ws.connect() cannot skip that fetch. This narrowly
  // intercepts only the rate-limited discovery endpoint and lets every other
  // REST request pass through unchanged.
  const rest = client.rest as any;
  const originalGet = rest?.get;
  if (!rest || typeof originalGet !== 'function') {
    console.error('[Discord AUTH] REST discovery override unavailable; normal login may be rate-limited.');
    return;
  }

  rest.get = async function (route: any, options?: any) {
    const routePath = typeof route === 'string' ? route : String(route?.url ?? route?.path ?? '');
    if (/^\/gateway\/bot(?:\?|$)/.test(routePath)) {
      console.warn('[Discord AUTH] Skipping rate-limited /gateway/bot discovery; supplying single-shard Gateway information.');
      return {
        url: 'wss://gateway.discord.gg',
        shards: 1,
        session_start_limit: {
          total: 1000,
          remaining: 1000,
          reset_after: 0,
          max_concurrency: 1,
        },
      };
    }
    return originalGet.call(this, route, options);
  };

  console.log('[Discord AUTH] Targeted /gateway/bot discovery fallback installed; other REST requests are unchanged.');
};
installGatewayDiscoveryFallback();

const gatewayWebSocketProbe = async () => {
  console.log('[Discord WS] Probing Gateway WebSocket upgrade (no bot token, no IDENTIFY)...');
  await new Promise<void>(resolve => {
    const startedAt = Date.now();
    const key = randomBytes(16).toString('base64');
    const req = httpsRequest({
      host: 'gateway.discord.gg',
      port: 443,
      path: '/?v=10&encoding=json',
      method: 'GET',
      headers: {
        Host: 'gateway.discord.gg',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        'User-Agent': 'SparxieBot-GatewayProbe/1.0',
      },
      timeout: 15000,
    });

    let settled = false;
    const finish = (label: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      req.destroy();
      if (error) {
        console.error(`[Discord WS] ${label} FAILED after ${Date.now() - startedAt}ms:`, error);
      } else {
        console.log(`[Discord WS] ${label} OK after ${Date.now() - startedAt}ms`);
      }
      resolve();
    };

    req.once('upgrade', (response, socket) => {
      console.log(`[Discord WS] HTTP upgrade -> ${response.statusCode}; connection=${response.headers.connection ?? 'unknown'}; upgrade=${response.headers.upgrade ?? 'unknown'}`);
      socket.destroy();
      finish('WebSocket upgrade');
    });
    req.once('response', response => {
      finish(`WebSocket upgrade rejected with HTTP ${response.statusCode}`, new Error(`Expected HTTP 101 Switching Protocols, received ${response.statusCode}`));
    });
    req.once('error', error => finish('WebSocket request', error));
    req.once('timeout', () => finish('WebSocket request', new Error('WebSocket upgrade timeout after 15000ms')));
    req.end();
  });
};

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

void Promise.allSettled([gatewayDiagnostics(), gatewayWebSocketProbe()]).then(results => { for (const result of results) if (result.status === 'rejected') console.error('[Discord NET] Diagnostic probe crashed:', result.reason); });

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
