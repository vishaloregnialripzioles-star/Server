import type { Client } from 'discord.js';
import { Events, AuditLogEvent } from 'discord.js';
import { auditLog } from '../auditLogger.js';
import { deleteGuild } from '../storage.js';
function safe(name:string,fn:(...args:any[])=>any){return(...args:any[])=>{try{Promise.resolve(fn(...args)).catch((err:unknown)=>console.error(`[${name}]`,err));}catch(err){console.error(`[${name}]`,err);}};}
export function registerEvents(client:Client):void{
client.once(Events.ClientReady,safe('ready',async(...args:any[])=>{const{handleReady}=await import('./ready.js');return handleReady(...args);}));
client.on(Events.InteractionCreate,safe('interactionCreate',async(...args:any[])=>{const{handleInteractionCreate}=await import('./interactionCreate.js');return handleInteractionCreate(...args);}));
client.on(Events.MessageCreate,safe('messageCreate',async(...args:any[])=>{const{handleMessageCreate}=await import('./messageCreate.js');return handleMessageCreate(...args);}));
client.on(Events.MessageCreate,safe('hinglishCursedWords',async(...args:any[])=>{const{handleHinglishCursedWords}=await import('./hinglishCursedWords.js');return handleHinglishCursedWords(...args);}));
client.on(Events.MessageDelete,safe('messageDelete',async(...args:any[])=>{const{handleMessageDelete}=await import('./messageDelete.js');return handleMessageDelete(...args);}));
client.on(Events.MessageUpdate,safe('messageUpdate',async(...args:any[])=>{const{handleMessageUpdate}=await import('./messageUpdate.js');return handleMessageUpdate(...args);}));
client.on(Events.MessageReactionAdd,safe('messageReactionAdd',async(...args:any[])=>{const{handleMessageReactionAdd}=await import('./messageReactionAdd.js');return handleMessageReactionAdd(...args);}));
client.on(Events.MessageReactionRemove,safe('messageReactionRemove',async(...args:any[])=>{const{handleMessageReactionRemove}=await import('./messageReactionRemove.js');return handleMessageReactionRemove(...args);}));
client.on(Events.GuildMemberAdd,safe('guildMemberAdd',async(...args:any[])=>{const{handleGuildMemberAdd}=await import('./guildMemberAdd.js');return handleGuildMemberAdd(...args);}));
client.on(Events.GuildAuditLogEntryCreate,safe('guildAuditLogEntryCreate',async(entry:any,guild:any)=>{try{const{handleAntiNukeAudit}=await import('./antiNuke.js');await handleAntiNukeAudit(entry,guild);}catch(err){console.error('[antiNuke]',err);}const map:any={[AuditLogEvent.GuildUpdate]:'serverChanges',[AuditLogEvent.ChannelCreate]:'channelChanges',[AuditLogEvent.ChannelUpdate]:'channelChanges',[AuditLogEvent.ChannelDelete]:'channelChanges',[AuditLogEvent.RoleCreate]:'roleChanges',[AuditLogEvent.RoleUpdate]:'roleChanges',[AuditLogEvent.RoleDelete]:'roleChanges',[AuditLogEvent.MemberKick]:'moderation',[AuditLogEvent.MemberBanAdd]:'moderation',[AuditLogEvent.MemberBanRemove]:'moderation',[AuditLogEvent.MemberUpdate]:'memberChanges',[AuditLogEvent.BotAdd]:'memberChanges'};const category=map[entry.action];if(category)await auditLog(guild,category,`📋 ${category.replace(/([A-Z])/g,' $1')}`,`Discord audit event **${entry.action}** was recorded.`,entry.executor?([{name:'Executor',value:`<@${entry.executor.id}>`,inline:true}]):[]);}));
client.on(Events.GuildDelete,safe('guildDelete',async(guild:any)=>{console.log(`[Storage] Bot left guild ${guild.id}; removing persisted progression.`);await deleteGuild(String(guild.id));}));
}
