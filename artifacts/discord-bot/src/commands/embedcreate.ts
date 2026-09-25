import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildEmbedPreview, parseColor } from '../welcomeUtils.js';

export const embedcreate: Command = {
  data: new SlashCommandBuilder().setName('embedcreate').setDescription('Create a reusable embed').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('name').setDescription('Embed name').setRequired(true).setMaxLength(32))
    .addStringOption(o=>o.setName('title').setDescription('Title').setMaxLength(256))
    .addStringOption(o=>o.setName('description').setDescription('Description').setMaxLength(4000))
    .addStringOption(o=>o.setName('color').setDescription('Hex color'))
    .addStringOption(o=>o.setName('author').setDescription('Author name').setMaxLength(256))
    .addStringOption(o=>o.setName('author_icon').setDescription('Author icon URL'))
    .addStringOption(o=>o.setName('thumbnail').setDescription('Thumbnail URL'))
    .addStringOption(o=>o.setName('image').setDescription('Image URL'))
    .addStringOption(o=>o.setName('footer').setDescription('Footer text').setMaxLength(2048))
    .addStringOption(o=>o.setName('footer_icon').setDescription('Footer icon URL'))
    .addBooleanOption(o=>o.setName('timestamp').setDescription('Show timestamp')),
  async execute(i){
    if(!i.guild)return; await i.deferReply({ephemeral:true});
    const name=i.options.getString('name',true).toLowerCase().trim(), data=loadGuild(i.guild.id);
    if(data.savedEmbeds?.[name]){await i.editReply('❌ An embed with that name already exists.');return;}
    const raw=i.options.getString('color'), color=raw?parseColor(raw):undefined;
    if(raw&&color===undefined){await i.editReply('❌ Invalid hex color.');return;}
    updateGuild(i.guild.id,d=>{d.savedEmbeds??={};d.savedEmbeds[name]={name,title:i.options.getString('title')??undefined,description:i.options.getString('description')??undefined,color,authorName:i.options.getString('author')??undefined,authorIconUrl:i.options.getString('author_icon')??undefined,thumbnailUrl:i.options.getString('thumbnail')??undefined,imageUrl:i.options.getString('image')??undefined,footerText:i.options.getString('footer')??undefined,footerIconUrl:i.options.getString('footer_icon')??undefined,timestamp:i.options.getBoolean('timestamp')??true,fields:[]};});
    await i.editReply({content:'Created '+name+'. Use /embededit to edit it visually.',embeds:[buildEmbedPreview(loadGuild(i.guild.id).savedEmbeds![name])]});
  }
};