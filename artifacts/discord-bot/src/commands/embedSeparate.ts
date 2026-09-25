import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildEmbedPreview, parseColor } from '../welcomeUtils.js';
import { buildEmbedEditorSelection } from '../embedEditor.js';

const base=(name:string,description:string)=>new SlashCommandBuilder().setName(name).setDescription(description).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const nameOption=(o:any)=>o.setName('name').setDescription('Saved embed name').setRequired(true).setMaxLength(32);

export const embedCreate:Command={
 data:base('embed-create','Create a permanent reusable embed')
  .addStringOption(o=>nameOption(o))
  .addStringOption(o=>o.setName('title').setDescription('Embed title').setMaxLength(256))
  .addStringOption(o=>o.setName('description').setDescription('Embed description').setMaxLength(4000))
  .addStringOption(o=>o.setName('color').setDescription('Hex color, e.g. #5865F2'))
  .addStringOption(o=>o.setName('author').setDescription('Author name').setMaxLength(256))
  .addStringOption(o=>o.setName('author_icon').setDescription('Author icon URL'))
  .addStringOption(o=>o.setName('thumbnail').setDescription('Thumbnail URL'))
  .addStringOption(o=>o.setName('image').setDescription('Main image URL'))
  .addStringOption(o=>o.setName('footer').setDescription('Footer text').setMaxLength(2048))
  .addStringOption(o=>o.setName('footer_icon').setDescription('Footer icon URL'))
  .addBooleanOption(o=>o.setName('timestamp').setDescription('Show timestamp')) as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const name=i.options.getString('name',true).toLowerCase().trim();const d=loadGuild(i.guild.id);if(d.savedEmbeds?.[name]){await i.editReply('❌ An embed named '+name+' already exists.');return;}const raw=i.options.getString('color');const color=raw?parseColor(raw):undefined;if(raw&&color===undefined){await i.editReply('❌ Invalid hex color.');return;}updateGuild(i.guild.id,g=>{g.savedEmbeds??={};g.savedEmbeds[name]={name,title:i.options.getString('title')??undefined,description:i.options.getString('description')??undefined,color,authorName:i.options.getString('author')??undefined,authorIconUrl:i.options.getString('author_icon')??undefined,thumbnailUrl:i.options.getString('thumbnail')??undefined,imageUrl:i.options.getString('image')??undefined,footerText:i.options.getString('footer')??undefined,footerIconUrl:i.options.getString('footer_icon')??undefined,timestamp:i.options.getBoolean('timestamp')??true,fields:[]};});await i.editReply({content:'✅ Embed '+name+' created permanently.',embeds:[buildEmbedPreview(loadGuild(i.guild.id).savedEmbeds![name])]});}
};

export const embedEdit:Command={
 data:base('embed-edit','Open the visual editor and choose an embed by name') as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});await i.editReply(buildEmbedEditorSelection(i.guild.id));}
};

export const embedList:Command={
 data:base('embed-list','Show every saved embed name') as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const names=Object.keys(loadGuild(i.guild.id).savedEmbeds??{}).sort();if(!names.length){await i.editReply('📭 No saved embeds.');return;}const e=new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Saved Embeds').setDescription(names.map((n,nx)=>(nx+1)+'. **'+n+'**').join('\n')).setFooter({text:names.length+' saved embed'+(names.length===1?'':'s')});await i.editReply({embeds:[e]});}
};

export const embedDelete:Command={
 data:base('embed-delete','Permanently delete a saved embed').addStringOption(o=>nameOption(o)) as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const name=i.options.getString('name',true).toLowerCase().trim();if(!loadGuild(i.guild.id).savedEmbeds?.[name]){await i.editReply('❌ No embed named '+name+'.');return;}updateGuild(i.guild.id,d=>{delete d.savedEmbeds![name];});await i.editReply('🗑️ Embed '+name+' deleted permanently.');}
};

export const embedPreview:Command={
 data:base('embed-preview','Preview one saved embed').addStringOption(o=>nameOption(o)) as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const name=i.options.getString('name',true).toLowerCase().trim();const saved=loadGuild(i.guild.id).savedEmbeds?.[name];if(!saved){await i.editReply('❌ No embed named '+name+'.');return;}await i.editReply({content:'👀 Preview: '+name,embeds:[buildEmbedPreview(saved)]});}
};

export const embedFieldAdd:Command={
 data:base('embed-field-add','Add a field to a saved embed').addStringOption(o=>nameOption(o)).addStringOption(o=>o.setName('field_name').setDescription('Field title').setRequired(true).setMaxLength(256)).addStringOption(o=>o.setName('field_value').setDescription('Field value').setRequired(true).setMaxLength(1024)).addBooleanOption(o=>o.setName('inline').setDescription('Inline field')) as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const name=i.options.getString('name',true).toLowerCase().trim();const saved=loadGuild(i.guild.id).savedEmbeds?.[name];if(!saved){await i.editReply('❌ No embed named '+name+'.');return;}if((saved.fields?.length??0)>=25){await i.editReply('❌ Discord allows up to 25 fields.');return;}updateGuild(i.guild.id,d=>{const e=d.savedEmbeds![name];e.fields??=[];e.fields.push({name:i.options.getString('field_name',true),value:i.options.getString('field_value',true),inline:i.options.getBoolean('inline')??false});});await i.editReply({content:'✅ Field added to '+name+'.',embeds:[buildEmbedPreview(loadGuild(i.guild.id).savedEmbeds![name])]});}
};

export const embedFieldRemove:Command={
 data:base('embed-field-remove','Remove a field from a saved embed').addStringOption(o=>nameOption(o)).addIntegerOption(o=>o.setName('index').setDescription('Field number, starting at 1').setRequired(true).setMinValue(1).setMaxValue(25)) as any,
 async execute(i){if(!i.guild)return;await i.deferReply({ephemeral:true});const name=i.options.getString('name',true).toLowerCase().trim();const index=i.options.getInteger('index',true)-1;const saved=loadGuild(i.guild.id).savedEmbeds?.[name];if(!saved){await i.editReply('❌ No embed named '+name+'.');return;}if(index<0||index>=(saved.fields?.length??0)){await i.editReply('❌ That field number does not exist.');return;}updateGuild(i.guild.id,d=>{d.savedEmbeds![name].fields!.splice(index,1);});await i.editReply({content:'✅ Field '+(index+1)+' removed from '+name+'.',embeds:[buildEmbedPreview(loadGuild(i.guild.id).savedEmbeds![name])]});}
};

export const embedSeparateCommands=[embedCreate,embedEdit,embedList,embedDelete,embedPreview,embedFieldAdd,embedFieldRemove];