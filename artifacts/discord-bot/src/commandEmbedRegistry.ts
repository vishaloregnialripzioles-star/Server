import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SavedEmbed } from './types.js';
import { loadGuild } from './storage.js';

export type EditableEmbedDefinition = {
  name: string;
  sourceKey: string;
  description: string;
  build: (interaction: ChatInputCommandInteraction) => EmbedBuilder;
};

const BUILT_INS: Array<Omit<EditableEmbedDefinition,'build'> & { build: (interaction: ChatInputCommandInteraction) => EmbedBuilder }> = [
  {
    name: 'Help',
    sourceKey: 'help',
    description: 'The main Sparxie Help Center embed.',
    build: (i) => new EmbedBuilder()
      .setColor(0x12d9d3)
      .setAuthor({name:'Sparxie Help Center'})
      .setTitle('✨ Welcome to Sparxie')
      .setDescription('Your complete command directory.')
      .setFooter({text:'Sparxie • Complete command directory'})
      .setTimestamp(),
  },
  {
    name: 'Anti-Nuke',
    sourceKey: 'antinuke',
    description: 'Anti-Nuke security response embeds.',
    build: () => new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ Anti-Nuke Security')
      .setDescription('Sparxie Anti-Nuke protection and security settings.')
      .setFooter({text:'Sparxie • Anti-Nuke Security'})
      .setTimestamp(),
  },
  {
    name: 'Ticket Create',
    sourceKey: 'ticket:create',
    description: 'Embed sent when a support ticket is opened.',
    build: () => new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Ticket Opened')
      .setDescription('Hello {user}! Your ticket is open.\n\n**Reason:**\n{reason}')
      .addFields(
        {name:'Ticket ID',value:'{ticketId}',inline:true},
        {name:'Category',value:'{category}',inline:true},
        {name:'Handler',value:'Unclaimed',inline:true},
      )
      .setTimestamp(),
  },
  {
    name: 'Ticket Close',
    sourceKey: 'ticket:close',
    description: 'Embed sent when a support ticket is closed.',
    build: () => new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('🔒 Ticket Closed')
      .setDescription('This ticket has been closed. You can save the transcript, reopen the ticket, or permanently close this channel.')
      .addFields(
        {name:'Closed By',value:'{closedBy}',inline:true},
        {name:'Reason',value:'{reason}',inline:true},
      )
      .setTimestamp(),
  },
  {
    name: 'Ticket Reopen',
    sourceKey: 'ticket:reopen',
    description: 'Embed sent when a closed ticket is reopened.',
    build: () => new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🔓 Ticket Reopened')
      .setDescription('This ticket is open again. Please continue the conversation here.')
      .setTimestamp(),
  },
  {
    name: 'Ticket Panel',
    sourceKey: 'ticket:panel',
    description: 'Embed used when a ticket panel is posted.',
    build: () => new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Ticket Panel')
      .setDescription('Choose a ticket option below.')
      .setFooter({text:'Sparxie • Ticket Support'})
      .setTimestamp(),
  },
];

const byName = new Map(BUILT_INS.map(x => [x.name.toLowerCase(), x]));

function toSaved(name:string, sourceKey:string, embed:EmbedBuilder):SavedEmbed {
  const j:any = embed.toJSON();
  return {
    name,
    sourceKey,
    title:j.title,
    description:j.description,
    color:j.color,
    thumbnailUrl:j.thumbnail?.url,
    imageUrl:j.image?.url,
    footerText:j.footer?.text,
    footerIconUrl:j.footer?.icon_url,
    authorName:j.author?.name,
    authorIconUrl:j.author?.icon_url,
    timestamp:j.timestamp !== undefined,
    fields:Array.isArray(j.fields)?j.fields.map((f:any)=>({name:String(f.name),value:String(f.value),inline:Boolean(f.inline)})):[],
  };
}

function fromSaved(s:SavedEmbed):EmbedBuilder {
  const out:any={};
  if(s.title!==undefined)out.title=s.title;
  if(s.description!==undefined)out.description=s.description;
  if(s.color!==undefined)out.color=s.color;
  if(s.thumbnailUrl)out.thumbnail={url:s.thumbnailUrl};
  if(s.imageUrl)out.image={url:s.imageUrl};
  if(s.footerText!==undefined)out.footer={text:s.footerText,...(s.footerIconUrl?{icon_url:s.footerIconUrl}:{})};
  if(s.authorName!==undefined)out.author={name:s.authorName,...(s.authorIconUrl?{icon_url:s.authorIconUrl}:{})};
  if(s.timestamp)out.timestamp=new Date().toISOString();
  if(s.fields?.length)out.fields=s.fields.map(f=>({name:f.name,value:f.value,inline:Boolean(f.inline)}));
  return new EmbedBuilder(out);
}

export function getEditableEmbedDefinitions():Array<{name:string;sourceKey:string;description:string}> {
  const data = new Map(BUILT_INS.map(x=>[x.name.toLowerCase(),x]));
  return [...data.values()].map(x=>({name:x.name,sourceKey:x.sourceKey,description:x.description}));
}

export function getEditableEmbedDefinition(name:string):EditableEmbedDefinition|undefined {
  return byName.get(name.toLowerCase());
}

export async function buildCurrentEditableEmbed(i:ChatInputCommandInteraction,name:string):Promise<{draft:SavedEmbed;original:SavedEmbed;sourceKey:string}|undefined> {
  const def=byName.get(name.toLowerCase());
  if(!def)return undefined;
  let base=def.build(i);
  if(name.toLowerCase()==='help'){
    try{
      const {buildHelpEmbed}=await import('./commands/help.js');
      const {getGuildPrefix}=await import('./prefixHandler.js');
      const commands=Array.from(i.client.commands?.values?.()??[]);
      base=buildHelpEmbed(null,getGuildPrefix(i.guildId??''),commands as any);
    }catch{}
  }
  const original=toSaved(def.name,def.sourceKey,base);
  const saved=loadGuild(i.guildId!).savedEmbeds?.[def.name];
  if(!saved)return {draft:original,original,sourceKey:def.sourceKey};
  const merged:SavedEmbed={...original,...saved,name:def.name,sourceKey:def.sourceKey};
  if(saved.overrideFields?.length){
    const current:any=original,d:any=merged;
    for(const key of Object.keys(current) as Array<keyof SavedEmbed>){
      if(key==='name'||key==='sourceKey'||key==='overrideFields')continue;
      if(!saved.overrideFields.includes(key))delete (d as any)[key];
    }
    const normalized:SavedEmbed={...original,...saved,name:def.name,sourceKey:def.sourceKey};
    for(const key of saved.overrideFields)if(key in saved)(normalized as any)[key]=(saved as any)[key];
    return {draft:normalized,original,sourceKey:def.sourceKey};
  }
  return {draft:merged,original,sourceKey:def.sourceKey};
}

export function savedFromDraft(name:string,sourceKey:string,draft:SavedEmbed,original:SavedEmbed):SavedEmbed {
  const fields:Array<keyof SavedEmbed>=['title','description','color','thumbnailUrl','imageUrl','footerText','footerIconUrl','authorName','authorIconUrl','timestamp','fields'];
  const changed=fields.filter(k=>JSON.stringify((draft as any)[k])!==JSON.stringify((original as any)[k]));
  return {...draft,name,sourceKey,overrideFields:changed};
}

export function applyEditableEmbed(guildId:string,sourceKey:string,base:EmbedBuilder):EmbedBuilder {
  const data=loadGuild(guildId);
  const saved=Object.values(data.savedEmbeds??{}).find(x=>x.sourceKey===sourceKey);
  if(!saved)return base;
  const j:any=base.toJSON();
  const overrideKeys=saved.overrideFields?.length?saved.overrideFields:['title','description','color','thumbnailUrl','imageUrl','footerText','footerIconUrl','authorName','authorIconUrl','timestamp','fields'];
  const next:any={...j};
  for(const key of overrideKeys){
    if(key==='title')saved.title===undefined?delete next.title:next.title=saved.title;
    else if(key==='description')saved.description===undefined?delete next.description:next.description=saved.description;
    else if(key==='color')saved.color===undefined?delete next.color:next.color=saved.color;
    else if(key==='thumbnailUrl')saved.thumbnailUrl===undefined?delete next.thumbnail:saved.thumbnailUrl&&(next.thumbnail={url:saved.thumbnailUrl});
    else if(key==='imageUrl')saved.imageUrl===undefined?delete next.image:saved.imageUrl&&(next.image={url:saved.imageUrl});
    else if(key==='footerText'){if(saved.footerText===undefined)delete next.footer;else next.footer={text:saved.footerText,...(saved.footerIconUrl?{icon_url:saved.footerIconUrl}:{})};}
    else if(key==='footerIconUrl'&&next.footer&&saved.footerIconUrl)next.footer={...next.footer,icon_url:saved.footerIconUrl};
    else if(key==='authorName'){if(saved.authorName===undefined)delete next.author;else next.author={name:saved.authorName,...(saved.authorIconUrl?{icon_url:saved.authorIconUrl}:{})};}
    else if(key==='authorIconUrl'&&next.author&&saved.authorIconUrl)next.author={...next.author,icon_url:saved.authorIconUrl};
    else if(key==='timestamp'){if(saved.timestamp)next.timestamp=new Date().toISOString();else delete next.timestamp;}
    else if(key==='fields')next.fields=(saved.fields??[]).map(f=>({name:f.name,value:f.value,inline:Boolean(f.inline)}));
  }
  return new EmbedBuilder(next);
}

export function captureCommandEmbed(guildId:string,commandName:string,embed:EmbedBuilder):void {
  const name=commandName==='help'?'Help':commandName==='antinuke'?'Anti-Nuke':commandName==='ticket'?'Ticket Create':commandName==='closeticket'?'Ticket Close':commandName;
  const sourceKey=commandName==='ticket'?'ticket:create':commandName==='closeticket'?'ticket:close':commandName;
  const current=loadGuild(guildId).savedEmbeds?.[name];
  if(current)return;
  const base=toSaved(name,sourceKey,embed);
  // Auto-register the first real embed a command emits so the editor grows with the bot.
  // It is intentionally stored only as an editable baseline, not as a user override.
  loadGuild(guildId).savedEmbeds[name]=base;
}
