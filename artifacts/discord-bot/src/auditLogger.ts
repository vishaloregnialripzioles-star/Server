import type { Guild } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { loadGuild } from './storage.js';
import type { LoggingCategorySetting } from './types.js';

export type LogCategory='messageDelete'|'messageEdit'|'messageBulkDelete'|'serverChanges'|'channelChanges'|'roleChanges'|'memberChanges'|'moderation'|'joinsLeaves'|'invites'|'commands'|'automod'|'giveaways';
const CATEGORY_LABELS:Record<LogCategory,string>={messageDelete:'Message Delete',messageEdit:'Message Edit',messageBulkDelete:'Bulk Message Delete',serverChanges:'Server Changes',channelChanges:'Channel Changes',roleChanges:'Role Changes',memberChanges:'Member Changes',moderation:'Moderation',joinsLeaves:'Joins & Leaves',invites:'Invites',commands:'Commands',automod:'Auto Moderation',giveaways:'Giveaways'};
const CATEGORY_COLORS:Record<LogCategory,number>={messageDelete:0xED4245,messageEdit:0xFEE75C,messageBulkDelete:0xED4245,serverChanges:0x5865F2,channelChanges:0x5865F2,roleChanges:0x9B59B6,memberChanges:0x57F287,moderation:0xED4245,joinsLeaves:0x57F287,invites:0xFEE75C,commands:0x5865F2,automod:0xF47FFF,giveaways:0xEB459E};

function enabled(setting:LoggingCategorySetting|undefined, global:boolean|undefined):boolean {
  if(setting===false)return false;
  if(typeof setting==='string')return /^\d{15,25}$/.test(setting);
  if(setting===true)return true;
  return global===true;
}

export async function auditLog(guild:Guild,category:LogCategory,title:string,description:string,fields:{name:string;value:string;inline?:boolean}[]=[]):Promise<void>{
  const data=loadGuild(guild.id); const cfg=data.config.logging;
  const setting=cfg?.categories?.[category];
  if(!enabled(setting,cfg?.enabled))return;
  const channelId=typeof setting==='string' ? setting : (cfg?.channelId||data.config.logChannel);
  if(!channelId)return;
  const ch=await guild.channels.fetch(channelId).catch(()=>null);
  if(!ch?.isTextBased() || !('send' in ch))return;
  const botUser=guild.client.user; const avatar=botUser?.displayAvatarURL({extension:'png',size:128});
  const label=CATEGORY_LABELS[category]??'Server Log';
  const embed=new EmbedBuilder().setColor(CATEGORY_COLORS[category]??0x5865F2).setAuthor({name:`${guild.name} • ${label}`,...(avatar?{iconURL:avatar}:{})}).setTitle(title.slice(0,256)).setDescription(description.slice(0,4000)).addFields(fields.slice(0,25)).setFooter({text:`Sparxie • ${label}`}).setTimestamp();
  await ch.send({embeds:[embed]}).catch(err=>console.error(`[Logging:${category}]`,err));
}
