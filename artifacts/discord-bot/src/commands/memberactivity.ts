import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, ActivityUser } from '../types.js';
import { loadGuild } from '../storage.js';

const DAY=86400000;
function dayKey(ts:number):string{return new Date(ts).toISOString().slice(0,10);}
function monthKey(ts:number):string{return new Date(ts).toISOString().slice(0,7);}
function fmt(n:number):string{return n.toLocaleString('en-US');}
function pct(n:number,total:number):string{return total?`${((n/total)*100).toFixed(1)}%`:'0.0%';}
function topWords(user:ActivityUser):string{const words=new Map<string,number>();for(const d of Object.values(user.daily))for(const [w,c] of Object.entries(d.words))words.set(w,(words.get(w)??0)+c);return [...words.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w,c])=>`${w} (${c})`).join(', ')||'No repeated words tracked';}
function averageDaily(user:ActivityUser):number{return user.activeDays?user.totalMessages/user.activeDays:0;}

export const memberactivity:Command={
 data:new SlashCommandBuilder().setName('memberactivity').setDescription('View tracked server activity for a member').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addUserOption(o=>o.setName('member').setDescription('Member to inspect').setRequired(true)),
 async execute(interaction){
  if(!interaction.guild)return;
  const member=interaction.options.getUser('member',true),data=loadGuild(interaction.guild.id),u=data.activity.users[member.id];
  if(!u){await interaction.reply({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('📊 Member Activity').setDescription(`No activity has been tracked for **${member.username}** yet. Tracking begins from **${new Date(data.activity.startedAt).toLocaleString()}**.`)]});return;}
  const roleMember=await interaction.guild.members.fetch(member.id).catch(()=>null);const embed=new EmbedBuilder().setColor(0x5865f2).setTitle(`📊 Activity • ${member.username}`).setThumbnail(member.displayAvatarURL()).addFields(
   {name:'💬 Messages',value:fmt(u.totalMessages),inline:true},{name:'📅 Active days',value:fmt(u.activeDays),inline:true},{name:'📈 Daily average',value:averageDaily(u).toFixed(1),inline:true},
   {name:'🌐 Server share',value:pct(u.totalMessages,data.activity.totalMessages),inline:true},{name:'🟢 First seen',value:`<t:${Math.floor(u.firstSeen/1000)}:D>`,inline:true},{name:'🕒 Last seen',value:`<t:${Math.floor(u.lastSeen/1000)}:R>`,inline:true},
   {name:'🗓️ This month',value:fmt(u.monthly[monthKey(Date.now())]??0),inline:true},{name:'🔁 Repeated words',value:topWords(u),inline:false}
  ).setFooter({text:`Tracked since ${new Date(data.activity.startedAt).toLocaleDateString()}`});
  if(roleMember){const staff=roleMember.permissions.has(PermissionFlagsBits.ManageGuild)||roleMember.permissions.has(PermissionFlagsBits.ModerateMembers);if(staff)embed.addFields({name:'🛡️ Staff activity',value:'This member is tracked as staff based on current server permissions.',inline:false});}
  await interaction.reply({embeds:[embed]});
 }
};

export const activity:Command={
 data:new SlashCommandBuilder().setName('activity').setDescription('View tracked server activity overview').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 async execute(interaction){
  if(!interaction.guild)return;const data=loadGuild(interaction.guild.id),users=Object.entries(data.activity.users).sort((a,b)=>b[1].totalMessages-a[1].totalMessages),month=monthKey(Date.now());
  const top=users.slice(0,10).map(([id,u],i)=>`**${i+1}.** <@${id}> — ${fmt(u.totalMessages)} messages (${pct(u.totalMessages,data.activity.totalMessages)})`).join('\n')||'No tracked messages yet.';
  const activeDays=new Set<string>();for(const u of Object.values(data.activity.users))for(const [day,d] of Object.entries(u.daily))if(d.count>0)activeDays.add(day);
  const avg=data.activity.totalMessages/(activeDays.size||1);
  const staff=users.filter(([id])=>{const m=interaction.guild!.members.cache.get(id);return !!m&&(m.permissions.has(PermissionFlagsBits.ManageGuild)||m.permissions.has(PermissionFlagsBits.ModerateMembers));}).slice(0,5).map(([id,u])=>`<@${id}> — ${fmt(u.totalMessages)}`).join('\n')||'No tracked staff activity yet.';
  const embed=new EmbedBuilder().setColor(0x5865f2).setTitle(`📈 ${interaction.guild.name} • Activity Overview`).setDescription(`Real message activity tracked by Sparxie. Data collection began <t:${Math.floor(data.activity.startedAt/1000)}:R>.`).addFields(
   {name:'💬 Total messages',value:fmt(data.activity.totalMessages),inline:true},{name:'👥 Active members',value:fmt(users.length),inline:true},{name:'📅 Active days',value:fmt(activeDays.size),inline:true},
   {name:'📊 Daily server average',value:avg.toFixed(1),inline:true},{name:'🗓️ Current month',value:fmt(users.reduce((n,[,u])=>n+(u.monthly[month]??0),0)),inline:true},{name:'🏆 Most active members',value:top,inline:false},{name:'🛡️ Staff activity',value:staff,inline:false}
  );await interaction.reply({embeds:[embed]});
 }
};

export const memberActivityCommands=[memberactivity,activity];
