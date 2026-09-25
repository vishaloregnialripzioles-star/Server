import type { Client } from 'discord.js';
import { Events, AuditLogEvent, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, type TextChannel } from 'discord.js';
import { auditLog } from '../auditLogger.js';
import { deleteGuild, loadGuild } from '../storage.js';
import { registerBloxValueEvents } from '../bloxValueEvents.js';
import { registerBloxValueIconEvents } from '../bloxValueIconEvents.js';
import { registerBloxValueSync } from '../bloxValueSync.js';
import { handleBloxEmojiInteraction, handleBloxEmojiModal } from '../commands/bloxemoji.js';
import { handleEmbedEditorInteraction } from '../embedEditor.js';
import { registerEnhancedAutoMod } from './enhancedAutoMod.js';
import { handleSecurityPrefix } from '../securityPrefix.js';
import { closeTicketById, setTicketClaim, createTicketForUser, reopenTicketById, buildTicketTranscript } from '../ticketUtils.js';
function safe(name:string,fn:(...args:any[])=>any){return(...args:any[])=>{try{Promise.resolve(fn(...args)).catch((err:unknown)=>console.error(`[${name}]`,err));}catch(err){console.error(`[${name}]`,err);}};}
const EVENTS_REGISTERED=Symbol.for('sparxie.events.registered');const MESSAGE_PROCESSED=Symbol.for('sparxie.message.processed');const SECURITY_PREFIX_PROCESSED=Symbol.for('sparxie.security.prefix.processed');
export function registerEvents(client:Client):void{
if((client as any)[EVENTS_REGISTERED]){console.warn('[Events] registerEvents() called more than once; ignoring duplicate registration.');return;} (client as any)[EVENTS_REGISTERED]=true;registerBloxValueEvents(client);registerBloxValueIconEvents(client);registerBloxValueSync(client);registerEnhancedAutoMod(client);
client.on(Events.InteractionCreate,safe('embedEditor',async(interaction:any)=>{await handleEmbedEditorInteraction(interaction);}));
client.once(Events.ClientReady,safe('ready',async(...args:any[])=>{const{handleReady}=await import('./ready.js');return handleReady(...args);}));
client.on(Events.InteractionCreate,safe('bloxEmoji',async(interaction:any)=>{if(interaction?.isModalSubmit?.()&&String(interaction.customId).startsWith('bloxemoji:modal:'))return handleBloxEmojiModal(interaction);if((interaction?.isButton?.()||interaction?.isStringSelectMenu?.())&&String(interaction.customId).startsWith('bloxemoji:'))return handleBloxEmojiInteraction(interaction);}));
client.on(Events.InteractionCreate,safe('ticketControls',async(interaction:any)=>{const id=String(interaction?.customId??'');if(!interaction?.guild||!id.startsWith('ticket:'))return;const parts=id.split(':');const action=parts[1],targetId=parts[2];if(!action||!targetId)return;const data=loadGuild(interaction.guild.id);
  const panel=Object.values(data.config.ticketPanels??{}).find(p=>p.id===targetId)||(data.config.ticketPanels??{})[targetId];
  if((action==='select'||action==='open')&&(interaction.isStringSelectMenu()||interaction.isButton())){
    if(!panel){await interaction.reply({content:'❌ This ticket panel no longer exists.',ephemeral:true});return;}
    const optionId=action==='select'&&interaction.isStringSelectMenu()?interaction.values[0]:undefined;
    const option=optionId?panel.options?.find(item=>item.id===optionId):undefined;
    if(optionId&&!option){await interaction.reply({content:'❌ That ticket category is no longer available.',ephemeral:true});return;}
    const questions=option?.questions??panel.questions;
    if(!questions.length){
      const result=await createTicketForUser(interaction.guild,interaction.user,interaction.client,'Opened from ticket panel',panel.name,undefined,option?.id);
      await interaction.reply({content:result.success?'✅ Ticket created: <#'+result.channel.id+'>':'❌ '+result.message,ephemeral:true});return;
    }
    const modalId=option?.id?'ticket:modal:'+panel.id+':'+option.id:'ticket:modal:'+panel.id;
    const modal=new ModalBuilder().setCustomId(modalId).setTitle((option?.name??panel.title).slice(0,45));
    questions.slice(0,5).forEach((q,index)=>modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('q'+index).setLabel(q.slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
    await interaction.showModal(modal);return;
  }
  const ticket=data.tickets[targetId];
  if(!ticket){await interaction.reply({content:'❌ This ticket no longer exists.',ephemeral:true});return;}
  const isStaff=Boolean(interaction.member?.permissions?.has?.(8n)||interaction.member?.permissions?.has?.(16n));
  if(action==='save'){
    if(!isStaff&&ticket.creatorId!==interaction.user.id){await interaction.reply({content:'❌ Only staff or the ticket owner can save a transcript.',ephemeral:true});return;}
    const logId=data.config.transcriptLogChannel;
    const logChannel=logId?await interaction.guild.channels.fetch(logId).catch(()=>null) as TextChannel|null:null;
    if(!logChannel?.isTextBased?.()){await interaction.reply({content:'❌ No valid transcript logging channel is configured. Use /transcripts set first.',ephemeral:true});return;}
    await interaction.deferReply({ephemeral:true});
    const attachment=await buildTicketTranscript(interaction.channel as TextChannel,ticket.id);
    await logChannel.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('📄 Ticket Transcript').setDescription('Transcript for ticket '+ticket.id+' from <#'+ticket.channelId+'>.').addFields({name:'Ticket Owner',value:'<@'+ticket.creatorId+'>',inline:true},{name:'Saved By',value:'<@'+interaction.user.id+'>',inline:true}).setTimestamp()],files:[attachment]});
    await interaction.editReply('✅ Transcript saved to <#'+logId+'>.');return;
  }
  if(action==='reopen'){
    if(!ticket.closed){await interaction.reply({content:'❌ This ticket is already open.',ephemeral:true});return;}
    if(!isStaff&&ticket.creatorId!==interaction.user.id){await interaction.reply({content:'❌ Only staff or the ticket owner can reopen this ticket.',ephemeral:true});return;}
    const ok=await reopenTicketById(interaction.guild,targetId);await interaction.reply({content:ok?'🔓 Ticket reopened successfully.':'❌ I could not reopen this ticket.',ephemeral:true});return;
  }
  if(action==='delete'){
    if(!ticket.closed){await interaction.reply({content:'❌ Close the ticket first.',ephemeral:true});return;}
    if(!isStaff){await interaction.reply({content:'❌ Staff only.',ephemeral:true});return;}
    await interaction.reply({content:'🗑️ Closing this ticket permanently…',ephemeral:true});
    await interaction.channel?.delete('Ticket permanently closed by '+interaction.user.tag).catch(()=>undefined);return;
  }
  if(ticket.closed){await interaction.reply({content:'❌ This ticket is closed. Use Reopen to continue.',ephemeral:true});return;}  if(action==='claim'||action==='unclaim'){if(!isStaff){await interaction.reply({content:'❌ Staff only.',ephemeral:true});return;}const result=await setTicketClaim(interaction.guild,targetId,action==='claim'?interaction.user.id:null);await interaction.reply({content:result.message,ephemeral:true});return;}
  if(action==='close'){if(!isStaff&&ticket.creatorId!==interaction.user.id){await interaction.reply({content:'❌ Only the ticket owner or staff can close this ticket.',ephemeral:true});return;}await interaction.deferReply({ephemeral:true});await closeTicketById(interaction.guild,targetId,'Closed from ticket controls',interaction.user.tag);await interaction.editReply('🔒 Ticket closed. Use the buttons in the closed-ticket message to save the transcript, reopen it, or permanently close the channel.');return;}
}));
client.on(Events.InteractionCreate,safe('ticketModal',async(interaction:any)=>{if(!interaction?.isModalSubmit?.()||!String(interaction.customId).startsWith('ticket:modal:')||!interaction.guild)return;const modalParts=String(interaction.customId).split(':');const panelId=modalParts[2];const optionId=modalParts[3];const data=loadGuild(interaction.guild.id);const panel=Object.values(data.config.ticketPanels??{}).find(p=>p.id===panelId)||(data.config.ticketPanels??{})[panelId];if(!panel){await interaction.reply({content:'❌ This ticket panel no longer exists.',ephemeral:true});return;}const option=optionId?panel.options?.find(item=>item.id===optionId):undefined;if(optionId&&!option){await interaction.reply({content:'❌ That ticket category is no longer available.',ephemeral:true});return;}const questions=option?.questions??panel.questions;const answers:Record<string,string>={};questions.slice(0,5).forEach((q,i)=>{answers[q]=interaction.fields.getTextInputValue('q'+i);});const reason=answers[questions[0]]??'Opened from ticket panel';const result=await createTicketForUser(interaction.guild,interaction.user,interaction.client,reason,panel.name,answers,option?.id);await interaction.reply({content:result.success?'✅ Ticket created: <#'+result.channel.id+'>':'❌ '+result.message,ephemeral:true});}));
client.on(Events.InteractionCreate,safe('tradeModal',async(interaction:any)=>{if(interaction?.isModalSubmit?.()&&String(interaction.customId).startsWith('tradecalc:')){const{handleTradeModal}=await import('../commands/trade.js');return handleTradeModal(interaction);}}));
client.on(Events.InteractionCreate,safe('clearChannelsButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('clearchannels:')){const{handleClearChannelsButton}=await import('../commands/clearchannels.js');return handleClearChannelsButton(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayPreselectButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('gwcfg_selectwinner:')){const{handleGiveawayPreselectButton}=await import('./giveawayPreselect.js');return handleGiveawayPreselectButton(interaction);}if(interaction?.isUserSelectMenu?.()&&String(interaction.customId).startsWith('gwcfg_selectwinner_user:')){const{handleGiveawayPreselectUser}=await import('./giveawayPreselect.js');return handleGiveawayPreselectUser(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawaySelectors',async(interaction:any)=>{if(String(interaction?.customId??'').startsWith('gws_')){const{handleGiveawaySelectors}=await import('./giveawaySelectors.js');return handleGiveawaySelectors(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayWinnerButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('giveaway_select_winner:')){const{handleGiveawayWinnerButton}=await import('./giveawayWinnerButton.js');return handleGiveawayWinnerButton(interaction);}}));
client.on(Events.InteractionCreate,safe('giveawayAdminWinnerButton',async(interaction:any)=>{if(interaction?.isButton?.()&&String(interaction.customId).startsWith('gwadmin_selectwinner:')){const{handleGiveawayAdminWinnerButton}=await import('./giveawayAdminWinnerButton.js');return handleGiveawayAdminWinnerButton(interaction);}}));
client.on(Events.InteractionCreate,safe('interactionCreate',async(...args:any[])=>{const{handleInteractionCreate}=await import('./interactionCreate.js');return handleInteractionCreate(...args);}));
client.on(Events.MessageCreate,safe('securityPrefix',async(message:any)=>{if(message?.[SECURITY_PREFIX_PROCESSED])return;if(await handleSecurityPrefix(message))message[SECURITY_PREFIX_PROCESSED]=true;}));
client.on(Events.MessageCreate,safe('botMention',async(message:any)=>{if(message?.author?.bot||!message?.guild||!client.user)return;const content=String(message.content??'').replace(new RegExp(`<@!?${client.user.id}>`,'g'),'').trim();if(!message.mentions?.users?.has(client.user.id)||content.length>0)return;await message.reply({content:`Hi, I am **SPARXIE**! 👋\nUse **${(await import('../prefixHandler.js')).getGuildPrefix(message.guild.id)}help** to see my main features.`,allowedMentions:{parse:[]}}).catch(()=>undefined);}));
client.on(Events.MessageCreate,safe('messageCreate',async(message:any)=>{if(message?.[MESSAGE_PROCESSED]||message?.[SECURITY_PREFIX_PROCESSED])return;message[MESSAGE_PROCESSED]=true;const{handleMessageCreate}=await import('./messageCreate.js');return handleMessageCreate(message);}));
client.on(Events.MessageCreate,safe('hinglishCursedWords',async(...args:any[])=>{const{handleHinglishCursedWords}=await import('./hinglishCursedWords.js');return handleHinglishCursedWords(...args);}));
client.on(Events.MessageDelete,safe('messageDelete',async(...args:any[])=>{const{handleMessageDelete}=await import('./messageDelete.js');return handleMessageDelete(...args);}));
client.on(Events.MessageUpdate,safe('messageUpdate',async(...args:any[])=>{const{handleMessageUpdate}=await import('./messageUpdate.js');return handleMessageUpdate(...args);}));
client.on(Events.MessageReactionAdd,safe('messageReactionAdd',async(...args:any[])=>{const{handleMessageReactionAdd}=await import('./messageReactionAdd.js');return handleMessageReactionAdd(...args);}));
client.on(Events.MessageReactionRemove,safe('messageReactionRemove',async(...args:any[])=>{const{handleMessageReactionRemove}=await import('./messageReactionRemove.js');return handleMessageReactionRemove(...args);}));
client.on(Events.GuildMemberAdd,safe('guildMemberAdd',async(...args:any[])=>{const{handleGuildMemberAdd}=await import('./guildMemberAdd.js');return handleGuildMemberAdd(...args);}));
client.on(Events.GuildMemberRemove,safe('guildMemberRemove',async(...args:any[])=>{const{handleGuildMemberRemove}=await import('./guildMemberRemove.js');return handleGuildMemberRemove(...args);}));
client.on(Events.VoiceStateUpdate,safe('voiceLog',async(oldState:any,newState:any)=>{const member=newState.member??oldState.member;if(!member?.guild)return;let action='updated voice state';if(!oldState.channelId&&newState.channelId)action='joined voice';else if(oldState.channelId&&!newState.channelId)action='left voice';else if(oldState.channelId!==newState.channelId)action='moved voice';await auditLog(member.guild,'voice',`🔊 ${member.user.tag} ${action}`,`Voice activity for <@${member.id}>.`,[{name:'Before',value:oldState.channelId?`<#${oldState.channelId}>`:'None',inline:true},{name:'After',value:newState.channelId?`<#${newState.channelId}>`:'None',inline:true}]);}));
client.on(Events.GuildAuditLogEntryCreate,safe('guildAuditLogEntryCreate',async(entry:any,guild:any)=>{try{const{handleAntiNukeAudit}=await import('./antiNuke.js');await handleAntiNukeAudit(entry,guild);}catch(err){console.error('[antiNuke]',err);}const map:any={[AuditLogEvent.GuildUpdate]:'serverChanges',[AuditLogEvent.ChannelCreate]:'channelChanges',[AuditLogEvent.ChannelUpdate]:'channelChanges',[AuditLogEvent.ChannelDelete]:'channelChanges',[AuditLogEvent.RoleCreate]:'roleChanges',[AuditLogEvent.RoleUpdate]:'roleChanges',[AuditLogEvent.RoleDelete]:'roleChanges',[AuditLogEvent.MemberKick]:'moderation',[AuditLogEvent.MemberBanAdd]:'moderation',[AuditLogEvent.MemberBanRemove]:'moderation',[AuditLogEvent.MemberUpdate]:'memberChanges',[AuditLogEvent.BotAdd]:'memberChanges',[AuditLogEvent.WebhookCreate]:'serverChanges',[AuditLogEvent.WebhookDelete]:'serverChanges'};const category=map[entry.action];if(category)await auditLog(guild,category,`📋 ${category.replace(/([A-Z])/g,' $1')}`,`Discord audit event **${entry.action}** was recorded.`,entry.executor?([{name:'Executor',value:`<@${entry.executor.id}>`,inline:true}]):[]);}));
client.on(Events.GuildDelete,safe('guildDelete',async(guild:any)=>{console.log(`[Storage] Bot left guild ${guild.id}; removing persisted progression.`);await deleteGuild(String(guild.id));}));}
