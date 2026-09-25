import { SlashCommandBuilder, PermissionFlagsBits, type CommandInteraction } from 'discord.js';
import type { Command } from '../types.js';

const MAX_BYTES=256*1024;
const TOKEN=/^<(a?):([A-Za-z0-9_]{2,32}):(\d{5,25})>$/;
const clean=(s:string)=>s.trim().replace(/[^A-Za-z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);

export const emojiUpload:Command={
 data:new SlashCommandBuilder().setName('emoji-upload').setDescription('Upload a server emoji or Discord image directly to the bot application').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
  .addStringOption(o=>o.setName('emoji').setDescription('Existing server emoji, e.g. <:name:id> or <a:name:id>').setRequired(false).setMaxLength(100))
  .addAttachmentOption(o=>o.setName('file').setDescription('PNG or GIF image to upload as an application emoji').setRequired(false))
  .addStringOption(o=>o.setName('name').setDescription('New application emoji name').setRequired(false).setMaxLength(32)) as any,
 async execute(i:CommandInteraction&any){
  if(!i.guild){await i.reply({content:'❌ Server only.',ephemeral:true});return;}
  if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)){await i.reply({content:'❌ You need **Manage Expressions**.',ephemeral:true});return;}
  const raw=i.options.getString('emoji');const file=i.options.getAttachment('file');
  if(!raw&&!file){await i.reply({content:'❌ Give me a server emoji or attach a PNG/GIF image.',ephemeral:true});return;}
  if(raw&&file){await i.reply({content:'❌ Use either `emoji` or `file`, not both.',ephemeral:true});return;}
  await i.deferReply({ephemeral:true});
  try{
   let name=clean(i.options.getString('name')??'');let bytes:Buffer;let animated=false;
   if(raw){const m=raw.trim().match(TOKEN);if(!m){await i.editReply('❌ Invalid custom emoji. Use <:name:id> or <a:name:id>.');return;}animated=m[1]==='a';if(!name)name=clean(m[2]);const url='https://cdn.discordapp.com/emojis/'+m[3]+'.'+(animated?'gif':'png')+'?size=256&quality=lossless';const response=await fetch(url);if(!response.ok)throw new Error('Could not download that server emoji.');bytes=Buffer.from(await response.arrayBuffer());}
   else{if(!file)throw new Error('No file provided.');if(file.size>MAX_BYTES)throw new Error('The image is larger than Discord’s 256 KB application emoji limit.');const type=(file.contentType??'').toLowerCase();const lower=file.name.toLowerCase();animated=type==='image/gif'||lower.endsWith('.gif');if(type&&!type.startsWith('image/'))throw new Error('Only image files are supported.');if(!animated&&!['image/png','image/webp','image/jpeg',''].includes(type)&&!/\.(png|webp|jpg|jpeg)$/.test(lower))throw new Error('Use a PNG, JPG, WEBP or GIF image.');if(!name)name=clean(file.name.replace(/\.[^.]+$/,''));const response=await fetch(file.url);if(!response.ok)throw new Error('Could not download the Discord attachment.');bytes=Buffer.from(await response.arrayBuffer());}
   if(name.length<2)throw new Error('Emoji name must contain at least 2 characters.');
   if(bytes.byteLength>MAX_BYTES)throw new Error('The image is larger than Discord’s 256 KB application emoji limit.');
   const app=await i.client.application.fetch();
   const emoji=await app.emojis.create({name,attachment:bytes});
   const token=emoji.toString();
   await i.editReply('✅ **Uploaded to the bot application!**\n\n'+token+'\n\n**Name:** '+emoji.name+'\n**ID:** '+emoji.id+'\n**Animated:** '+(emoji.animated?'Yes':'No')+'\n\n📌 Copy the full token above and paste it anywhere in your embeds.');
  }catch(error){console.error('[EmojiUpload]',error);await i.editReply('❌ '+(error instanceof Error?error.message:'Discord rejected the application emoji.'));}
 }
};