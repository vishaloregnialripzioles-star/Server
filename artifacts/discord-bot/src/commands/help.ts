import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type Client,
} from 'discord.js';
import type { Command } from '../types.js';

export const HELP_SELECT_CUSTOM_ID = 'sparxie_help_category';

export const HELP_CATEGORIES = [
  'Setup',
  'Moderation',
  'Channels',
  'Restrictions',
  'Utility',
  'Leveling',
  'Tickets',
  'Games',
  'Fun',
  'Giveaways',
  'Music',
] as const;

type HelpCategory = typeof HELP_CATEGORIES[number];

// Keep the original Sparxie help layout, while mapping every command to its category.
const CATEGORY_BY_COMMAND: Record<string, HelpCategory> = {
  setup: 'Setup',
  setprefix: 'Setup',
  welcome: 'Setup',
  greet: 'Setup',

  ban: 'Moderation',
  kick: 'Moderation',
  mute: 'Moderation',
  unmute: 'Moderation',
  timeout: 'Moderation',
  warn: 'Moderation',
  warnings: 'Moderation',
  clearwarns: 'Moderation',
  purge: 'Moderation',
  purgebots: 'Moderation',
  nick: 'Moderation',
  createrole: 'Moderation',
  roleassign: 'Moderation',
  antinuke: 'Moderation',
  extraowner: 'Moderation',
  recovery: 'Moderation',

  lock: 'Restrictions',
  unlock: 'Restrictions',
  slowmode: 'Restrictions',
  chatban: 'Restrictions',
  unchatban: 'Restrictions',
  jail: 'Restrictions',
  unjail: 'Restrictions',

  poll: 'Channels',
  embed: 'Channels',

  afk: 'Utility',
  remindme: 'Utility',
  snipe: 'Utility',
  editsnipe: 'Utility',
  userinfo: 'Utility',
  serverinfo: 'Utility',
  temprole: 'Utility',
  autoresponder: 'Utility',
  help: 'Utility',

  rank: 'Leveling',
  leaderboard: 'Leveling',
  levelconfig: 'Leveling',

  ticket: 'Tickets',
  closeticket: 'Tickets',
  ticketpanel: 'Tickets',

  gamepolicy: 'Games',
  'game-policy': 'Games',
  games: 'Games',
  sparks: 'Games',
  coinleaderboard: 'Games',
  shop: 'Games',

  roast: 'Fun',
  gay: 'Fun',
  pro: 'Fun',
  noob: 'Fun',
  ship: 'Fun',

  giveaway: 'Giveaways',
  music: 'Music',
};

const FALLBACK_EMOJIS: Record<HelpCategory, string> = {
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

// Exact Application Emoji names uploaded to the Sparxie application.
// These are resolved to real Discord emoji mentions, including animated emojis.
const APPLICATION_EMOJI_NAMES: Record<HelpCategory, string> = {
  Setup: 'Sparxie_setup',
  Moderation: 'Sparxie_mod',
  Channels: 'Sparxie_Channels',
  Restrictions: 'Sparxie_Restrictions',
  Utility: 'Sparxie_Utility',
  Leveling: 'Sparxie_Level',
  Tickets: 'Sparxie_ticket',
  Games: 'Sparxie_games',
  Fun: 'Sparxie_fun',
  Giveaways: 'Sparxie_giveaway',
  Music: 'Sparxie_music',
};

const HELP_BULLET_EMOJI_NAME = 'Sparxie_help';

function findApplicationEmoji(client: Client, name: string): string | null {
  const emojis = client.application?.emojis?.cache;
  if (!emojis) return null;
  const emoji = emojis.find(e => e.name?.toLowerCase() === name.toLowerCase());
  if (!emoji?.id || !emoji.name) return null;
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
}

export function getHelpEmoji(client?: Client): string {
  if (client) return findApplicationEmoji(client, HELP_BULLET_EMOJI_NAME) ?? '✨';
  return '✨';
}

export function getCategoryEmoji(category: HelpCategory, client?: Client): string {
  if (client) {
    const emoji = findApplicationEmoji(client, APPLICATION_EMOJI_NAMES[category]);
    if (emoji) return emoji;
  }
  return FALLBACK_EMOJIS[category];
}

export function findHelpCategory(value: string): HelpCategory | null {
  const normalized = value.trim().toLowerCase();
  return HELP_CATEGORIES.find(category => category.toLowerCase() === normalized) ?? null;
}

function commandJson(command: Command): any {
  return command.data.toJSON();
}

function collectCommandEntries(client?: Client): Array<{ category: HelpCategory; name: string; description: string }> {
  if (!client?.commands) return [];

  const entries: Array<{ category: HelpCategory; name: string; description: string }> = [];

  for (const command of client.commands.values()) {
    const json = commandJson(command);
    const commandName = String(json.name ?? '').trim();
    if (!commandName) continue;

    const category = CATEGORY_BY_COMMAND[commandName.toLowerCase()] ?? 'Utility';
    const description = String(json.description ?? '').trim() || 'No description provided.';

    entries.push({ category, name: `.${commandName}`, description });

    const walkOptions = (options: any[], prefix: string): void => {
      for (const option of options ?? []) {
        if (option.type === 1) {
          entries.push({
            category,
            name: `.${prefix} ${option.name}`,
            description: String(option.description ?? description),
          });
        } else if (option.type === 2) {
          walkOptions(option.options ?? [], `${prefix} ${option.name}`);
        }
      }
    };

    walkOptions(json.options ?? [], commandName);
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function formatEntries(entries: Array<{ name: string; description: string }>): string[] {
  const lines = entries.map(entry => `\`${entry.name}\` — ${entry.description}`);
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (!current || (current.length + line.length + 1) <= 1024) {
      current = current ? `${current}\n${line}` : line;
    } else {
      chunks.push(current);
      current = line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildHelpEmbed(category: string = 'all', client?: Client): EmbedBuilder {
  const selected = category.toLowerCase() === 'all' ? 'all' : findHelpCategory(category);
  const helpEmoji = getHelpEmoji(client);
  const entries = collectCommandEntries(client);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${helpEmoji} Sparxie Help Menu`)
    .setDescription(
      `Welcome to **Sparxie**!\n\n` +
      `Hello! It's **Sparxie**, your ultimate server management and utility bot.\n` +
      `Enhance your server's security, management, and entertainment with our comprehensive toolkit.\n\n` +
      `🔹 **Prefix:** \`.\`\n` +
      `🔹 **Total Commands:** **${entries.length}**\n` +
      `🔹 **Type** \`.help <category>\` **to view commands by section.**\n\n` +
      `\`<>\` — Required | \`[]\` — Optional\n\n` +
      `**Select a category below to view commands:**\n` +
      HELP_CATEGORIES.map(cat => `${getCategoryEmoji(cat, client)} **${cat}**`).join('\n'),
    );

  if (selected !== 'all' && selected) {
    const categoryEntries = entries.filter(e => e.category === selected);
    const chunks = formatEntries(categoryEntries.map(e => ({ name: e.name, description: e.description })));
    embed.setTitle(`${getCategoryEmoji(selected, client)} ${selected} Commands`);
    embed.setDescription(
      chunks.length
        ? `Prefix: \`.\`\n\n${chunks.join('\n\n')}`
        : 'No commands are currently registered in this category.',
    );
  } else if (selected !== 'all') {
    embed.setDescription('❌ Unknown help category. Use the menu below to choose a valid category.');
  }

  embed.setFooter({ text: 'Sparxie • Fast, friendly, and made for your server' });
  return embed;
}

export function buildHelpMenu(selected: string = 'all', client?: Client): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(HELP_SELECT_CUSTOM_ID)
    .setPlaceholder('Select a category to view commands')
    .addOptions({
      label: 'All Commands',
      value: 'all',
      description: 'View every Sparxie command',
      emoji: '📚',
      default: selected.toLowerCase() === 'all',
    }, ...HELP_CATEGORIES.map(category => ({
      label: category,
      value: category,
      description: `View all ${category.toLowerCase()} commands`,
      emoji: getCategoryEmoji(category, client),
      default: category.toLowerCase() === selected.toLowerCase(),
    })));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all Sparxie commands by category')
    .addStringOption(option =>
      option
        .setName('category')
        .setDescription('Choose a command category')
        .setRequired(false)
        .addChoices(
          { name: 'All Commands', value: 'all' },
          ...HELP_CATEGORIES.map(category => ({ name: category, value: category })),
        ),
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category') ?? 'all';
    const client = interaction.client;
    await interaction.reply({
      embeds: [buildHelpEmbed(category, client)],
      components: [buildHelpMenu(category, client)],
    });
  },
};
