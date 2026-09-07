import type { Client, Message } from 'discord.js';
import { Events } from 'discord.js';
import { loadGuild, claimMessageEvent } from './storage.js';
import { BLOX_VALUES, buildBloxValueEmbed, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';
import { getBloxEmoji, emojiNameForBlox } from './bloxEmojiManager.js';

const CURRENT_OVERRIDES: Record<string, string> = { Buddha: '1.67B' };
for (const entry of BLOX_VALUES) { const perm = CURRENT_OVERRIDES[entry.name]; if (perm) entry.perm = perm; }
if (!BLOX_VALUES.some(entry => entry.name === 'Meme-Meme')) BLOX_VALUES.push({ name:'Meme-Meme', aliases:['meme-meme','meme meme','meme','memememe'], rarity:'Limited', type:'Skin', regular:'4.5B', perm:'—', beli:'—', demand:'7/10', trend:'Stable', bestFor:'Trading', obtain:'Limited release; tradeable now' });

const REGISTERED = Symbol.for('sparxie.bloxvalue.registered');
export function registerBloxValueEvents(client: Client): void {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild || !message.client.user) return;
      const guildData = loadGuild(message.guild.id), channelId = guildData.config.bloxValueChannelId;
      if (!channelId || channelId !== message.channelId || !message.mentions.users.has(message.client.user.id)) return;
      if (!(await claimMessageEvent(`bloxvalue:${message.id}`))) return;
      const prefix = getGuildPrefix(message.guild.id);
      const query = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '').trim();
      if (!query || query.startsWith('/') || query.startsWith(prefix)) return;
      const entry = findBloxValue(query); if (!entry) return;
      const embed = buildBloxValueEmbed(entry);
      const configuredEmoji = guildData.config.bloxValueEmojis?.[entry.name];
      const appEmoji = await getBloxEmoji(client, entry);
      const guildEmoji = message.guild.emojis.cache.find(e => e.name?.toLowerCase() === emojiNameForBlox(entry.name).toLowerCase())?.toString() ?? '';
      const emoji = configuredEmoji || appEmoji || guildEmoji;
      if (emoji) embed.setTitle(`${emoji} ${entry.name}`);
      await message.reply({ embeds:[embed], allowedMentions:{parse:[]} });
    } catch (error) { console.error('[BloxValue] Message lookup failed:', error); }
  });
}
