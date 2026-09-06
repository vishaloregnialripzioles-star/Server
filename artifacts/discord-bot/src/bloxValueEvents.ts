import type { Client, Message } from 'discord.js';
import { Events, PermissionFlagsBits } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { buildBloxValueEmbed, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';

const REGISTERED = Symbol.for('sparxie.bloxvalue.registered');

export function registerBloxValueEvents(client: Client): void {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;

  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild || !message.client.user) return;

      const prefix = getGuildPrefix(message.guild.id);
      const channelId = loadGuild(message.guild.id).config.bloxValueChannelId;

      // Prefix commands work anywhere they are allowed by the normal bot permissions.
      if (message.content.startsWith(prefix)) {
        const parts = message.content.slice(prefix.length).trim().split(/\s+/);
        const command = parts.shift()?.toLowerCase();
        if (command === 'bloxvalue' || command === 'blox') {
          const query = parts.join(' ').trim();
          if (!query) return void await message.reply(`❌ Usage: \`${prefix}bloxvalue <fruit or skin>\``).catch(()=>undefined);
          const entry = findBloxValue(query);
          if (!entry) return void await message.reply(`❌ I couldn't find a Blox Fruits value for **${query}**.`).catch(()=>undefined);
          await message.reply({embeds:[buildBloxValueEmbed(entry)],allowedMentions:{parse:[]}}).catch(()=>undefined);
          return;
        }
        if (command === 'setbloxvaluechannel') {
          if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await message.reply('❌ You need **Manage Server** permission.').catch(()=>undefined);
            return;
          }
          const channel = message.mentions.channels.first();
          if (!channel || !('send' in channel)) {
            await message.reply(`❌ Usage: \`${prefix}setbloxvaluechannel #channel\``).catch(()=>undefined);
            return;
          }
          updateGuild(message.guild.id,d=>{d.config.bloxValueChannelId=channel.id;});
          await message.reply(`✅ Blox Fruits value lookup is now enabled in <#${channel.id}>.`).catch(()=>undefined);
          return;
        }
      }

      // Mention lookup is only enabled in the configured value channel.
      if (!channelId || channelId !== message.channelId) return;
      if (!message.mentions.users.has(message.client.user.id)) return;

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
