import type { Client, Message } from 'discord.js';
import { Events } from 'discord.js';
import { loadGuild, claimMessageEvent } from './storage.js';
import { BLOX_VALUES, buildBloxValueEmbed, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';

// Keep the permanent-value table in sync with the current community tracker.
// These are trade estimates, not official Roblox/Robux prices.
const CURRENT_PERM_VALUES: Record<string, string> = {
  'West Dragon':'6.57B', 'East Dragon':'6.57B', 'Kitsune':'5.43B', 'Control':'5.43B',
  'Tiger':'4.29B', 'Yeti':'4.29B', 'Gas':'4.0B', 'Dough':'4.23B', 'Venom':'3.91B',
  'T-Rex':'3.84B', 'Gravity':'3.84B', 'Mammoth':'3.84B', 'Spirit':'3.84B', 'Shadow':'3.84B',
  'Lightning':'3.84B', 'Pain':'3.84B', 'Portal':'2.95B', 'Buddha':'1.91B', 'Blizzard':'2.95B',
  'Phoenix':'2.95B', 'Creation':'2.95B', 'Sound':'2.95B', 'Spider':'2.95B', 'Love':'2.95B',
  'Quake':'2.95B', 'Magma':'2.95B', 'Light':'2.95B', 'Ghost':'2.95B', 'Rubber':'2.95B',
  'Diamond':'2.95B', 'Eagle':'2.95B', 'Ice':'2.95B', 'Sand':'2.95B', 'Dark':'2.95B',
  'Flame':'2.95B', 'Spike':'2.95B', 'Smoke':'2.95B', 'Bomb':'2.95B', 'Spring':'2.95B',
  'Blade':'2.95B', 'Spin':'2.95B', 'Rocket':'2.95B',
};
for (const entry of BLOX_VALUES) {
  const perm = CURRENT_PERM_VALUES[entry.name];
  if (perm) entry.perm = perm;
}

// Meme-Meme is a limited item and currently trades around 4.5B.
const meme = BLOX_VALUES.find(entry => entry.name === 'Meme-Meme');
if (!meme) {
  BLOX_VALUES.push({name:'Meme-Meme', aliases:['meme-meme','meme meme','meme','memememe'], rarity:'Limited', type:'Skin', regular:'4.5B', perm:'—', beli:'—', demand:'7/10', trend:'Stable', bestFor:'Trading', obtain:'Limited release; tradeable now'});
}

const REGISTERED = Symbol.for('sparxie.bloxvalue.registered');

export function registerBloxValueEvents(client: Client): void {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;

  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild || !message.client.user) return;

      const guildData = loadGuild(message.guild.id);
      const channelId = guildData.config.bloxValueChannelId;
      if (!channelId || channelId !== message.channelId) return;
      if (!message.mentions.users.has(message.client.user.id)) return;

      // This listener is the sole owner of Blox-value mention messages.
      // The database-backed claim also prevents duplicate replies if two bot
      // processes happen to receive the same Discord message.
      if (!(await claimMessageEvent(`bloxvalue:${message.id}`))) return;

      const prefix = getGuildPrefix(message.guild.id);
      const query = message.content
        .replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '')
        .trim();
      if (!query || query.startsWith('/') || query.startsWith(prefix)) return;

      const entry = findBloxValue(query);
      if (!entry) return;

      await message.reply({
        embeds: [buildBloxValueEmbed(entry)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('[BloxValue] Message lookup failed:', error);
    }
  });
}
