import type { Client } from 'discord.js';
import { Events, AuditLogEvent } from 'discord.js';
import { auditLog } from '../auditLogger.js';
import { deleteGuild } from '../storage.js';

function safe(name:string,fn:(...args:any[])=>any){return(...args:any[])=>{try{Promise.resolve(fn(...args)).catch((err:unknown)=>console.error(`[${name}]`,err));}catch(err){console.error(`[${name}]`,err);}};}

const EVENTS_REGISTERED = Symbol.for('sparxie.events.registered');
const MESSAGE_PROCESSED = Symbol.for('sparxie.message.processed');

type EventClient = Client & { [EVENTS_REGISTERED]?: boolean };
type EventMessage = { [MESSAGE_PROCESSED]?: boolean } & Record<string | symbol, any>;

// registerEvents must only install listeners once, even if this module is loaded
// through more than one import path. A message-level guard also prevents duplicate
// command execution if an old listener survives during a hot reload.
export function registerEvents(client:Client):void{
const guardedClient=client as EventClient;
if(guardedClient[EVENTS_REGISTERED]){console.warn('[Events] registerEvents() called more than once; ignoring duplicate registration.');return;}
guardedClient[EVENTS_REGISTERED]=true;
client.once(Events.ClientReady,safe('ready',async(...args:any[])=>{const{handleReady}=await import('./ready.js');return handleReady(...args);}));
client.on(Events.InteractionCreate,safe('clearChannelsButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('clearchannels:')){const{handleClearChannelsButton}=await import('../commands/clearchannels.js');return handleClearChannelsButton(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayPreselectButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('gwcfg_selectwinner:')){const{handleGiveawayPreselectButton}=await import('./giveawayPreselect.js');return handleGiveawayPreselectButton(interaction);}if(interaction?.isUserSelectMenu?.()&&String(interaction.customId).startsWith('gwcfg_selectwinner_user:')){const{handleGiveawayPreselectUser}=await import('./giveawayPreselect.js');return handleGiveawayPreselectUser(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawaySelectors',async(interaction:any)=>{if(String(interaction?.customId ?? '').startsWith('gws_')){const{handleGiveawaySelectors}=await import('./giveawaySelectors.js');return handleGiveawaySelectors(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayWinnerButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('giveaway_select_winner:')){const{handleGiveawayWinnerButton}=await import('./giveawayWinnerButton.js');return handleGiveawayWinnerButton(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayAdminWinnerButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('gwadmin_selectwinner:')){const{handleGiveawayAdminWinnerButton}=await import('./giveawayAdminWinnerButton.js');return handleGiveawayAdminWinnerButton(interaction);}}));
client.on(Events.InteractionCreate,safe('interactionCreate',async(...args:any[])=>{const{handleInteractionCreate}=await import('./interactionCreate.js');return handleInteractionCreate(...args);}));
// Prefixless commands are registered once from index.ts. The normal messageCreate
// listener below handles all prefixed commands and AFK/mention processing.
client.on(Events.MessageCreate,safe('messageCreate',async(message:any)=>{const m=message as EventMessage;if(m[MESSAGE_PROCESSED])return;m[MESSAGE_PROCESSED]=true;const{handleMessageCreate}=await import('./messageCreate.js');return handleMessageCreate(message);}));
client.on(Events.MessageCreate,safe('hinglishCursedWords',async(...args:any[])=>{const{handleHinglishCursedWords}=await import('./hinglishCursedWords.js');return handleHinglishCursedWords(...args);}));
client.on(Events.MessageDelete,safe('messageDelete',async(...args:any[])=>{const{handleMessageDelete}=await import('./messageDelete.js');return handleMessageDelete(...args);}));
client.on(Events.MessageUpdate,safe('messageUpdate',async(...args:any[])=>{const{handleMessageUpdate}=await import('./messageUpdate.js');return handleMessageUpdate(...args);}));
client.on(Events.MessageReactionAdd,safe('messageReactionAdd',async(...args:any[])=>{const{handleMessageReactionAdd}=await import('./messageReactionAdd.js');return handleMessageReactionAdd(...args);}));
client.on(Events.MessageReactionRemove,safe('messageReactionRemove',async(...args:any[])=>{const{handleMessageReactionRemove}=await import('./messageReactionRemove.js');return handleMessageReactionRemove(...args);}));
client.on(Events.GuildMemberAdd,safe('guildMemberAdd',async(...args:any[])=>{const{handleGuildMemberAdd}=await import('./guildMemberAdd.js');return handleGuildMemberAdd(...args);}));
client.on(Events.GuildMemberRemove,safe('guildMemberRemove',async(...args:any[])=>{const{handleGuildMemberRemove}=await import('./guildMemberRemove.js');return handleGuildMemberRemove(...args);}));
client.on(Events.GuildAuditLogEntryCreate,safe('guildAuditLogEntryCreate',async(entry:any,guild:any)=>{try{const{handleAntiNukeAudit}=await import('./antiNuke.js');await handleAntiNukeAudit(entry,guild);}catch(err){console.error('[antiNuke]',err);}const map:any={[AuditLogEvent.GuildUpdate]:'serverChanges',[AuditLogEvent.ChannelCreate]:'channelChanges',[AuditLogEvent.ChannelUpdate]:'channelChanges',[AuditLogEvent.ChannelDelete]:'channelChanges',[AuditLogEvent.RoleCreate]:'roleChanges',[AuditLogEvent.RoleUpdate]:'roleChanges',[AuditLogEvent.RoleDelete]:'roleChanges',[AuditLogEvent.MemberKick]:'moderation',[AuditLogEvent.MemberBanAdd]:'moderation',[AuditLogEvent.MemberBanRemove]:'moderation',[AuditLogEvent.MemberUpdate]:'memberChanges',[AuditLogEvent.BotAdd]:'memberChanges'};const category=map[entry.action];if(category)await auditLog(guild,category,`📋 ${category.replace(/([A-Z])/g,' $1')}`,`Discord audit event **${entry.action}** was recorded.`,entry.executor?([{name:'Executor',value:`<@${entry.executor.id}>`,inline:true}]):[]);}));
client.on(Events.GuildDelete,safe('guildDelete',async(guild:any)=>{console.log(`[Storage] Bot left guild ${guild.id}; removing persisted progression.`);await deleteGuild(String(guild.id));}));
}
