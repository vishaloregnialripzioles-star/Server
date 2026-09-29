
import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Client, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import type { Command } from './types.js';
import { loadGuild, updateGuild } from './storage.js';
import { BLOX_VALUES, findBloxValue } from './commands/bloxvalue.js';

const URL='https://fruityblox.com/stock';
const POLL=60_000;
const REG=Symbol.for('sparxie.bloxstock.registered');

type Fruit={name:string;price?:number;image:string;rarity:string};
type Stock={normal:Fruit[];mirage:Fruit[];checked:number;normalReset?:number;mirageReset?:number};

const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const slug=(s:string)=>norm(s).replace(/ /g,'-');
const FRUIT_EMOJI:Record<string,string>={
  'west dragon':'🐲',
  'east dragon':'🐉',
  'tiger':'🐯',
  'kitsune':'🦊',
  'control':'🎮',
  'yeti':'❄️',
  'gas':'💨',
  'dough':'🍩',
  'venom':'☠️',
  't-rex':'🦖',
  'gravity':'🪐',
  'mammoth':'🦣',
  'spirit':'👻',
  'shadow':'🌑',
  'lightning':'⚡',
  'pain':'💥',
  'portal':'🌀',
  'buddha':'🧘',
  'blizzard':'🌨️',
  'phoenix':'🔥',
  'creation':'✨',
  'sound':'🔊',
  'spider':'🕷️',
  'love':'💗',
  'quake':'🌋',
  'magma':'🌋',
  'light':'💡',
  'ghost':'👻',
  'rubber':'🛞',
  'diamond':'💎',
  'eagle':'🦅',
  'ice':'🧊',
  'sand':'🏜️',
  'dark':'🌑',
  'flame':'🔥',
  'spike':'🔺',
  'smoke':'💨',
  'bomb':'💣',
  'spring':'🌱',
  'blade':'🗡️',
  'spin':'🌀',
  'rocket':'🚀',
};
const fruitLabel=(name:string)=>`${FRUIT_EMOJI[norm(name)]??'🍈'} ${name} fruit`;
const ist=(n:number)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(n));
const role=(id:string)=>'<@&'+id+'>';
const token=(s:string,fruit='',dealer='')=>s.replaceAll('{fruit}',fruit).replaceAll('{dealer}',dealer).replaceAll('{time}',ist(Date.now()));
function text(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');}

function parseMoney(value:string):number|undefined{
  const raw=value.trim().toUpperCase().replace(/[,\\s]/g,'');
  if(!raw||raw==='—'||raw==='N/A')return undefined;
  const match=raw.match(/^([0-9]+(?:\\.[0-9]+)?)([KMB])?$/);
  if(!match)return undefined;
  const amount=Number(match[1]);
  const multiplier=match[2]==='K'?1_000:match[2]==='M'?1_000_000:match[2]==='B'?1_000_000_000:1;
  const result=amount*multiplier;
  return Number.isFinite(result)?result:undefined;
}
function parseSection(section:string):Fruit[]{
  const out:Fruit[]=[];
  const seen=new Set<string>();
  for(const e of BLOX_VALUES){
    if(e.type==='Gamepass'||e.type==='Skin'||!e.beli||e.beli==='—')continue;
    if(!inSection(section,e))continue;
    const nameKey=norm(e.name);
    if(seen.has(nameKey))continue;
    const price=parseMoney(e.beli);
    out.push({
      name:e.name,
      price,
      image:'https://fruityblox.com/images/fruits/'+slug(e.name)+'.webp',
      rarity:e.rarity
    });
    seen.add(nameKey);
  }
  return out;
}

function extractDealerSections(source:string):{normal:string;mirage:string}{
  const labels:[keyof DealerSections,string][]=[
    ['normal','Normal Stock'],
    ['mirage','Mirage Stock']
  ];
  const hits:{kind:keyof DealerSections;index:number;length:number}[]=[];
  for(const [kind,label] of labels){
    const re=new RegExp(label,'ig');
    let m:RegExpExecArray|null;
    while((m=re.exec(source))!==null)hits.push({kind,index:m.index,length:label.length});
  }
  hits.sort((a,b)=>a.index-b.index);

  let best:{normal:string;mirage:string;score:number}|undefined;
  for(let i=0;i<hits.length-1;i++){
    const a=hits[i],b=hits[i+1];
    if(a.kind===b.kind)continue;
    const aSection=source.slice(a.index+a.length,b.index);
    const aScore=parseSectionScore(aSection);
    if(aScore===0)continue;

    const nextAfterB=hits[i+2];
    const bSection=source.slice(b.index+b.length,nextAfterB?.index??source.length);
    const bScore=parseSectionScore(bSection);
    if(bScore===0)continue;

    const candidate={
      normal:a.kind==='normal'?aSection:bSection,
      mirage:a.kind==='mirage'?aSection:bSection,
      score:aScore+bScore
    };
    if(!best||candidate.score>best.score)best=candidate;
  }
  if(!best)return {normal:'',mirage:''};
  return {normal:best.normal,mirage:best.mirage};
}
type DealerSections={normal:string;mirage:string};
function parseSectionScore(section:string):number{
  return BLOX_VALUES.reduce((n,e)=>n+(e.type!=='Gamepass'&&e.type!=='Skin'&&e.beli!=='—'&&inSection(section,e)?1:0),0);
}

function findNextRotation(raw:string,label:string):number|undefined{
  const t=text(raw);
  const i=t.search(new RegExp(label,'i'));
  if(i<0)return undefined;
  const window=t.slice(i,i+1800);
  const m=window.match(/(?:reset|refresh|next)[^0-9]{0,80}(\d{10,13})/i);
  if(!m)return undefined;
  const n=Number(m[1]);
  return n>2e9?n*1000:n;
}
function formatBeli(value?:number):string{
  if(value===undefined||!Number.isFinite(value))return 'Price unavailable';
  if(value>=1_000_000_000)return `${Number((value/1_000_000_000).toFixed(2))}B Beli`;
  if(value>=1_000_000)return `${Number((value/1_000_000).toFixed(2))}M Beli`;
  if(value>=1_000)return `${Number((value/1_000).toFixed(2))}K Beli`;
  return `${value.toLocaleString('en-US')} Beli`;
}
async function getStock():Promise<Stock>{
  const r=await fetch(URL,{headers:{'user-agent':'Sparxie stock notifier','accept':'text/html,application/xhtml+xml'}});
  if(!r.ok)throw new Error('Stock HTTP '+r.status);
  const raw=await r.text();
  const sections=extractDealerSections(t);
  if(!sections.normal&&!sections.mirage)throw new Error('Stock sections not found');
  const normal=parseSection(sections.normal);
  const mirage=parseSection(sections.mirage);
  if(!normal.length&&!mirage.length)throw new Error('No stock detected');
  return {
    normal,
    mirage,
    checked:Date.now(),
    normalReset:findNextRotation(raw,'Normal Stock'),
    mirageReset:findNextRotation(raw,'Mirage Stock')
  };
}
const key=(a:Fruit[])=>a.map(x=>x.name).sort().join('|');
const mythical=(name:string)=>{const e=findBloxValue(name);return !!e&&e.rarity==='Mythical'&&e.type!=='Skin';};

function embed(items:Fruit[],dealer:string,next?:number){
  const desc=items.map(x=>`**${fruitLabel(x.name)}** — **${formatBeli(x.price)}**`).join('\n')||'No stock detected.';
  const rare=items.filter(x=>mythical(x.name)).map(x=>`• **${fruitLabel(x.name)}**`).join('\n')||'None';
  const hero=items.find(x=>mythical(x.name))??items[0];
  const e=new EmbedBuilder()
    .setColor(dealer==='Normal'?0x5865F2:0x9B59B6)
    .setTitle((dealer==='Normal'?'🛒':'🌌')+' '+dealer+' Stock • IST')
    .setDescription(desc)
    .addFields(
      {name:'✨ Mythical',value:rare,inline:false},
      {name:'🕐 Checked (IST)',value:ist(Date.now()),inline:true},
      {name:'🔄 Next refresh (IST)',value:next?ist(next):'Not available',inline:true},
    )
    .setFooter({text:'Sparxie • Blox Fruits Stock • Asia/Kolkata'});
  if(hero?.image)e.setImage(hero.image);
  return e;
}

async function update(client:Client,guildId:string,force=false){
  const cfg=loadGuild(guildId).config.bloxStock;if(!cfg?.enabled||!cfg.channelId)return;
  let s:Stock;try{s=await getStock();}catch(e){console.warn('[BloxStock]',e);return;}
  const k=JSON.stringify({n:key(s.normal),m:key(s.mirage)});
  if(!force&&cfg.lastSnapshot===k){updateGuild(guildId,d=>{if(d.config.bloxStock)d.config.bloxStock.lastCheckedAt=s.checked;});return;}
  const g=client.guilds.cache.get(guildId);if(!g)return;
  const ch=await g.channels.fetch(cfg.channelId).catch(()=>null);if(!ch?.isTextBased()||ch.type!==ChannelType.GuildText)return;
  const oldN=(cfg.lastNormalStock||'').split('|').filter(Boolean),oldM=(cfg.lastMirageStock||'').split('|').filter(Boolean);
  const newNormal=s.normal.filter(x=>!oldN.includes(norm(x.name))),newMirage=s.mirage.filter(x=>!oldM.includes(norm(x.name)));
  const hasChange=newNormal.length>0||newMirage.length>0;
  if(force||!cfg.lastSnapshot||hasChange){
    const sendDealer=async(dealer:'Normal'|'Mirage',items:Fruit[],newItems:Fruit[],next?:number)=>{
      const entered=newItems.filter(x=>mythical(x.name));
      const mentions:string[]=[];const roles=new Set<string>();
      if(cfg.mythicalPingRoleId&&entered.length){
        mentions.push(role(cfg.mythicalPingRoleId)+' '+token(
          cfg.mythicalPingMessage||'Mythical in stock: {fruit}',
          [...new Set(entered.map(x=>x.name))].join(', '),
          dealer
        ));
        roles.add(cfg.mythicalPingRoleId);
      }
      for(const x of entered){
        const p=cfg.fruitPings?.[norm(x.name)];
        if(p){
          mentions.push(role(p.roleId)+' '+token(p.message||'{fruit} is in stock!',x.name,dealer));
          roles.add(p.roleId);
        }
      }
      await (ch as TextChannel).send({
        content:mentions.join('\n')||undefined,
        allowedMentions:{roles:[...roles]},
        embeds:[embed(items,dealer,next)]
      });
    };

    // Each dealer gets its own message. Their stock, pings and embed can never mix.
    await sendDealer('Normal',s.normal,newNormal,s.normalReset);
    await sendDealer('Mirage',s.mirage,newMirage,s.mirageReset);
  }
  updateGuild(guildId,d=>{if(!d.config.bloxStock)return;d.config.bloxStock.lastSnapshot=k;d.config.bloxStock.lastNormalStock=s.normal.map(x=>norm(x.name)).join('|');d.config.bloxStock.lastMirageStock=s.mirage.map(x=>norm(x.name)).join('|');d.config.bloxStock.lastCheckedAt=s.checked;});
}
export async function postBloxStockNow(client:Client,guildId:string){ await update(client,guildId,true); }

export function startBloxStockTracker(client:Client){
  if((client as any)[REG])return;(client as any)[REG]=true;
  for(const g of client.guilds.cache.values())void update(client,g.id);
  setInterval(()=>{for(const g of client.guilds.cache.values())void update(client,g.id);},POLL);
}

const mg=PermissionFlagsBits.ManageGuild;
export const stock:Command={
 data:new SlashCommandBuilder().setName('stock').setDescription('Blox Fruits stock notifications').setDefaultMemberPermissions(mg)
 .addSubcommand(s=>s.setName('set-channel').setDescription('Set stock channel').addChannelOption(o=>o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
 .addSubcommand(s=>s.setName('enable').setDescription('Enable stock notifications')).addSubcommand(s=>s.setName('disable').setDescription('Disable stock notifications'))
 .addSubcommand(s=>s.setName('now').setDescription('Post current stock')).addSubcommand(s=>s.setName('status').setDescription('Show stock settings')),
 async execute(i:ChatInputCommandInteraction){
  if(!i.guildId){await i.reply({content:'Server only.',ephemeral:true});return;}const sub=i.options.getSubcommand();
  if(sub==='set-channel'){const c=i.options.getChannel('channel',true);updateGuild(i.guildId,d=>{d.config.bloxStock={...(d.config.bloxStock||{enabled:false}),channelId:c.id};});await i.reply('Stock channel set to <#'+c.id+'>. Run /stock enable.');return;}
  if(sub==='enable'){updateGuild(i.guildId,d=>{d.config.bloxStock={...(d.config.bloxStock||{enabled:false}),enabled:true};});await i.reply('Stock tracker enabled.');void update(i.client,i.guildId,true);return;}
  if(sub==='disable'){updateGuild(i.guildId,d=>{if(d.config.bloxStock)d.config.bloxStock.enabled=false;});await i.reply('Stock tracker disabled.');return;}
  if(sub==='now'){await i.deferReply();await update(i.client,i.guildId,true);await i.editReply('Current stock posted.');return;}
  const c=loadGuild(i.guildId).config.bloxStock;await i.reply({content:c?.enabled&&c.channelId?'Stock ON • <#'+c.channelId+'> • IST • 60s':'Stock OFF • set channel then enable',ephemeral:true});
 }
};

export const mythicalping:Command={
 data:new SlashCommandBuilder().setName('mythicalping').setDescription('Ping a role when Mythical fruits enter stock').setDefaultMemberPermissions(mg)
 .addSubcommand(s=>s.setName('set').setDescription('Set Mythical role and message').addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Use {fruit}, {dealer}, {time}').setRequired(true)))
 .addSubcommand(s=>s.setName('disable').setDescription('Disable Mythical ping')).addSubcommand(s=>s.setName('test').setDescription('Test Mythical ping')),
 async execute(i:ChatInputCommandInteraction){
  if(!i.guildId){await i.reply({content:'Server only.',ephemeral:true});return;}const sub=i.options.getSubcommand();
  if(sub==='set'){const r=i.options.getRole('role',true),m=i.options.getString('message',true);updateGuild(i.guildId,d=>{d.config.bloxStock={...(d.config.bloxStock||{enabled:false}),mythicalPingRoleId:r.id,mythicalPingMessage:m};});await i.reply('Mythical ping saved for <@&'+r.id+'>.');return;}
  if(sub==='disable'){updateGuild(i.guildId,d=>{if(d.config.bloxStock){d.config.bloxStock.mythicalPingRoleId=undefined;d.config.bloxStock.mythicalPingMessage=undefined;}});await i.reply('Mythical ping disabled.');return;}
  const c=loadGuild(i.guildId).config.bloxStock;if(!c?.mythicalPingRoleId){await i.reply({content:'Set Mythical ping first.',ephemeral:true});return;}
  await i.reply({content:role(c.mythicalPingRoleId)+' '+token(c.mythicalPingMessage||'Mythical in stock!'),allowedMentions:{roles:[c.mythicalPingRoleId]}});
 }
};

export const fruitping:Command={
 data:new SlashCommandBuilder().setName('fruitping').setDescription('Ping a role for a specific fruit').setDefaultMemberPermissions(mg)
 .addSubcommand(s=>s.setName('add').setDescription('Add fruit ping').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Use {fruit}, {dealer}, {time}').setRequired(true)))
 .addSubcommand(s=>s.setName('remove').setDescription('Remove fruit ping').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true)))
 .addSubcommand(s=>s.setName('list').setDescription('List fruit pings')).addSubcommand(s=>s.setName('test').setDescription('Test fruit ping').addStringOption(o=>o.setName('fruit').setDescription('Fruit name').setRequired(true))),
 async execute(i:ChatInputCommandInteraction){
  if(!i.guildId){await i.reply({content:'Server only.',ephemeral:true});return;}const sub=i.options.getSubcommand();
  if(sub==='add'){const e=findBloxValue(i.options.getString('fruit',true));if(!e||e.type==='Gamepass'){await i.reply({content:'Unknown fruit.',ephemeral:true});return;}const r=i.options.getRole('role',true),m=i.options.getString('message',true);updateGuild(i.guildId,d=>{d.config.bloxStock=d.config.bloxStock||{enabled:false};d.config.bloxStock.fruitPings=d.config.bloxStock.fruitPings||{};d.config.bloxStock.fruitPings[norm(e.name)]={roleId:r.id,message:m,fruitName:e.name};});await i.reply('Fruit ping saved for '+e.name+'.');return;}
  if(sub==='remove'){const e=findBloxValue(i.options.getString('fruit',true));if(!e){await i.reply({content:'Unknown fruit.',ephemeral:true});return;}updateGuild(i.guildId,d=>{if(d.config.bloxStock?.fruitPings)delete d.config.bloxStock.fruitPings[norm(e.name)];});await i.reply('Fruit ping removed for '+e.name+'.');return;}
  if(sub==='list'){const p=loadGuild(i.guildId).config.bloxStock?.fruitPings||{};const lines=Object.entries(p).map(([n,x])=>'• '+(x.fruitName||n)+' → <@&'+x.roleId+'> • '+x.message);await i.reply({content:lines.join('\n')||'No fruit pings configured.',ephemeral:true});return;}
  const e=findBloxValue(i.options.getString('fruit',true)),p=e?loadGuild(i.guildId).config.bloxStock?.fruitPings?.[norm(e.name)]:undefined;if(!e||!p){await i.reply({content:'No ping configured.',ephemeral:true});return;}await i.reply({content:role(p.roleId)+' '+token(p.message,e.name,'Test'),allowedMentions:{roles:[p.roleId]}});
 }
};
