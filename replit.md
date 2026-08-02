# Discord Bot

A full-featured Discord moderation and utility bot with 30 slash commands covering tickets, moderation, leveling, AFK, reminders, polls, starboard, and more.

## Replit Setup

On Replit, the bot runs via the **Discord Bot** workflow (configured in `.replit`). To set up from scratch:

1. Install dependencies: `pnpm install`
2. Add secrets via Replit's Secrets panel (see Required Secrets below):
   - `DISCORD_BOT_TOKEN` — required, bot will refuse to start without it
   - `DISCORD_CLIENT_ID` — required for slash command registration
   - `DISCORD_GUILD_ID` — optional but recommended for instant command registration
3. Start the **Discord Bot** workflow — it runs `pnpm --filter @workspace/discord-bot run dev`
4. Verify startup: the console should print `✅ Logged in as <BotName>#<discriminator>` and `📡 Serving N guild(s)`
5. Register slash commands once: `pnpm --filter @workspace/discord-bot run deploy`

### Verified working on Replit (Node.js 20, NixOS stable-25_05)

- Bot starts and connects to Discord ✅
- JSON guild data persists in `artifacts/discord-bot/data/` ✅
- Music (SoundCloud primary source) works ✅
- yt-dlp works ✅ (installed at startup)
- 48 slash commands registered globally ✅
- Welcome system with inline embeds, variables, `/greet`, and prefix equivalents ✅

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — start the bot
- `pnpm --filter @workspace/discord-bot run deploy` — register slash commands (run after adding new commands)
- `pnpm --filter @workspace/discord-bot run typecheck` — type-check the bot

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- discord.js v14 (slash commands, intents, partials)
- JSON file storage per guild (`artifacts/discord-bot/data/<guildId>.json`)
- tsx for direct TypeScript execution (no build step)

## Required Secrets

- `DISCORD_BOT_TOKEN` — bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID` — application client ID
- `DISCORD_GUILD_ID` — (optional) set for instant guild command registration instead of global

## Required Bot Permissions & Intents

In the Discord Developer Portal, enable these **Privileged Gateway Intents**:
- **Server Members Intent**
- **Message Content Intent**

Bot needs these **permissions** in your server:
- Manage Roles, Manage Channels, Manage Messages, Manage Nicknames
- Ban Members, Kick Members, Moderate Members
- Read Messages, Send Messages, Embed Links, Add Reactions, View Audit Log

## First-Time Setup (in Discord)

Run these slash commands in your server after inviting the bot:

```
/setup logs #channel          — set moderation log channel
/setup muterole @role         — set Muted role
/setup jailrole @role         — set Jail role
/setup chatbanrole @role      — set Chat Ban role
/setup ticketcategory <id>    — set ticket category ID
/setup starboard #channel     — set starboard channel
/setup levelchannel #channel  — set level-up announcement channel
```

## Commands Reference

| Category | Commands |
|---|---|
| **Setup** | `/setup` (logs, muterole, jailrole, chatbanrole, ticketcategory, starboard, levelchannel, snipe, view) |
| **Moderation** | `/ban`, `/kick`, `/mute`, `/unmute`, `/timeout`, `/warn`, `/warnings`, `/clearwarns` |
| **Channels** | `/purge`, `/purgebots`, `/lock`, `/unlock`, `/slowmode` |
| **Restrictions** | `/chatban`, `/unchatban`, `/jail`, `/unjail` |
| **Utility** | `/nick`, `/afk`, `/remindme`, `/poll`, `/snipe`, `/editsnipe` |
| **Info** | `/userinfo`, `/serverinfo`, `/rank` |
| **Advanced** | `/temprole`, `/ticket`, `/closeticket` |

## Where Things Live

- `artifacts/discord-bot/src/index.ts` — entry point, client setup
- `artifacts/discord-bot/src/commands/` — all slash commands (one file each)
- `artifacts/discord-bot/src/events/` — event handlers (messageCreate, reactions, deletes, etc.)
- `artifacts/discord-bot/src/storage.ts` — JSON file persistence
- `artifacts/discord-bot/src/loops.ts` — background loops (reminders, temp roles)
- `artifacts/discord-bot/src/utils.ts` — shared helpers (duration parsing, log sending, XP)
- `artifacts/discord-bot/data/` — runtime guild data (auto-created, gitignored)

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/discord-bot run deploy` after adding new commands
- Global command registration takes up to 1 hour to appear; set `DISCORD_GUILD_ID` secret for instant registration during development
- The Muted/Jail/ChatBan roles must have their permissions configured in Discord — the bot assigns the role but your server's channel overwrites control what it restricts
- Message Content Intent must be enabled in the Developer Portal or the AFK/leveling/snipe features won't work
