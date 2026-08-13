import { Client, GatewayIntentBits, Collection, Partials, REST, Routes } from 'discord.js';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function ensureYtDlp(): Promise<void> {
  const candidates = [
    '/home/runner/.local/bin/yt-dlp',
    '/home/user/.local/bin/yt-dlp',
    '/app/.local/bin/yt-dlp',
    '/tmp/yt-dlp',
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) {
    console.log(`✅ yt-dlp found at ${found}`);
    return;
  }
  const target = (() => {
    for (const p of candidates) {
      try {
        const dir = p.substring(0, p.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        return p;
      } catch {}
    }
    return '/tmp/yt-dlp';
  })();
  console.log(`⬇️ Downloading yt-dlp to ${target}...`);
  try {
    await execAsync(`curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${target}"`);
    chmodSync(target, 0o755);
    const { stdout } = await execAsync(`"${target}" --version`);
    console.log(`✅ yt-dlp ${stdout.trim()} installed at ${target}`);
  } catch (err) {
    console.error('⚠️ Could not install yt-dlp — music commands will not work:', err);
  }
}

const port = process.env.PORT ?? 3000;
createServer((_, res) => res.end('OK')).listen(port);

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
client.on('error', err => console.error('[Discord error]', err.message));

// CRITICAL: log into Discord before loading command modules. Some music modules
// perform network work during import, which previously delayed login long enough
// for Render to replace the instance.
try {
  await client.login(token);
  console.log(`✅ Logged in as ${client.user?.tag}`);
} catch (err) {
  console.error('[Discord login failed]', err);
  process.exit(1);
}

// Everything below is intentionally loaded only after Discord is online.
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

void ensureYtDlp();
void primeHelpApplicationEmojis(client);

try {
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
  console.error('[Slash command sync error]', err);
}
