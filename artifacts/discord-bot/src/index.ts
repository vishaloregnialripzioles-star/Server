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

// Use Node's native HTTPS client for Discord REST command sync. The discord.js
// REST manager's requests to api.discord.com have stalled in this Render runtime,
// while native HTTPS is already used successfully by the Gateway diagnostics.
const directDiscordApi = async (method: string, route: string, body?: unknown): Promise<any> => {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return await new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: 'discord.com',
      port: 443,
      path: '/api/v10' + route,
      method,
      headers: {
        Authorization: 'Bot ' + token,
        'User-Agent': 'SparxieBot/1.0 (Discord command sync)',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}),
      },
      timeout: 25000,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed: any = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch {}
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          const detail = typeof parsed === 'object' && parsed ? JSON.stringify(parsed) : String(parsed ?? '');
          const error: any = new Error(`Discord REST ${method} ${route} returned HTTP ${status}: ${detail.slice(0, 1200)}`);
          error.status = status;
          error.retryAfter = Number(response.headers['retry-after'] ?? (typeof parsed === 'object' && parsed ? parsed.retry_after : NaN));
          error.cloudflare1015 = /1015/.test(detail);
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Native Discord REST request timed out: ${method} ${route}`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

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
    const { Routes } = await import('discord.js');
    const route = target === 'guild'
      ? Routes.applicationGuildCommands(applicationId, configuredGuildId!)
      : Routes.applicationCommands(applicationId);
    console.log(`📋 Registering slash commands (${commandData.length} total; ${primaryData.length} in ${target} scope; ${overflowData.length} guild-scoped overflow): ${commandNames.join(', ')}`);
    console.log(`🔐 Slash sync target: ${target}${target === 'guild' ? ` (${configuredGuildId})` : ' (global)'}`);
    if (overflowData.length) {
      console.warn('[Slash sync] Discord global limit is 100. Overflow will be registered as guild commands: ' + overflowData.map(c => c.name).join(', '));
      if (configuredGuildId) console.warn('[Slash sync] DISCORD_GUILD_ID was set, but the command count exceeds 100; using global+guild overflow so no command is dropped.');
    }

    let registered: any[] = [];
    let primarySyncCompleted = false;
    const normalizeOption = (option: any): any => ({
      type: option.type,
      name: option.name,
      description: option.description,
      required: option.required ?? false,
      choices: option.choices?.map((choice: any) => ({ name: choice.name, value: choice.value })),
      options: option.options?.map(normalizeOption),
      autocomplete: option.autocomplete ?? false,
      channel_types: option.channel_types,
      min_value: option.min_value,
      max_value: option.max_value,
      min_length: option.min_length,
      max_length: option.max_length,
    });
    const normalizeCommand = (command: any): any => ({
      type: command.type ?? 1,
      name: command.name,
      description: command.description,
      options: (command.options ?? []).map(normalizeOption),
      default_member_permissions: command.default_member_permissions ?? null,
      dm_permission: command.dm_permission ?? true,
      nsfw: command.nsfw ?? false,
    });
    const sameCommands = (left: any[], right: any[]): boolean => {
      const normalizeList = (items: any[]) => items.map(normalizeCommand)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return JSON.stringify(normalizeList(left)) === JSON.stringify(normalizeList(right));
    };
    try {
      // Read before writing. Repeated bulk overwrites from every Render restart
      // were contributing to Discord/Cloudflare rate limits even when definitions
      // had not changed. Never issue a PUT when Discord cannot be queried.
      let existing: any[] | null = null;
      try {
        existing = await directDiscordApi('GET', route) as any[];

      } catch (readError: any) {
        const status = readError?.status ?? 'unknown';
        const retryAfter = Number(readError?.retryAfter);
        const hasRetryAfter = Number.isFinite(retryAfter) && retryAfter > 0;
        console.error('[Slash sync] Could not read existing commands; avoiding a risky overwrite:', {
          status,
          retryAfter: readError?.retryAfter ?? 'not provided',
          message: readError?.message ?? String(readError),
        });
        if (status === 429 || readError?.cloudflare1015) {
          if (hasRetryAfter && retryAfter > 120) {
            // Cloudflare 1015 can block the source IP for hours. Never clamp
            // Retry-After down to a short delay; that would retry into the same
            // block and make the situation worse.
            console.warn(`[Slash sync] Discord/Cloudflare requested a ${retryAfter}s cooldown. Skipping retries and all command writes for this startup.`);
          } else {
            const waitMs = hasRetryAfter ? Math.max(1_000, retryAfter * 1000 + 1_000) : 35_000;
            console.warn(`[Slash sync] Rate limit detected; waiting ${Math.ceil(waitMs / 1000)}s before one read-only retry.`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            try {
              existing = await directDiscordApi('GET', route) as any[];
            } catch (retryError: any) {
              console.error('[Slash sync] Read-only retry failed; skipping command writes for this startup:', {
                status: retryError?.status ?? 'unknown',
                retryAfter: retryError?.retryAfter ?? 'not provided',
                message: retryError?.message ?? String(retryError),
              });
            }
          }
        }
      }

      if (existing !== null) {
        if (sameCommands(existing, primaryData)) {
          registered = existing;
          primarySyncCompleted = true;
          console.log(`✅ Slash commands already match Discord (${registered.length} ${target}); skipped unnecessary overwrite.`);
        } else {
          console.log(`[Slash sync] Definitions differ; sending one registration PUT for ${primaryData.length} ${target} commands...`);
          registered = await directDiscordApi('PUT', route, primaryData) as any[];
          primarySyncCompleted = true;
          console.log(`✅ Synced ${registered.length} ${target} slash commands${target === 'guild' ? ` to guild ${configuredGuildId}` : ''}`);
        }
      } else {
        console.warn('[Slash sync] Registration was skipped because the current command list could not be read safely.');
      }
    } catch (error: any) {
      console.error('[Slash sync] Command synchronization failed:', {
        status: error?.status ?? 'unknown',
        retryAfter: error?.retryAfter ?? 'not provided',
        message: error?.message ?? String(error),
        code: error?.code ?? 'unknown',
      });
    }

    if (primarySyncCompleted) {
      const registeredNames = registered.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
      const primaryNames = primaryData.map(command => String(command.name)).sort((a,b)=>a.localeCompare(b));
      const missing = primaryNames.filter(name => !registeredNames.includes(name));
      const extra = registeredNames.filter(name => !primaryNames.includes(name));
      if (missing.length) console.error(`❌ Discord registration missing from primary scope: ${missing.join(', ')}`);
      if (extra.length) console.warn(`⚠️ Discord has extra commands in primary scope: ${extra.join(', ')}`);
      console.log(`🔎 Slash command verification: ${registeredNames.length}/${primaryNames.length} present in primary scope`);
    }

    if (overflowData.length && primarySyncCompleted) {
      const knownNames = new Set(commandNames);
      const syncOverflowForGuild = async (targetGuildId: string): Promise<void> => {
        const guildRoute = Routes.applicationGuildCommands(applicationId, targetGuildId);
        const existing = await directDiscordApi('GET', guildRoute) as any[];
        // Preserve unrelated guild-only commands, remove stale copies of this
        // bot's known commands, then add the overflow commands for this guild.
        const retained = existing.filter(command => !knownNames.has(String(command.name)));
        const payload = [...retained, ...overflowData];
        if (payload.length > 100) throw new Error(`Guild ${targetGuildId} has too many unrelated guild commands to add overflow safely.`);
        if (sameCommands(existing, payload)) {
          console.log(`✅ Guild overflow already matches for ${targetGuildId}; skipped overwrite.`);
          return;
        }
        await directDiscordApi('PUT', guildRoute, payload);
        console.log(`✅ Synced guild overflow for ${targetGuildId}: ${overflowData.map(c => c.name).join(', ')}`);
      };
      const guildsToSync = configuredGuildId
        ? [client.guilds.cache.get(configuredGuildId)].filter(Boolean) as any[]
        : [...client.guilds.cache.values()];
      for (const guild of guildsToSync) {
        try {
          await syncOverflowForGuild(guild.id);
        } catch (error: any) {
          console.error(`[Slash sync] Could not register guild overflow for ${guild.id}:`, error);
          if (error?.status === 429 || error?.cloudflare1015) {
            console.warn('[Slash sync] Stopping overflow writes after a rate-limit response.');
            break;
          }
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
