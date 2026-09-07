import type { Client } from 'discord.js';
import { EmbedBuilder, Events } from 'discord.js';
import { findBloxValue } from './commands/bloxvalue.js';

const ICONS = new Map<string, string>();
const BLOCKED_ICON_NAMES = new Set(['Blade', 'Rabid Dog Blade', 'Dog Blade']);

function iconUrl(name: string): string | undefined {
  if (BLOCKED_ICON_NAMES.has(name)) return undefined;
  const key = name.toLowerCase();
  const cached = ICONS.get(key);
  if (cached) return cached;
  // Blox Fruits Wiki uses canonical item-image filenames; Discord follows the redirect.
  const file = encodeURIComponent(`${name}.png`);
  const url = `https://blox-fruits.fandom.com/wiki/Special:Redirect/file/${file}`;
  ICONS.set(key, url);
  return url;
}

const REGISTERED = Symbol.for('sparxie.bloxvalue.icons.registered');

export function registerBloxValueIconEvents(client: Client) {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'bloxvalue') return;
    setTimeout(async () => {
      try {
        const query = interaction.options.getString('item', true);
        const entry = findBloxValue(query);
        if (!entry || !interaction.isRepliable()) return;
        const url = iconUrl(entry.name);
        if (!url) return;
        const reply: any = await interaction.fetchReply();
        const existing = reply.embeds?.[0];
        if (!existing) return;
        const embed = EmbedBuilder.from(existing);
        embed.setThumbnail(url);
        await reply.edit({ embeds: [embed] });
      } catch (error) {
        console.warn('[BloxValueIcons] Could not attach item icon:', error);
      }
    }, 700);
  });
}
