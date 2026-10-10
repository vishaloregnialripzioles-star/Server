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
    const loadedCommands = [...client.commands.values()];
    // Discord permits at most 100 global chat-input commands. A bulk overwrite
    // with 101+ commands is rejected in full, which can leave newly added commands
    // such as /hack missing. Keep the first 100 global and register overflow as
    // guild commands so every command remains available in every joined server.
    const commandByName = new Map<string, any>();
    const duplicateCommandNames = new Set<string>();
    for (const command of loadedCommands) {
      const name = String(command.data.toJSON().name);
      if (commandByName.has(name)) duplicateCommandNames.add(name);
      commandByName.set(name, command);
    }
    if (duplicateCommandNames.size) {
      console.error('[Slash sync] Duplicate command definitions detected; using the last loaded definition for: ' + [...duplicateCommandNames].sort().join(', '));
    }
    for (const [name, command] of commandByName) client.commands.set(name, command);
    const commandData = [...commandByName.values()].map(command => command.data.toJSON());
    const commandNames = commandData.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const overflowData = commandData.length > 100 ? commandData.slice(100) : [];
    const primaryData = overflowData.length ? commandData.slice(0, 100) : commandData;
    const configuredGuildId = guildId && /^\d+$/.test(guildId) ? guildId : undefined;
    // If we exceed Discord's global limit, use the global+guild split regardless
    // of DISCORD_GUILD_ID; otherwise preserve the configured guild-sync behavior.
    const target = overflowData.length ? 'global' : (configuredGuildId ? 'guild' : 'global');
    const applicationId = client.user!.id;
    const { REST, Routes } = await import('discord.js');
    const route = target === 'guild'
      ? Routes.applicationGuildCommands(applicationId, configuredGuildId!)
      : Routes.applicationCommands(applicationId);
    console.log(`📋 Registering slash commands (${commandData.length} total; ${primaryData.length} in ${target} scope; ${overflowData.length} guild-scoped overflow): ${commandNames.join(', ')}`);
    console.log(`🔐 Slash sync target: ${target}${target === 'guild' ? ` (${configuredGuildId})` : ' (global)'}`);
    if (overflowData.length) {
      console.warn('[Slash sync] Discord global limit is 100. Overflow will be registered as guild commands: ' + overflowData.map(c => c.name).join(', '));
      if (configuredGuildId) console.warn('[Slash sync] DISCORD_GUILD_ID was set, but the command count exceeds 100; using global+guild overflow so no command is dropped.');
    }

    const rest = new REST({ version: '10', retries: 2, timeout: 30000 }).setToken(token);
    let registered: any[] = [];
    try {
      // Do not make command registration depend on a preliminary GET. On this
      // Render instance that GET never completed, so slash sync silently stalled
      // before the PUT and Discord never received the current command definitions.
      // A single bounded bulk overwrite is the authoritative sync operation.
      console.log(`[Slash sync] Sending registration PUT for ${primaryData.length} ${target} commands...`);
      const syncTimeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Slash registration timed out after 35 seconds')), 35_000);
        timer.unref?.();
      });
      registered = await Promise.race([
        rest.put(route, { body: primaryData }) as Promise<any[]>,
        syncTimeout,
      ]);
    } catch (error: any) {
      const status = error?.status ?? error?.httpStatus ?? error?.rawError?.status;
      const retryAfter = error?.retryAfter ?? error?.rawError?.retry_after;
      console.error('[Slash sync] Discord registration PUT failed:', {
        status: status ?? 'unknown',
        retryAfter: retryAfter ?? 'not provided',
        message: error?.message ?? String(error),
        code: error?.code ?? 'unknown',
      });
      throw error;
    }
    console.log(`✅ Synced ${registered.length} ${target} slash commands${target === 'guild' ? ` to guild ${configuredGuildId}` : ''}`);

    const registeredNames = registered.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const primaryNames = primaryData.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
    const missing = primaryNames.filter(name => !registeredNames.includes(name));
    const extra = registeredNames.filter(name => !primaryNames.includes(name));
    if (missing.length) console.error(`❌ Discord registration missing from primary scope: ${missing.join(', ')}`);
    if (extra.length) console.warn(`⚠️ Discord has extra commands in primary scope: ${extra.join(', ')}`);
    console.log(`🔎 Slash command verification: ${registeredNames.length}/${primaryNames.length} present in primary scope`);

    if (overflowData.length) {
      const knownNames = new Set(commandNames);
      const syncOverflowForGuild = async (targetGuildId: string): Promise<void> => {
        const guildRoute = Routes.applicationGuildCommands(applicationId, targetGuildId);
        const existing = await rest.get(guildRoute) as any[];
        // Preserve unrelated guild-only commands, remove stale copies of this
        // bot's known commands, then add the overflow commands for this guild.
        const retained = existing.filter(command => !knownNames.has(String(command.name)));
        const payload = [...retained, ...overflowData];
        if (payload.length > 100) throw new Error(`Guild ${targetGuildId} has too many unrelated guild commands to add overflow safely.`);
        await rest.put(guildRoute, { body: payload });
        console.log(`✅ Synced guild overflow for ${targetGuildId}: ${overflowData.map(c => c.name).join(', ')}`);
      };
      for (const guild of client.guilds.cache.values()) {
        try {
          await syncOverflowForGuild(guild.id);
        } catch (error) {
          console.error(`[Slash sync] Could not register guild overflow for ${guild.id}:`, error);
        }
      }
      client.on('guildCreate', guild => {
        void syncOverflowForGuild(guild.id).catch(error => console.error(`[Slash sync] Could not register overflow for new guild ${guild.id}:`, error));
      });
    }
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
