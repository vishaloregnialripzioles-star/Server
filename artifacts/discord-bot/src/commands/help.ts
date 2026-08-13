import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type Guild,
} from 'discord.js';
import type { Command } from '../types.js';

export const HELP_SELECT_CUSTOM_ID = 'sparxie_help_category';

const FALLBACK_EMOJIS: Record<string, string> = {
  Setup: '⚙️',
  Moderation: '🔨',
  Channels: '📢',
  Restrictions: '🚫',
  Utility: '🛠️',
  Leveling: '📈',
  Tickets: '🎫',
  Games: '🎮',
  Fun: '🎉',
  Giveaways: '🎁',
  Music: '🎵',
};

const EMOJI_KEYWORDS: Record<string, string[]> = {
  Setup: ['setup', 'gear', 'config', 'settings'],
  Moderation: ['mod', 'moderation', 'hammer', 'ban', 'shield'],
  Channels: ['channel', 'megaphone', 'announce'],
  Restrictions: ['restrict', 'block', 'ban', 'stop', 'no'],
  Utility: ['utility', 'tool', 'wrench', 'tools'],
  Leveling: ['level', 'xp', 'rank', 'chart', 'graph'],
  Tickets: ['ticket', 'support'],
  Games: ['game', 'gaming', 'controller'],
  Fun: ['fun', 'party', 'laugh'],
  Giveaways: ['giveaway', 'gift', 'present'],
  Music: ['music', 'note', 'song'],
};

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return h;
}

function getAnimatedEmoji(guild: Guild | null | undefined, category: string): any {
  const fallback = FALLBACK_EMOJIS[category] ?? '✨';
  const animated = guild?.emojis.cache.filter(emoji => emoji.animated) ?? new Map();
  const list = [...animated.values()];
  if (!list.length) return fallback;

  const keywords = EMOJI_KEYWORDS[category] ?? [];
  const matching = list.filter(emoji => {
    const name = (emoji.name ?? '').toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  });

  if (matching.length) return matching[Math.abs(hash(category)) % matching.length];
  return list[Math.abs(hash(`sparxie:${category}`)) % list.length];
}

function emojiText(guild: Guild | null | undefined, category: string): string {
  const emoji = getAnimatedEmoji(guild, category);
  return typeof emoji === 'string' ? emoji : emoji.toString();
}

function emojiOption(guild: Guild | null | undefined, category: string): any {
  const emoji = getAnimatedEmoji(guild, category);
  if (typeof emoji === 'string') return emoji;
  return {
    id: emoji.id,
    name: emoji.name ?? category,
    animated: emoji.animated ?? true,
  };
}

export const HELP_CATEGORIES: {
  name: string;
  emoji: string;
  commands: { name: string; description: string }[];
}[] = [
  {
    name: 'Setup',
    emoji: '⚙️',
    commands: [
      { name: '/setup logs', description: 'Set moderation log channel' },
      { name: '/setup muterole', description: 'Set the Muted role' },
      { name: '/setup jailrole', description: 'Set the Jail role' },
      { name: '/setup chatbanrole', description: 'Set the Chat Ban role' },
      { name: '/setup ticketcategory', description: 'Set ticket category ID' },
      { name: '/setup starboard', description: 'Set starboard channel' },
      { name: '/setup levelchannel', description: 'Set level-up announcement channel' },
      { name: '/setup snipe', description: 'Enable or disable snipe' },
      { name: '/setup view', description: 'View current server config' },
      { name: '/levelconfig', description: 'Customise the level-up embed (admin only)' },
    ],
  },
  {
    name: 'Moderation',
    emoji: '🔨',
    commands: [
      { name: '/ban', description: 'Permanently ban a member' },
      { name: '/kick', description: 'Kick a member from the server' },
      { name: '/mute', description: 'Mute a member for a set duration (s/m/h/d)' },
      { name: '/unmute', description: 'Remove mute from a member' },
      { name: '/timeout', description: 'Apply a Discord timeout (up to 28 days)' },
      { name: '/warn', description: 'Issue a warning to a member' },
      { name: '/warnings', description: 'View all warnings for a member' },
      { name: '/clearwarns', description: 'Clear warnings for a member' },
      { name: '/nick', description: "Change a member's nickname" },
      { name: '/temprole', description: 'Temporarily assign a role with a duration' },
    ],
  },
  {
    name: 'Channels',
    emoji: '📢',
    commands: [
      { name: '/purge', description: 'Bulk-delete messages (up to 100)' },
      { name: '/purgebots', description: 'Delete bot messages from a channel' },
      { name: '/lock', description: "Lock a channel so members can't send messages" },
      { name: '/unlock', description: 'Unlock a previously locked channel' },
      { name: '/slowmode', description: 'Set slowmode delay on a channel' },
    ],
  },
  {
    name: 'Restrictions',
    emoji: '🚫',
    commands: [
      { name: '/chatban', description: 'Prevent a member from sending messages' },
      { name: '/unchatban', description: 'Remove a chat ban' },
      { name: '/jail', description: 'Move a member to the jail role' },
      { name: '/unjail', description: 'Release a member from jail' },
    ],
  },
  {
    name: 'Utility',
    emoji: '🛠️',
    commands: [
      { name: '.av [@user]', description: "Show a user's full-size avatar (global + server)" },
      { name: '/afk', description: 'Set your AFK status with an optional reason' },
      { name: '/remindme', description: 'Set a reminder for yourself' },
      { name: '/poll', description: 'Create a poll with up to 5 choices' },
      { name: '/snipe', description: 'Show the last deleted message in a channel' },
      { name: '/editsnipe', description: 'Show the last edited message in a channel' },
      { name: '/userinfo', description: 'View detailed info about a member' },
      { name: '/serverinfo', description: 'View info about this server' },
      { name: '/autoresponder', description: 'Manage auto-response triggers' },
      { name: '/setprefix', description: "Change the bot's prefix command prefix" },
    ],
  },
  {
    name: 'Leveling',
    emoji: '📈',
    commands: [
      { name: '/rank', description: 'View your level, XP, and server rank' },
      { name: '/leaderboard', description: 'Show the top members by XP and level' },
    ],
  },
  {
    name: 'Tickets',
    emoji: '🎫',
    commands: [
      { name: '/ticket', description: 'Open a support ticket' },
      { name: '/closeticket', description: 'Close a ticket channel' },
      { name: '/ticketpanel', description: 'Post a ticket creation panel in a channel' },
    ],
  },
  {
    name: 'Games',
    emoji: '🎮',
    commands: [
      { name: '/game <game>', description: 'Start a server game and play with other members' },
      { name: '/games', description: 'View the available games, player limits, and rewards' },
      { name: '/coinleaderboard', description: 'View the ⚡ sparks leaderboard' },
      { name: '/shop', description: 'Open the server shop and spend ⚡ sparks on roles and colour customisation' },
      { name: '.buy role <name>', description: 'Buy a configured shop role using ⚡ sparks' },
      { name: '.buy colour <name>', description: 'Buy a configured colour role using ⚡ sparks' },
    ],
  },
  {
    name: 'Fun',
    emoji: '🎉',
    commands: [
      { name: '/roast', description: 'Roast a member with a random burn' },
      { name: '/gay', description: 'Rate how gay someone is' },
      { name: '/pro', description: 'Rate how pro someone is at something' },
      { name: '/noob', description: 'Rate how much of a noob someone is' },
      { name: '/ship', description: 'Ship two users together' },
    ],
  },
  {
    name: 'Giveaways',
    emoji: '🎁',
    commands: [
      { name: '/giveaway create', description: 'Create a giveaway panel with Enter button (Admin)' },
      { name: '/giveaway end', description: 'Force-end an active giveaway immediately (Admin)' },
      { name: '/giveaway reroll', description: 'Pick a new winner for an ended giveaway (Admin)' },
      { name: '/giveaway leave', description: 'Leave a giveaway you have entered' },
      { name: '/giveaway participants', description: 'View all participants of a giveaway' },
      { name: '/giveaway remove', description: 'Remove a participant from a giveaway (Admin)' },
    ],
  },
  {
    name: 'Music',
    emoji: '🎵',
    commands: [
      { name: '.music play', description: 'Play a song by name or URL (prefix command)' },
      { name: '.music skip', description: 'Skip the current song' },
      { name: '.music stop', description: 'Stop music and disconnect' },
      { name: '.music pause / resume', description: 'Pause or resume playback' },
      { name: '.music queue', description: 'View the current queue' },
      { name: '.music nowplaying', description: 'Show the currently playing track' },
    ],
  },
];

type HelpCategory = (typeof HELP_CATEGORIES)[number];

export function findHelpCategory(category?: string | null): HelpCategory | undefined {
  if (!category || category === 'all') return undefined;
  return HELP_CATEGORIES.find(c => c.name.toLowerCase() === category.toLowerCase());
}

export const HELP_COMMAND_COUNT = HELP_CATEGORIES.reduce(
  (total, category) => total + category.commands.length,
  0,
);

function formatCategoryList(guild?: Guild | null): string {
  return HELP_CATEGORIES
    .map(c => `${emojiText(guild, c.name)} **${c.name}**`)
    .join('\n');
}

export function buildHelpEmbed(category?: string | null, prefix = '/', guild?: Guild | null): EmbedBuilder {
  const selected = findHelpCategory(category);
  const isGames = selected?.name === 'Games';
  const headerEmoji = selected ? emojiText(guild, selected.name) : emojiText(guild, 'Fun');
  const embed = new EmbedBuilder()
    .setColor(0x12d9d3)
    .setAuthor({ name: `${headerEmoji} Sparxie Help Menu` })
    .setTitle(selected ? `${headerEmoji} ${selected.name}` : '✨ Welcome to Sparxie!')
    .setDescription(
      selected
        ? isGames
          ? `🎮 **Server Games**\nPlay games with other members, win **⚡ sparks**, and use your sparks to unlock server rewards.\n\n🏆 **Win games → earn ⚡ sparks → spend sparks in the server shop → get roles and profile colour customisation.**\n\nGames support different player limits depending on the game, and multiplayer games can be joined by other members. Use **Global** in supported game lobbies to find players from other servers.\n\n**Game commands:**\n\`${prefix}game <game>\` to start a game · \`${prefix}games\` to browse games and rewards\n\n**Sparks & Shop:**\n\`${prefix}coinleaderboard\` to see the richest players · \`${prefix}shop\` to open the shop\n\n**Prefix purchases:** \`${prefix}buy role <name>\` · \`${prefix}buy colour <name>\``
          : `Here are the commands in the **${selected.name}** category.\nChoose another category below to explore more.`
        : `Hello! It's **Sparxie**, your ultimate server management and utility bot.\nEnhance your server's security, management, and entertainment with our comprehensive toolkit.\n\n` +
          `🔹 **Prefix:** \`${prefix}\`\n` +
          `🔹 **Total Commands:** \`${HELP_COMMAND_COUNT}\`\n` +
          `🔹 **Type** \`${prefix}help <category>\` **to view commands by section.**\n\n` +
          '`<>` — Required  |  `[]` — Optional\n\n' +
          '**Select a category below to view commands:**\n' +
          formatCategoryList(guild) +
          '\n\nSupport Server  |  Invite Sparxie',
    )
    .setFooter({ text: 'Sparxie • Fast, friendly, and made for your server' });

  if (selected) {
    embed.addFields({
      name: `${headerEmoji} ${selected.name}`,
      value: selected.commands
        .map(cmd => `\`${cmd.name}\` — ${cmd.description}`)
        .join('\n'),
    });
  }

  return embed;
}

export function buildHelpMenu(category?: string | null, guild?: Guild | null): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_SELECT_CUSTOM_ID)
      .setPlaceholder('Select a category...')
      .addOptions(
        {
          label: 'All commands',
          description: 'See every Sparxie command category',
          value: 'all',
          default: !category || category === 'all',
        },
        ...HELP_CATEGORIES.map(c => ({
          label: c.name,
          description: `${c.commands.length} command${c.commands.length === 1 ? '' : 's'}`,
          value: c.name.toLowerCase(),
          default: category?.toLowerCase() === c.name.toLowerCase(),
          emoji: emojiOption(guild, c.name),
        })),
      ),
  );
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all bot commands organised by category')
    .addStringOption(o =>
      o.setName('category')
        .setDescription('Show commands for a specific category only')
        .addChoices(
          ...HELP_CATEGORIES.map(c => ({ name: `${c.emoji} ${c.name}`, value: c.name.toLowerCase() })),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const filter = interaction.options.getString('category');
    if (filter && !findHelpCategory(filter)) {
      await interaction.editReply('❌ Unknown category.');
      return;
    }

    await interaction.editReply({
      embeds: [buildHelpEmbed(filter, '/', interaction.guild)],
      components: [buildHelpMenu(filter, interaction.guild)],
    });
  },
};
