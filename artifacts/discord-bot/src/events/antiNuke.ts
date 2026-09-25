import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isAntiNukeTrusted } from '../security.js';

const RED=0xD30000;
const ACTIONS:Record<number,string>={[AuditLogEvent.ChannelDelete]:'channel_delete',[AuditLogEvent.ChannelCreate]:'channel_create',[AuditLogEvent.RoleDelete]:'role_delete',[AuditLogEvent.RoleCreate]:'role_create',[AuditLogEvent.MemberBanAdd]:'member_ban',[AuditLogEvent.MemberKick]:'member_kick',[AuditLogEvent.WebhookCreate]:'webhook_create',[AuditLogEvent.WebhookDelete]:'webhook_delete',[AuditLogEvent.ChannelUpdate]:'permission_update',[AuditLogEvent.RoleUpdate]:'permission_update',[AuditLogEvent.MemberRoleUpdate]:'permission_update',[AuditLogEvent.BotAdd]:'bot_add'};

async function log(guild:Guild,title:string,description:string,fields:any[]=[]):Promise<void>{
 const id=loadGuild(guild.id).antiNuke.logChannelId;let channel=id?await guild.channels.fetch(id).catch(()=>null):null;
 if(!channel){const me=guild.members.me??await guild.members.fetchMe().catch(()=>null);if(me?.permissions.has(PermissionFlagsBits.ManageChannels)){channel=await guild.channels.create({name:'antinuke-logs',reason:'Anti-Nuke security logging'}).catch(()=>null);if(channel)updateGuild(guild.id,d=>{d.antiNuke.logChannelId=channel!.id;});}}
 const em=new EmbedBuilder().setColor(RED).setTitle(title).setDescription(description).addFields(fields).setFooter({text:'Sparxie • Anti-Nuke Security'}).setTimestamp();
 if(channel?.isTextBased())await channel.send({embeds:[em]}).catch(()=>undefined);
}

async function punish(guild:Guild,executorId:string,action:string):Promise<void>{
 if(isAntiNukeTrusted(guild,executorId))return;
 const member=await guild.members.fetch(executorId).catch(()=>null);
 let result='Executor could not be fetched.';
 if(member?.bannable){const ok=await member.ban({reason:'Anti-Nuke: unauthorized '+action}).then(()=>true).catch(()=>false);result=ok?'Executor **banned immediately**.':'Ban failed.';}
 else if(member)result='Executor could not be banned because of Discord role hierarchy.';
 await log(guild,'🚨 Anti-Nuke • INSTANT BAN','An unauthorized destructive action was detected.',[{name:'Executor',value:'<@'+executorId+'>',inline:true},{name:'Action',value:action,inline:true},{name:'Enforcement',value:result},{name:'Protection',value:'First-action detection • no threshold • whitelist respected'}]);
}

async function auditExecutor(guild:Guild,type:any,targetId:string):Promise<string|null>{
 const logs=await guild.fetchAuditLogs({type,limit:8}).catch(()=>null);
 if(!logs)return null;
 const now=Date.now();
 const found=logs.entries.find((entry:any)=>entry.targetId===targetId&&now-entry.createdTimestamp<15000);
 return found?.executorId??null;
}

export async function handleAntiNukeAudit(entry:GuildAuditLogsEntry,guild:Guild):Promise<void>{
 const data=loadGuild(guild.id);if(!data.antiNuke.enabled)return;
 const action=ACTIONS[entry.action as number];if(!action)return;
 const executorId=entry.executorId;if(!executorId||executorId===guild.client.user?.id||isAntiNukeTrusted(guild,executorId))return;
 await punish(guild,executorId,action);
 if(action==='bot_add'&&entry.targetId){const added=await guild.members.fetch(entry.targetId).catch(()=>null);if(added?.user.bot)await added.kick('Anti-Nuke: unauthorized bot addition').catch(()=>undefined);}
}

export async function recoverChannelCreate(channel:any):Promise<void>{
 if(!channel?.guild)return;const guild=channel.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.ChannelCreate,channel.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 await channel.delete('Anti-Nuke recovery: unauthorized channel creation').catch(()=>undefined);await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized channel creation was automatically removed.',[{name:'Channel',value:'#'+channel.name},{name:'Executor',value:'<@'+executor+'>'}]);
}

export async function recoverChannelDelete(channel:any):Promise<void>{
 if(!channel?.guild)return;const guild=channel.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.ChannelDelete,channel.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 const options:any={name:channel.name,type:channel.type,reason:'Anti-Nuke recovery: restore deleted channel'};
 if(channel.parentId)options.parent=channel.parentId;
 if('topic' in channel)options.topic=channel.topic??undefined;
 if('nsfw' in channel)options.nsfw=channel.nsfw??false;
 if('rateLimitPerUser' in channel)options.rateLimitPerUser=channel.rateLimitPerUser??0;
 if('userLimit' in channel)options.userLimit=channel.userLimit??0;
 const restored=await guild.channels.create(options).catch(()=>null);
 if(restored&&channel.rawPosition!=null)await restored.setPosition(channel.rawPosition).catch(()=>undefined);
 await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized channel deletion was automatically recovered.',[{name:'Channel',value:'#'+channel.name},{name:'Executor',value:'<@'+executor+'>'},{name:'Recovery',value:restored?'Restored':'Discord rejected the restore request'}]);
}

export async function recoverRoleCreate(role:any):Promise<void>{
 if(!role?.guild||role.managed)return;const guild=role.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.RoleCreate,role.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 await role.delete('Anti-Nuke recovery: unauthorized role creation').catch(()=>undefined);await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized role creation was automatically removed.',[{name:'Role',value:'@'+role.name},{name:'Executor',value:'<@'+executor+'>'}]);
}

export async function recoverRoleDelete(role:any):Promise<void>{
 if(!role?.guild||role.managed)return;const guild=role.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.RoleDelete,role.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 const restored=await guild.roles.create({name:role.name,color:role.color,hoist:role.hoist,mentionable:role.mentionable,permissions:role.permissions.bitfield,reason:'Anti-Nuke recovery: restore deleted role'}).catch(()=>null);
 if(restored)await restored.setPosition(Math.min(role.position,guild.roles.highest.position-1)).catch(()=>undefined);
 await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized role deletion was automatically recovered.',[{name:'Role',value:'@'+role.name},{name:'Executor',value:'<@'+executor+'>'},{name:'Recovery',value:restored?'Restored':'Discord rejected the restore request'}]);
}

export async function recoverRoleUpdate(oldRole:any,newRole:any):Promise<void>{
 if(!newRole?.guild||newRole.managed)return;const guild=newRole.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.RoleUpdate,newRole.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 await newRole.edit({name:oldRole.name,color:oldRole.color,hoist:oldRole.hoist,mentionable:oldRole.mentionable,permissions:oldRole.permissions.bitfield,reason:'Anti-Nuke recovery: restore role settings'}).catch(()=>undefined);
 await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized role changes were automatically reverted.',[{name:'Role',value:'<@&'+newRole.id+'>'},{name:'Executor',value:'<@'+executor+'>'}]);
}

export async function recoverChannelUpdate(oldChannel:any,newChannel:any):Promise<void>{
 if(!newChannel?.guild)return;const guild=newChannel.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const executor=await auditExecutor(guild,AuditLogEvent.ChannelUpdate,newChannel.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 const patch:any={name:oldChannel.name,reason:'Anti-Nuke recovery: restore channel settings'};
 if('topic' in oldChannel)patch.topic=oldChannel.topic??undefined;
 if('nsfw' in oldChannel)patch.nsfw=oldChannel.nsfw??false;
 if('rateLimitPerUser' in oldChannel)patch.rateLimitPerUser=oldChannel.rateLimitPerUser??0;
 await newChannel.edit(patch).catch(()=>undefined);
 if(oldChannel.parentId!==newChannel.parentId)await newChannel.setParent(oldChannel.parentId,{lockPermissions:false}).catch(()=>undefined);
 if(oldChannel.permissionOverwrites?.cache)await newChannel.permissionOverwrites.set(oldChannel.permissionOverwrites.cache).catch(()=>undefined);
 await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized channel changes were automatically reverted.',[{name:'Channel',value:'#'+newChannel.name},{name:'Executor',value:'<@'+executor+'>'}]);
}

export async function recoverMemberRoleUpdate(oldMember:any,newMember:any):Promise<void>{
 if(!newMember?.guild||newMember.id===newMember.guild.client.user?.id)return;const guild=newMember.guild;if(!loadGuild(guild.id).antiNuke.enabled)return;
 const added=newMember.roles.cache.filter((role:any)=>role.id!==guild.id&&!oldMember.roles.cache.has(role.id));if(!added.size)return;
 const executor=await auditExecutor(guild,AuditLogEvent.MemberRoleUpdate,newMember.id);if(!executor||isAntiNukeTrusted(guild,executor)||executor===guild.client.user?.id)return;
 for(const role of added.values())await newMember.roles.remove(role,'Anti-Nuke recovery: unauthorized role assignment').catch(()=>undefined);
 await log(guild,'🔄 Anti-Nuke Recovery','Unauthorized role assignment was automatically reverted.',[{name:'Member',value:'<@'+newMember.id+'>'},{name:'Removed roles',value:added.map((r:any)=>'<@&'+r.id+'>').join(' ')},{name:'Executor',value:'<@'+executor+'>'}]);
}
