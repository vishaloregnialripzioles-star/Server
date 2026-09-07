import { SlashCommandBuilder, PermissionFlagsBits, type Attachment, type CommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
const MAX_BYTES=256*1024;
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
function cleanName(input:string){return input.trim().replace(/\.[a-z0-9]+$/i,'').replace(/[^a-zA-Z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);}
export const uploademoji:Command={
 data:new SlashCommandBuilder().setName('uploademoji').setDescription('Upload an emoji image to this server').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions).addAttachmentOption(o=>o.setName('emoji').setDescription('PNG, JPG, WEBP or GIF image').setRequired(true)).addStringOption(o=>o.setName('name').setDescription('Emoji name').setRequired(false).setMaxLength(32)),
 async execute(interaction:CommandInteraction&any){
  if(!interaction.guildId||!interaction.guild){await interaction.reply({content:'❌ Server only.',ephemeral:true});return;}
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)&&!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await interaction.reply({content:'❌ You need **Manage Expressions**.',ephemeral:true});return;}
  const attachment=interaction.options.getAttachment('emoji',true) as Attachment; const name=cleanName(interaction.options.getString('name')??attachment.name??'emoji');
  if(!attachment.contentType||!IMAGE_TYPES.has(attachment.contentType)){await interaction.reply({content:'❌ Only PNG, JPG, WEBP and GIF images are supported.',ephemeral:true});return;}
  if(attachment.size>MAX_BYTES){await interaction.reply({content:'❌ Custom emoji files must be 256 KB or smaller.',ephemeral:true});return;}
  if(name.length<2){await interaction.reply({content:'❌ Emoji name must contain at least 2 letters/numbers/underscores.',ephemeral:true});return;}
  await interaction.deferReply({ephemeral:true});
  try{const emoji=await interaction.guild.emojis.create({name,attachment:attachment.url});await interaction.editReply(`✅ **Emoji uploaded to this server!**\n\nName: ${emoji.name}\nFull emoji: ${emoji}\nID: ${emoji.id}\n\nUse **/bloxemoji set** to assign it to a Blox fruit/skin.`);}catch(error){await interaction.editReply(`❌ ${error instanceof Error?error.message:'Discord rejected the emoji upload.'}`);}
 }
};
