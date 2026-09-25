import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SavedEmbed } from './types.js';
import { loadGuild, updateGuild } from './storage.js';

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
    name: 'AFK',
    sourceKey: 'afk',
    description: 'The AFK setup reply shown after /afk.',
    build: () => new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('💤 Choose your AFK scope')
      .setDescription('**Reason:** AFK\n\n🏠 **Server AFK** — only this server will see your AFK status.\n🌐 **Global AFK** — every server where Sparxie is present will see it.')
      .setFooter({text:'Choose one option below • expires in 60 seconds'}),
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

function cloneSaved(s:SavedEmbed):SavedEmbed{return JSON.parse(JSON.stringify(s));}

function displayCommandName(commandName:string):string {
  if(commandName==='help')return 'Help';
  if(commandName==='antinuke')return 'Anti-Nuke';
  if(commandName==='ticket')return 'Ticket Create';
  if(commandName==='closeticket')return 'Ticket Close';
  if(commandName==='reopen')return 'Ticket Reopen';
  if(commandName==='ticketpanel')return 'Ticket Panel';
  return commandName.split(/[-_]/g).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ') || commandName;
}

function buildPlaceholder(name:string,sourceKey:string):SavedEmbed {
  return {
    name,
    sourceKey,
    placeholder:true,
    title:`/${sourceKey}`,
    description:'This command embed has not been captured yet. Run the command once, then reopen /embed-edit to load its real member-visible embed.',
    timestamp:false,
    fields:[],
  };
}

export function getEditableEmbedDefinitions(client?:ChatInputCommandInteraction['client']):Array<{name:string;sourceKey:string;description:string}> {
  const data = new Map(BUILT_INS.map(x=>[x.sourceKey,{name:x.name,sourceKey:x.sourceKey,description:x.description}]));
  if(client){
    for(const command of client.commands.values()){
      const sourceKey=command.data.name;
      if(sourceKey==='welcome' || sourceKey==='embed-edit')continue;
      const name=displayCommandName(sourceKey);
      if(!data.has(sourceKey)){
        data.set(sourceKey,{name,sourceKey,description:`Auto-detected embed for /${sourceKey}. If it has not been emitted yet, run the command once to capture it.`});
      }
    }
  }
  return [...data.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export function getEditableEmbedDefinition(name:string):EditableEmbedDefinition|undefined {
  return byName.get(name.toLowerCase());
}

export async function buildCurrentEditableEmbed(i:ChatInputCommandInteraction,name:string):Promise<{draft:SavedEmbed;original:SavedEmbed;sourceKey:string}|undefined> {
  const def=byName.get(name.toLowerCase());
  if(!def){
    const saved=loadGuild(i.guildId!).savedEmbeds?.[name];
    if(saved){
      const sourceKey=saved.sourceKey??name.toLowerCase();
      const original=cloneSaved(saved);
      const draft=cloneSaved(saved);
      return {draft,original,sourceKey};
    }
    const dynamic=getEditableEmbedDefinitions(i.client).find(x=>x.name===name);
    if(!dynamic)return undefined;
    const placeholder=buildPlaceholder(dynamic.name,dynamic.sourceKey);
    return {draft:cloneSaved(placeholder),original:cloneSaved(placeholder),sourceKey:dynamic.sourceKey};
  }
  let base=def.build(i);
  if(name.toLowerCase()==='help'){
    try{
      const {buildHelpEmbed}=await import('./commands/help.js');
      const {getGuildPrefix}=await import('./prefixHandler.js');
      const commands=Array.from(i.client.commands?.values?.()??[]);
      base=buildHelpEmbed(null,getGuildPrefix(i.guildId??''),commands as any);
    }catch{}
  }
  const generated=toSaved(def.name,def.sourceKey,base);
  const saved=loadGuild(i.guildId!).savedEmbeds?.[def.name];
  if(!saved)return {draft:generated,original:generated,sourceKey:def.sourceKey};

  // A captured embed is the real member-visible baseline. Keep it even when
  // later edits override only selected properties.
  const baseline=saved.base ? cloneSaved(saved.base) : cloneSaved(saved);
  baseline.name=def.name;
  baseline.sourceKey=def.sourceKey;
  baseline.placeholder=false;

  const draft=cloneSaved(baseline);
  if(Array.isArray(saved.overrideFields)){
    for(const key of saved.overrideFields)if(key in saved)(draft as any)[key]=(saved as any)[key];
  }else{
    Object.assign(draft,saved);
  }
  draft.name=def.name;
  draft.sourceKey=def.sourceKey;
  draft.overrideFields=saved.overrideFields;
  draft.base=undefined;
  return {draft,original:baseline,sourceKey:def.sourceKey};
}

export function savedFromDraft(name:string,sourceKey:string,draft:SavedEmbed,original:SavedEmbed):SavedEmbed {
  const fields:Array<keyof SavedEmbed>=['title','description','color','thumbnailUrl','imageUrl','footerText','footerIconUrl','authorName','authorIconUrl','timestamp','fields'];
  const changed=fields.filter(k=>JSON.stringify((draft as any)[k])!==JSON.stringify((original as any)[k]));
  return {
    ...draft,
    name,
    sourceKey,
    overrideFields:changed,
    base:cloneSaved(original),
    placeholder:false,
  };
}

export function applyEditableEmbed(guildId:string,sourceKey:string,base:EmbedBuilder):EmbedBuilder {
  const data=loadGuild(guildId);
  const saved=Object.values(data.savedEmbeds??{}).find(x=>x.sourceKey===sourceKey);
  if(!saved || !Array.isArray(saved.overrideFields) || saved.overrideFields.length===0)return base;
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
  const name=displayCommandName(commandName);
  const sourceKey=commandName==='ticket'?'ticket:create':commandName==='closeticket'?'ticket:close':commandName==='reopen'?'ticket:reopen':commandName==='ticketpanel'?'ticket:panel':commandName;
  const current=loadGuild(guildId).savedEmbeds?.[name];
  if(current && !current.placeholder)return;
  const base=toSaved(name,sourceKey,embed);
  base.overrideFields=[];
  base.placeholder=false;
  base.base=cloneSaved(base);
  updateGuild(guildId,d=>{
    d.savedEmbeds??={};
    const existing=d.savedEmbeds[name];
    if(!existing || existing.placeholder)d.savedEmbeds[name]=base;
  });
}
