import { Client, GatewayIntentBits, Collection, Partials, REST, Routes } from 'discord.js';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from './types.js';
import { allCommands } from './commands/index.js';
import { registerEvents } from './events/index.js';
import { startLoops } from './loops.js';

const execAsync = promisify(exec);

// ── Auto-install yt-dlp if missing (needed for music streaming) ──────────────
async function ensureYtDlp(): Promise<void> {
  const candidates = [
    '/home/runner/.local/bin/yt-dlp',
    '/home/user/.local/bin/yt-dlp',
    '/app/.local/bin/yt-dlp',        // Render
    '/tmp/yt-dlp',                   // fallback writable on any platform
  ];

  const found = candidates.find(p => existsSync(p));
  if (found) {
    console.log(`✅ yt-dlp found at ${found}`);
    return;
  }

  // Pick the first writable-parent candidate, fall back to /tmp/yt-dlp
  const target = (() => {
    for (const p of candidates) {
      try {
        const dir = p.substring(0, p.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        return p;
      } catch { /* try next */ }
    }
    return '/tmp/yt-dlp';
  })();

  console.log(`⬇️  Downloading yt-dlp to ${target}...`);
  try {
    await execAsync(
      `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${target}"`,
    );
    chmodSync(target, 0o755);
    const { stdout } = await execAsync(`"${target}" --version`);
    console.log(`✅ yt-dlp ${stdout.trim()} installed at ${target}`);
  } catch (err) {
    console.error('⚠️  Could not install yt-dlp — music commands will not work:', err);
  }
}

// ── Render web service: keep the HTTP port open ──────────────────────────────
const port = process.env.PORT ?? 3000;
createServer((_, res) => res.end('OK')).listen(port);

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');

// Download yt-dlp before logging in so music is ready from the start
await ensureYtDlp();

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

client.commands = new Collection<string, Command>();
for (const command of allCommands) {
  client.commands.set(command.data.name, command);
}

// Prevent unhandled Discord API errors from crashing the process
client.on('error', err => console.error('[Discord error]', err.message));

registerEvents(client);
startLoops(client);

await client.login(token);

// ── Always sync the current slash-command definitions on startup ─────────────
// This is important for Render: changing a command in source code does not
// change the already-registered Discord command until Discord receives the
// new command schema. In particular, /giveaway create must have NO options.
try {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const commandData = allCommands.map(command => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId && /^\d+$/.test(guildId)) {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), {
      body: commandData,
    });
    console.log(`✅ Synced ${commandData.length} slash commands to guild ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commandData,
    });
    console.log(`✅ Synced ${commandData.length} global slash commands`);
  }
} catch (err) {
  console.error('[Slash command sync error]', err);
}
