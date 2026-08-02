import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

const CATEGORIES: { name: string; emoji: string; commands: { name: string; description: string }[] }[] = [
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
      { name: '/nick', description: 'Change a member\'s nickname' },
      { name: '/temprole', description: 'Temporarily assign a role with a duration' },
    ],
  },
  {
    name: 'Channels',
    emoji: '📢',
    commands: [
      { name: '/purge', description: 'Bulk-delete messages (up to 100)' },
      { name: '/purgebots', description: 'Delete bot messages from a channel' },
      { name: '/lock', description: 'Lock a channel so members can\'t send messages' },
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
      { name: '.av [@user]', description: 'Show a user\'s full-size avatar (global + server)' },
      { name: '/afk', description: 'Set your AFK status with an optional reason' },
      { name: '/remindme', description: 'Set a reminder for yourself' },
      { name: '/poll', description: 'Create a poll with up to 5 choices' },
      { name: '/snipe', description: 'Show the last deleted message in a channel' },
      { name: '/editsnipe', description: 'Show the last edited message in a channel' },
      { name: '/userinfo', description: 'View detailed info about a member' },
      { name: '/serverinfo', description: 'View info about this server' },
      { name: '/autoresponder', description: 'Manage auto-response triggers' },
      { name: '/setprefix', description: 'Change the bot\'s prefix command prefix' },
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

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all bot commands organised by category')
    .addStringOption(o =>
      o.setName('category')
        .setDescription('Show commands for a specific category only')
        .addChoices(
          ...CATEGORIES.map(c => ({ name: `${c.emoji} ${c.name}`, value: c.name.toLowerCase() })),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const filter = interaction.options.getString('category');
    const selected = filter
      ? CATEGORIES.filter(c => c.name.toLowerCase() === filter)
      : CATEGORIES;

    if (selected.length === 0) {
      await interaction.editReply('❌ Unknown category.');
      return;
    }

    const embeds = selected.map(cat =>
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`${cat.emoji} ${cat.name}`)
        .setDescription(
          cat.commands.map(cmd => `\`${cmd.name}\` — ${cmd.description}`).join('\n'),
        ),
    );

    // Discord allows up to 10 embeds per message — send the overview as content text
    if (!filter) {
      const overview =
        `## 📖 Bot Commands\n` +
        `Use \`/help category:<name>\` to filter to one section.\n\n` +
        CATEGORIES.map(c => `${c.emoji} **${c.name}** — ${c.commands.length} commands`).join('\n');
      await interaction.editReply({ content: overview, embeds });
    } else {
      await interaction.editReply({ embeds });
    }
  },
};
