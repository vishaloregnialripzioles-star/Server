import { SlashCommandBuilder, PermissionFlagsBits, type CommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
import { BLOX_VALUES, findBloxValue } from './bloxvalue.js';
import { emojiNameForBlox, refreshBloxApplicationEmojis } from '../bloxEmojiManager.js';
import { updateGuild } from '../storage.js';

const MAX_BYTES = 256 * 1024;
const CUSTOM_EMOJI = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{5,25})>$/;
function cleanName(input:string){return input.trim().replace(/[^a-zA-Z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);}
function parseCustomEmoji(raw:string){const m=raw.trim().match(CUSTOM_EMOJI);return m?{animated:m[1]==='a',sourceName:m[2],id:m[3]}:null;}
function cdnUrl(id:string,animated:boolean){return `https://cdn.discordapp.com/emojis/${id}.${animated?'gif':'png'}?size=256&quality=lossless`;}
function canManage(i:any){return Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild));}

export const uploademoji:Command={
 data:new SlashCommandBuilder().setName('uploademoji').setDescription('Copy a Discord emoji into the bot application and optionally link it to a Blox item').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
  .addStringOption(o=>o.setName('emoji').setDescription('Custom Discord emoji').setRequired(true).setMaxLength(100))
  .addStringOption(o=>o.setName('name').setDescription('Application emoji name; defaults to source name').setRequired(false).setMaxLength(32))
  .addStringOption(o=>o.setName('blox_item').setDescription('Blox fruit/skin/gamepass to link automatically (optional)').setRequired(false).setMaxLength(100)),
 async execute(interaction:CommandInteraction&any){
  if(!interaction.guildId||!interaction.guild){await interaction.reply({content:'❌ Server only.',ephemeral:true});return;}
  if(!canManage(interaction)){await interaction.reply({content:'❌ You need **Manage Expressions**.',ephemeral:true});return;}
  const raw=interaction.options.getString('emoji',true).trim(),selected=parseCustomEmoji(raw);
  if(!selected){await interaction.reply({content:'❌ Please choose/paste a custom Discord emoji like `<:Kitsune:123456789012345678>`.',ephemeral:true});return;}
  const requested=interaction.options.getString('blox_item');
  const entry=requested?findBloxValue(requested):findBloxValue(selected.sourceName.replace(/^bf_/i,'').replace(/_/g,' '));
  const desired=entry?emojiNameForBlox(entry.name):cleanName(interaction.options.getString('name')??selected.sourceName);
  if(desired.length<2){await interaction.reply({content:'❌ Emoji name is too short.',ephemeral:true});return;}
  await interaction.deferReply({ephemeral:true});
  try{
   const application=await interaction.client.application.fetch();
   const existing=await application.emojis.fetch();
   const same=existing.find(e=>e.name?.toLowerCase()===desired.toLowerCase());
   const emoji=same??await (async()=>{const response=await fetch(cdnUrl(selected.id,selected.animated));if(!response.ok)throw new Error(`Couldn't read the selected Discord emoji (${response.status}).`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.byteLength>MAX_BYTES)throw new Error('The selected emoji is larger than Discord’s 256 KB limit.');return application.emojis.create({name:desired,attachment:bytes});})();
   if(entry){updateGuild(interaction.guildId,g=>{g.config.bloxValueEmojis??={};g.config.bloxValueEmojis[entry.name]=emoji.toString();});}
   await refreshBloxApplicationEmojis(interaction.client);
   await interaction.editReply(`✅ **Application emoji ready!**\n\n${emoji}\nName: **${emoji.name}**\nID: **${emoji.id}**\nAnimated: **${emoji.animated?'Yes':'No'}**\n${entry?`\n🧩 Linked automatically to **${entry.name}**.\nYou can now use it in Blox value replies.`:'\n💡 To link it automatically, run this command again with the **blox_item** option.'}`);
  }catch(error){console.error('[UploadEmoji]',error);await interaction.editReply(`❌ ${error instanceof Error?error.message:'Discord rejected the application emoji.'}`);}
 }
};
