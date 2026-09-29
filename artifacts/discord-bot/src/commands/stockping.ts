import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { findBloxValue } from './bloxvalue.js';
import { postBloxStockNow } from '../bloxStock.js';

const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const fruitName=(query:string)=>findBloxValue(query)?.name;

export const stockping:Command={
 data:new SlashCommandBuilder().setName('stockping').setDescription('Configure Blox Fruits stock pings').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s=>s.setName('set-channel').setDescription('Set where stock notifications are posted').addChannelOption(o=>o.setName('channel').setDescription('Stock notification channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s=>s.setName('enable').setDescription('Enable automatic stock notifications'))
  .addSubcommand(s=>s.setName('disable').setDescription('Disable automatic stock notifications'))
  .addSubcommand(s=>s.setName('add').setDescription('Ping a role when a fruit appears in stock').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role to ping').setRequired(true)))
  .addSubcommand(s=>s.setName('remove').setDescription('Remove a fruit stock ping').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true)))
  .addSubcommand(s=>s.setName('list').setDescription('Show configured fruit stock pings'))
  .addSubcommand(s=>s.setName('test').setDescription('Test a fruit stock ping').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true)))
  .addSubcommand(s=>s.setName('now').setDescription('Fetch and post the current stock')),
 async execute(interaction:ChatInputCommandInteraction){
  if(!interaction.guildId){await interaction.reply({content:'❌ This command only works in a server.',ephemeral:true});return;}
  const sub=interaction.options.getSubcommand();
  const config=()=>loadGuild(interaction.guildId!).config.bloxStock;

  if(sub==='set-channel'){
   const channel=interaction.options.getChannel('channel',true);
   updateGuild(interaction.guildId,data=>{data.config.bloxStock={...(data.config.bloxStock??{enabled:false}),channelId:channel.id};});
   await interaction.reply('✅ Stock ping channel set to <#'+channel.id+'>. Now use **/stockping enable**.');return;
  }
  if(sub==='enable'){
   const current=config();
   if(!current?.channelId){await interaction.reply({content:'❌ Set a stock channel first with **/stockping set-channel**.',ephemeral:true});return;}
   updateGuild(interaction.guildId,data=>{data.config.bloxStock={...(data.config.bloxStock??{enabled:false}),enabled:true};});
   await interaction.reply('✅ **Stock ping enabled.** I will check every 60 seconds and post new stock in <#'+current.channelId+'>.');return;
  }
  if(sub==='disable'){
   updateGuild(interaction.guildId,data=>{if(data.config.bloxStock)data.config.bloxStock.enabled=false;});
   await interaction.reply('✅ **Stock ping disabled.**');return;
  }
  if(sub==='add'){
   const query=interaction.options.getString('fruit',true),fruit=fruitName(query);
   if(!fruit){await interaction.reply({content:'❌ I could not find a fruit matching **'+query+'**.',ephemeral:true});return;}
   const role=interaction.options.getRole('role',true);
   updateGuild(interaction.guildId,data=>{
    data.config.bloxStock=data.config.bloxStock??{enabled:false};
    data.config.bloxStock.fruitPings=data.config.bloxStock.fruitPings??{};
    data.config.bloxStock.fruitPings[normalize(fruit)]={roleId:role.id,message:'**'+fruit+'** is in stock!',fruitName:fruit};
   });
   await interaction.reply('✅ Stock ping saved: <@&'+role.id+'> will be pinged when **'+fruit+'** appears.');return;
  }
  if(sub==='remove'){
   const query=interaction.options.getString('fruit',true),fruit=fruitName(query);
   if(!fruit){await interaction.reply({content:'❌ I could not find a fruit matching **'+query+'**.',ephemeral:true});return;}
   updateGuild(interaction.guildId,data=>{if(data.config.bloxStock?.fruitPings)delete data.config.bloxStock.fruitPings[normalize(fruit)];});
   await interaction.reply('✅ Removed the stock ping for **'+fruit+'**.');return;
  }
  if(sub==='list'){
   const pings=Object.values(config()?.fruitPings??{});
   if(!pings.length){await interaction.reply({content:'📭 No fruit stock pings are configured yet.',ephemeral:true});return;}
   const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('Stock Pings').setDescription(pings.map(p=>'• **'+(p.fruitName??'Unknown fruit')+'** → <@&'+p.roleId+'>').join('\n')).setFooter({text:'Sparxie • Blox Fruits stock'});
   await interaction.reply({embeds:[embed],ephemeral:true});return;
  }
  if(sub==='test'){
   const query=interaction.options.getString('fruit',true),fruit=fruitName(query),ping=fruit?config()?.fruitPings?.[normalize(fruit)]:undefined;
   if(!fruit||!ping){await interaction.reply({content:'❌ No stock ping is configured for **'+query+'**.',ephemeral:true});return;}
   await interaction.reply({content:'<@&'+ping.roleId+'> **'+fruit+'** is in stock!',allowedMentions:{roles:[ping.roleId]}});return;
  }
  const current=config();
  if(!current?.channelId){await interaction.reply({content:'❌ Set a stock channel first with **/stockping set-channel**.',ephemeral:true});return;}
  if(!current.enabled){await interaction.reply({content:'❌ Enable stock ping first with **/stockping enable**.',ephemeral:true});return;}
  await interaction.deferReply({ephemeral:true});
  const result=await postBloxStockNow(interaction.client,interaction.guildId);
  if(!result.ok){
   await interaction.editReply('❌ **Stock ping failed.** '+(result.error??'The stock could not be posted to the configured channel.'));
   return;
  }
  if(result.posted>0){
   await interaction.editReply('✅ **Current stock posted successfully!** Normal Stock and Mirage Stock were sent to <#'+current.channelId+'>.');
   return;
  }
  await interaction.editReply('⚠️ **Stock was fetched, but nothing was posted.** Check the stock channel configuration and bot permissions.');
 }
};
