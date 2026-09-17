import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, AntiNukeAction, AntiNukeConfig } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isOwnerOrExtraOwner } from '../security.js';

const C={blue:0x5865f2,green:0x57f287,yellow:0xfee75c,red:0xed4245};
const actionNames: Record<string,string>={strip:'Strip dangerous roles',kick:'Kick executor',ban:'Ban executor'};
const limitChoices=[['channel_delete','Channel deletes'],['channel_create','Channel creates'],['role_delete','Role deletes'],['role_create','Role creates'],['member_ban','Member bans'],['member_kick','Member kicks'],['webhook_create','Webhook creates'],['webhook_delete','Webhook deletes'],['permission_update','Permission changes']] as const;
function e(title:string,description:string,color=C.blue){return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({text:'Sparxie • Anti-Nuke Security'}).setTimestamp();}

async function checkBotHierarchy(guild:any):Promise<{ok:boolean;message:string}> {
  const me=guild.members.me??await guild.members.fetchMe().catch(()=>null);
  if(!me) return {ok:false,message:'I could not fetch my server member. Please try again.'};
  const admins=await guild.members.fetch().catch(()=>guild.members.cache);
  const blocking=[...admins.values()].filter((member:any)=>member.id!==guild.ownerId&&member.id!==guild.client.user?.id&&member.permissions.has(PermissionFlagsBits.Administrator)&&member.roles.highest.position>=me.roles.highest.position);
  if(blocking.length){
    const names=blocking.slice(0,5).map((m:any)=>`${m.user.tag} (<@&${m.roles.highest.id}>)`).join('\n');
    return {ok:false,message:`**Move my bot role above every Administrator role first.**\n\nI cannot safely ban an unauthorized admin if their highest role is at or above mine.\n\nBlocking admins:\n${names}${blocking.length>5?'\n…and more.':''}\n\nAfter moving **Sparxie** above those roles, run \`/antinuke enable\` again.`};
  }
  if(me.roles.highest.position<=0) return {ok:false,message:'Please give Sparxie a dedicated role and move it above the roles it needs to protect against.'};
  return {ok:true,message:'Role hierarchy verified.'};
}

export const antinuke: Command = {
 data:new SlashCommandBuilder().setName('antinuke').setDescription('Protect the server from destructive actions')
  .addSubcommand(s=>s.setName('enable').setDescription('Enable instant Anti-Nuke protection'))
  .addSubcommand(s=>s.setName('disable').setDescription('Disable Anti-Nuke'))
  .addSubcommand(s=>s.setName('status').setDescription('Show protection settings'))
  .addSubcommand(s=>s.setName('punishment').setDescription('Choose enforcement').addStringOption(o=>o.setName('action').setDescription('Enforcement').setRequired(true).addChoices({name:'Strip dangerous roles',value:'strip'},{name:'Kick',value:'kick'},{name:'Ban',value:'ban'})))
  .addSubcommand(s=>s.setName('limit').setDescription('Configure one action threshold').addStringOption(o=>{o.setName('action').setDescription('Action to watch').setRequired(true);for(const [value,name] of limitChoices)o.addChoices({name,value});return o;}).addIntegerOption(o=>o.setName('count').setDescription('Maximum actions').setRequired(true).setMinValue(1).setMaxValue(100)).addIntegerOption(o=>o.setName('seconds').setDescription('Window in seconds').setRequired(true).setMinValue(1).setMaxValue(60)))
  .addSubcommand(s=>s.setName('logs').setDescription('Set the Anti-Nuke log channel').addChannelOption(o=>o.setName('channel').setDescription('Security log channel').setRequired(true)))
  .addSubcommandGroup(g=>g.setName('whitelist').setDescription('Manage trusted members').addSubcommand(s=>s.setName('add').setDescription('Trust a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))).addSubcommand(s=>s.setName('remove').setDescription('Untrust a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)))),
 async execute(interaction){
  if(!interaction.guild)return; if(!isOwnerOrExtraOwner(interaction.guild,interaction.user.id)){await interaction.reply({embeds:[e('🔒 Anti-Nuke Locked','Only the **server owner** or an **extra owner** can configure Anti-Nuke.',C.red)],ephemeral:true});return;}
  const sub=interaction.options.getSubcommand();const group=interaction.options.getSubcommandGroup(false);const id=interaction.guild.id;
  if(sub==='enable'||sub==='disable'){
   if(sub==='enable'){
    const me=interaction.guild.members.me??await interaction.guild.members.fetchMe().catch(()=>null);
    const required=[PermissionFlagsBits.ViewAuditLog,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers];
    const missing=me?required.filter(p=>!me.permissions.has(p)):required;
    if(missing.length){await interaction.reply({embeds:[e('🛡️ Permissions Required',`I cannot safely enable protection yet. Missing: **${missing.map(String).join(', ')}**`,C.yellow)],ephemeral:true});return;}
    const hierarchy=await checkBotHierarchy(interaction.guild);
    if(!hierarchy.ok){await interaction.reply({embeds:[e('⚠️ Move My Role Higher First',hierarchy.message,C.yellow)],ephemeral:true});return;}
    updateGuild(id,d=>{d.antiNuke.enabled=true;d.antiNuke.punishment='ban';for(const key of Object.keys(d.antiNuke.limits) as Array<keyof AntiNukeConfig['limits']>)d.antiNuke.limits[key]={maxCount:1,windowSeconds:10};});
    await interaction.reply({embeds:[e('🛡️ Anti-Nuke Enabled','**Instant protection is LIVE.**\n\nAny non-whitelisted member who performs a monitored destructive action will trigger enforcement on the first detected action. Default enforcement is **BAN**.\n\n⚠️ Keep the **Sparxie bot role above all Administrator/moderation roles** that it may need to act against. The server owner and whitelist remain protected.',C.green)]});
    return;
   }
   updateGuild(id,d=>{d.antiNuke.enabled=false;});await interaction.reply({embeds:[e('🛡️ Anti-Nuke Disabled','Protection is paused.',C.yellow)]});return;
  }
  if(sub==='punishment'){const p=interaction.options.getString('action',true) as AntiNukeAction;updateGuild(id,d=>{d.antiNuke.punishment=p;});await interaction.reply({embeds:[e('⚙️ Punishment Updated',`Threshold violations now use **${actionNames[p]}**.`,C.green)]});return;}
  if(sub==='limit'){const action=interaction.options.getString('action',true) as keyof AntiNukeConfig['limits'];const count=interaction.options.getInteger('count',true);const seconds=interaction.options.getInteger('seconds',true);updateGuild(id,d=>{d.antiNuke.limits[action]={maxCount:count,windowSeconds:seconds};});await interaction.reply({embeds:[e('⚙️ Threshold Updated',`**${action}** → **${count} actions / ${seconds}s**`,C.green)]});return;}
  if(sub==='logs'){const channel=interaction.options.getChannel('channel',true);if(!channel.isTextBased()){await interaction.reply({embeds:[e('⚠️ Invalid Log Channel','Choose a text-based channel.',C.yellow)],ephemeral:true});return;}updateGuild(id,d=>{d.antiNuke.logChannelId=channel.id;});await interaction.reply({embeds:[e('📋 Security Logs Updated',`Anti-Nuke events will be posted in ${channel}.`,C.green)]});return;}
  if(group==='whitelist'){const user=interaction.options.getUser('user',true);const add=sub==='add';updateGuild(id,d=>{if(add&&!d.antiNuke.whitelist.includes(user.id))d.antiNuke.whitelist.push(user.id);if(!add)d.antiNuke.whitelist=d.antiNuke.whitelist.filter(x=>x!==user.id);});await interaction.reply({embeds:[e('👥 Trusted List',`${add?'Added':'Removed'} ${user} ${add?'to the trusted list.':'from the trusted list.'}`,C.green)]});return;}
  const a=loadGuild(id).antiNuke;const lines=Object.entries(a.limits).map(([k,v])=>`**${k}** • ${(v as any).maxCount} / ${(v as any).windowSeconds}s`).join('\n');await interaction.reply({embeds:[e('🛡️ Anti-Nuke Status',`Status: **${a.enabled?'🟢 Enabled':'🔴 Disabled'}**\nPunishment: **${actionNames[a.punishment]}**\nLogs: ${a.logChannelId?`<#${a.logChannelId}>`:'**Not configured**'}\n\n${lines}`)],ephemeral:true});
 }
};
