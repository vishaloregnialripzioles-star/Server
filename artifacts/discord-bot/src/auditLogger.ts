import type { Guild } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { loadGuild } from './storage.js';

export type LogCategory='messageDelete'|'messageEdit'|'messageBulkDelete'|'serverChanges'|'channelChanges'|'roleChanges'|'memberChanges'|'moderation'|'joinsLeaves'|'invites'|'commands'|'automod'|'giveaways';

const CATEGORY_LABELS:Record<LogCategory,string>={
  messageDelete:'Message Delete',messageEdit:'Message Edit',messageBulkDelete:'Bulk Message Delete',serverChanges:'Server Changes',channelChanges:'Channel Changes',roleChanges:'Role Changes',memberChanges:'Member Changes',moderation:'Moderation',joinsLeaves:'Joins & Leaves',invites:'Invites',commands:'Commands',automod:'Auto Moderation',giveaways:'Giveaways'
};
const CATEGORY_COLORS:Record<LogCategory,number>={
  messageDelete:0xED4245,messageEdit:0xFEE75C,messageBulkDelete:0xED4245,serverChanges:0x5865F2,channelChanges:0x5865F2,roleChanges:0x9B59B6,memberChanges:0x57F287,moderation:0xED4245,joinsLeaves:0x57F287,invites:0xFEE75C,commands:0x5865F2,automod:0xF47FFF,giveaways:0xEB459E
};

export async function auditLog(guild:Guild,category:LogCategory,title:string,description:string,fields:{name:string;value:string;inline?:boolean}[]=[]):Promise<void>{
  const cfg=loadGuild(guild.id).config.logging;
  if(cfg?.enabled===false||cfg?.categories?.[category]===false)return;
  const channelId=cfg?.channelId||loadGuild(guild.id).config.logChannel;
  if(!channelId)return;
  const ch=await guild.channels.fetch(channelId).catch(()=>null);
  if(!ch?.isTextBased())return;
  const botUser=guild.client.user;
  const avatar=botUser?.displayAvatarURL({extension:'png',size:128});
  const label=CATEGORY_LABELS[category]??'Server Log';
  const embed=new EmbedBuilder()
    .setColor(CATEGORY_COLORS[category]??0x5865F2)
    .setAuthor({name:`${guild.name} • ${label}`,...(avatar?{iconURL:avatar}:{})})
    .setTitle(title.slice(0,256))
    .setDescription(description.slice(0,4000))
    .addFields(fields.slice(0,25))
    .setFooter({text:`Sparxie • ${label}`})
    .setTimestamp();
  await ch.send({embeds:[embed]}).catch(()=>undefined);
}
