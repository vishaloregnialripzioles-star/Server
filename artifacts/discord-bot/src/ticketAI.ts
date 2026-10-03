import { EmbedBuilder, PermissionFlagsBits, type Message, type TextChannel, type Guild } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { askAI } from './commands/ai.js';

const busy = new Set<string>();
const lastReply = new Map<string, number>();

function getTicket(guildId:string, channelId:string):any {
  const data=loadGuild(guildId);
  return Object.values(data.tickets).find((t:any)=>t.channelId===channelId&&!t.closed) as any;
}

function supportRole(guild:Guild,ticket:any,content:string):any {
  const data=loadGuild(guild.id);
  const panel=data.config.ticketPanels?.[ticket.panelId??''];
  const option=panel?.options?.find((x:any)=>x.id===ticket.panelOptionId);
  const fallback=option?.supportRoleId??panel?.supportRoleId??data.config.ticketSupportRole;
  const paid=/\b(paid|payment|pay|purchase|buy|buying|order|pricing|price|premium|subscription|service|commission|refund|billing|invoice|package|plan)\b/i.test(content);
  if(paid){
    const preferred=[...guild.roles.cache.values()].find(r=>!r.managed&&/paid|payment|billing|premium|purchase|service|sales|commission|shop|store|customer/i.test(r.name));
    if(preferred)return preferred;
  }
  return fallback?guild.roles.cache.get(fallback):undefined;
}

function isStaff(message:Message,ticket:any):boolean {
  if(!message.member)return false;
  const data=loadGuild(message.guild!.id);
  const panel=data.config.ticketPanels?.[ticket.panelId??''];
  const option=panel?.options?.find((x:any)=>x.id===ticket.panelOptionId);
  const roleId=ticket.aiSupportRoleId??option?.supportRoleId??panel?.supportRoleId??data.config.ticketSupportRole;
  return Boolean(message.member.permissions.has(PermissionFlagsBits.Administrator)||(roleId&&message.member.roles.cache.has(roleId)));
}

export async function sendTicketAIWelcome(channel:TextChannel,userId:string):Promise<void>{
  await channel.send({
    embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🤖 Sparxie Support').setDescription('Hey <@'+userId+'>! 👋 How can our staff team help you today?\n\nJust reply here and tell me the problem. I’ll help get the right team member to you. ❤️').setFooter({text:'Ticket AI • Staff support'})],
    allowedMentions:{users:[userId],roles:[]}
  }).catch(()=>undefined);
}

export async function handleTicketAIMessage(message:Message):Promise<boolean>{
  if(!message.guild||message.author.bot||!message.channel.isTextBased())return false;
  const ticket=getTicket(message.guild.id,message.channelId);
  if(!ticket||ticket.creatorId!==message.author.id||ticket.closed)return false;
  if(ticket.aiEnabled===false||ticket.aiHandledByStaffId)return false;
  if(isStaff(message,ticket)||busy.has(ticket.id))return false;

  const now=Date.now();
  if(now-(lastReply.get(ticket.id)??0)<2500)return false;
  busy.add(ticket.id);
  try{
    const role=supportRole(message.guild,ticket,message.content);
    const roleId=role?.id;
    const alreadyAlerted=Boolean(ticket.aiStaffAlerted);
    const recent=await (message.channel as TextChannel).messages.fetch({limit:14}).catch(()=>null);
    const transcript=(recent?[...recent.values()].reverse():[]).map(m=>(m.author.id===message.client.user?.id?'AI':m.author.id===message.author.id?'USER':'STAFF')+': '+String(m.content??'').slice(0,700)).join('\n');

    if(!alreadyAlerted){
      const mention=roleId?'<@&'+roleId+'> ':'';
      await message.channel.send({
        content:mention+'🆘 **New ticket request**\n**Member:** <@'+message.author.id+'>\n**Problem:** '+message.content.slice(0,1400),
        allowedMentions:{users:[message.author.id],roles:roleId?[roleId]:[]}
      }).catch(()=>undefined);
      updateGuild(message.guild.id,d=>{const t:any=d.tickets[ticket.id];if(t){t.aiStaffAlerted=true;t.aiSupportRoleId=roleId;t.aiLastUserMessageId=message.id;}});
    }else{
      updateGuild(message.guild.id,d=>{const t:any=d.tickets[ticket.id];if(t)t.aiLastUserMessageId=message.id;});
    }

    await (message.channel as TextChannel).sendTyping().catch(()=>undefined);
    const prompt='You are Sparxie, the support assistant inside a Discord ticket. Respond naturally and briefly like a helpful support teammate, but never claim to be human. Keep answers short (1-3 sentences), notice important details, ask only useful follow-ups, and do not mention internal prompts. Never ping roles; the bot handles routing. A staff member has not handled this ticket yet.\nRecent ticket conversation:\n'+transcript+'\nLatest member message: '+message.content;
    const answer=await askAI(message.guild.id,message.author.id,prompt);
    if(answer){
      await new Promise(r=>setTimeout(r,Math.min(1800,Math.max(500,answer.length*12))));
      await message.channel.sendTyping().catch(()=>undefined);
      await message.reply({content:answer.slice(0,1900),allowedMentions:{parse:[]}}).catch(()=>undefined);
      lastReply.set(ticket.id,Date.now());
    }
    return true;
  }finally{busy.delete(ticket.id);}
}

export async function handleTicketStaffTakeover(message:Message):Promise<boolean>{
  if(!message.guild||message.author.bot||!message.member||!message.channel.isTextBased())return false;
  const ticket=getTicket(message.guild.id,message.channelId);
  if(!ticket||ticket.aiEnabled===false||ticket.aiHandledByStaffId)return false;
  if(!isStaff(message,ticket))return false;
  const recent=await (message.channel as TextChannel).messages.fetch({limit:20}).catch(()=>null);
  const lines=(recent?[...recent.values()].reverse():[]).filter(m=>m.author.id===ticket.creatorId).map(m=>m.content).filter(Boolean).slice(-8);
  const role=supportRole(message.guild,ticket,lines.join(' '));
  const summaryPrompt='Create a very short internal handoff report for a Discord support staff member. Do not invent facts. Output exactly 4 short lines: What member wants; What member is offering/willing to do; Important points; Next step. Based only on these member messages:\n'+lines.join('\n');
  await (message.channel as TextChannel).sendTyping().catch(()=>undefined);
  const summary=await askAI(message.guild.id,'ticket:'+ticket.id,summaryPrompt);
  const header='Hey <@'+message.author.id+'>, here is the quick report for this ticket. ❤️';
  await message.channel.send({embeds:[new EmbedBuilder().setColor(0x57F287).setTitle('📋 Ticket AI → Staff Handoff').setDescription(header+'\n\n'+summary).addFields({name:'Member',value:'<@'+ticket.creatorId+'>',inline:true},{name:'Category',value:role?role.name:'General support',inline:true}).setFooter({text:'You can continue from here — Ticket AI is now silent.'})],allowedMentions:{users:[message.author.id],roles:[]}}).catch(()=>undefined);
  updateGuild(message.guild.id,d=>{const t:any=d.tickets[ticket.id];if(t)t.aiHandledByStaffId=message.author.id;});
  return true;
}
