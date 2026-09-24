import { ChannelType, OverwriteType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild, type User, type Client, type TextChannel, type OverwriteResolvable } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { generateId } from './utils.js';
import type { TicketPanelConfig, TicketPanelOption } from './types.js';

export type TicketResult = { success:true; channel:TextChannel; ticketId:string } | { success:false; message:string };

export function getTicketPanel(guild:Guild,panelId?:string):TicketPanelConfig|undefined {
  const panels=loadGuild(guild.id).config.ticketPanels??{};
  if(panelId&&panels[panelId]) return panels[panelId];
  return Object.values(panels).find(p=>p.id===panelId)||Object.values(panels)[0];
}

export function getTicketPanelOption(panel:TicketPanelConfig|undefined,optionId?:string):TicketPanelOption|undefined {
  if(!panel?.options?.length||!optionId)return undefined;
  return panel.options.find(option=>option.id===optionId);
}

export async function createTicketForUser(guild:Guild,user:User,client:Client,reason:string,panelId?:string,answers?:Record<string,string>,optionId?:string):Promise<TicketResult>{
  const data=loadGuild(guild.id);const panel=getTicketPanel(guild,panelId);const option=getTicketPanelOption(panel,optionId);
  if(optionId&&!option)return{success:false,message:'That ticket category is no longer available.'};
  const existing=Object.values(data.tickets).find(t=>t.creatorId===user.id&&!t.closed);
  if(existing)return{success:false,message:`You already have an open ticket: <#${existing.channelId}>.`};
  const ticketId=generateId();const safeName=user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20)||'user';const channelName=`ticket-${safeName}-${ticketId.slice(-4)}`;
  const supportRoleId=option?.supportRoleId??panel?.supportRoleId??data.config.ticketSupportRole;const categoryId=option?.categoryId??panel?.categoryId??data.config.ticketCategory;
  const overwrites:OverwriteResolvable[]=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel],type:OverwriteType.Role},
    {id:user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory],type:OverwriteType.Member},
    {id:client.user!.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory],type:OverwriteType.Member},
  ];
  if(supportRoleId)overwrites.push({id:supportRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages],type:OverwriteType.Role});
  try{
    const ticketChannel=await guild.channels.create({name:channelName,type:ChannelType.GuildText,...(categoryId?{parent:categoryId}:{}),permissionOverwrites:overwrites}) as TextChannel;
    updateGuild(guild.id,d=>{d.tickets[ticketId]={id:ticketId,channelId:ticketChannel.id,creatorId:user.id,createdAt:Date.now(),closed:false,panelId:panel?.id,panelOptionId:option?.id};});
    const embed=new EmbedBuilder().setColor(panel?.color??0x5865F2).setTitle(option?.name?`🎫 ${panel?.title??'Ticket'} • ${option.name}`:panel?.title?`🎫 ${panel.title}`:'🎫 Support Ticket Opened').setDescription(`Hello <@${user.id}>! Your ticket is open.\n\n**Reason:**\n${reason}`).addFields({name:'Ticket ID',value:`\`${ticketId}\``,inline:true},{name:'Category',value:option?.name??panel?.name??'Support',inline:true},{name:'Handler',value:'Unclaimed',inline:true}).setTimestamp();
    if(panel&&Object.keys(answers??{}).length){const text=Object.entries(answers!).map(([q,a])=>`**${q}**\n${a}`).join('\n\n').slice(0,4000);embed.addFields({name:'📋 Ticket Questions',value:text||'No answers'});}
    const controls=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`ticket:unclaim:${ticketId}`).setLabel('Unclaim').setEmoji('↩️').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger));
    await ticketChannel.send({content:`<@${user.id}>${supportRoleId?` <@&${supportRoleId}>`:''}`,embeds:[embed],components:[controls],allowedMentions:{users:[user.id],roles:supportRoleId?[supportRoleId]:[]}});
    return{success:true,channel:ticketChannel,ticketId};
  }catch(err){console.error('Failed to create ticket:',err);return{success:false,message:'Failed to create ticket channel. Make sure I have Manage Channels.'};}
}

export async function setTicketClaim(guild:Guild,ticketId:string,staffId:string|null):Promise<{ok:boolean;message:string}>{
  const data=loadGuild(guild.id);const ticket=data.tickets[ticketId];if(!ticket||ticket.closed)return{ok:false,message:'Ticket is not open.'};
  const panel=(data.config.ticketPanels??{})[ticket.panelId??''];const option=panel?.options?.find(item=>item.id===ticket.panelOptionId);const supportRoleId=option?.supportRoleId??panel?.supportRoleId??data.config.ticketSupportRole;const channel=await guild.channels.fetch(ticket.channelId).catch(()=>null) as TextChannel|null;if(!channel)return{ok:false,message:'Ticket channel no longer exists.'};
  updateGuild(guild.id,d=>{d.tickets[ticketId].assignedStaffId=staffId??undefined;});
  if(supportRoleId){await channel.permissionOverwrites.edit(supportRoleId,{ViewChannel:true,ReadMessageHistory:true,SendMessages:false}).catch(()=>undefined);}
  if(staffId){await channel.permissionOverwrites.edit(staffId,{ViewChannel:true,ReadMessageHistory:true,SendMessages:true}).catch(()=>undefined);}return{ok:true,message:staffId?`<@${staffId}> is now the primary ticket handler.`:'Ticket is unclaimed; staff can read but cannot chat.'};
}

export async function closeTicketById(guild:Guild,ticketId:string,reason:string,userTag:string):Promise<boolean>{const data=loadGuild(guild.id),ticket=data.tickets[ticketId];if(!ticket||ticket.closed)return false;updateGuild(guild.id,d=>{d.tickets[ticketId].closed=true;});const channel=await guild.channels.fetch(ticket.channelId).catch(()=>null) as TextChannel|null;if(channel)await channel.send({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('🔒 Ticket Closed').addFields({name:'Closed By',value:userTag,inline:true},{name:'Reason',value:reason.slice(0,1024),inline:true}).setTimestamp()]}).catch(()=>undefined);if(channel)setTimeout(()=>{void channel.delete(`Ticket closed by ${userTag}: ${reason}`).catch(()=>undefined);},3000);return true;}
