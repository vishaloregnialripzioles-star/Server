import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { buildEmbedEditorSelection } from '../embedEditor.js';

const base=(name:string,description:string)=>new SlashCommandBuilder()
  .setName(name).setDescription(description)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const embedEdit:Command={
 data:base('embed-edit','Open the visual editor and choose an embed by name') as any,
 async execute(i){if(!i.guild)return;try{await i.deferReply({ephemeral:true});const payload=buildEmbedEditorSelection(i.guild.id);await i.editReply(payload);}catch(error){console.error('[embed-edit] command failed:',error);const message='❌ Embed editor could not be opened. Check the bot logs for the exact error.';if(i.deferred||i.replied)await i.editReply({content:message,embeds:[],components:[]}).catch(()=>undefined);else await i.reply({content:message,ephemeral:true}).catch(()=>undefined);}}
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

