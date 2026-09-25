import { ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const HELP_SELECT_CUSTOM_ID='sparxie_help_category';

// These are APPLICATION EMOJI IDs supplied by the bot owner.
// Do not guess their names: Discord is the source of truth for the emoji name.
const CUSTOM_EMOJI_IDS:Record<string,string>={
  Setup:'1537371555754020924',
  Moderation:'1537383211611594913',
  Security:'1550141081780224010',
  Channels:'1537383650008633344',
  Restrictions:'1537383867965636638',
  Utility:'1537384138758168676',
  Leveling:'1537384379234394172',
  Tickets:'1537384597158101092',
  Economy:'1550135030150594662',
  Games:'1537384591638274081',
  Fun:'1537384590098956318',
  Giveaways:'1537384585325846578',
  Music:'1537384708491575347',
  Social:'1550135055408697414',
  'Blox Fruits':'1550135075297824828',
  AI:'1550135960556281968',
  Other:'1550135112484786347',
  Premium:'1550136370746359908',
  Profiles:'1550141116647743571'
};

// Fallback names are only used if Discord cannot resolve an ID. They are NOT
// used to build the primary custom emoji markup anymore.
const FALLBACK_EMOJIS:Record<string,string>={
  Setup:'⚙️',Moderation:'🔨',Security:'🛡️',Channels:'📢',Restrictions:'🚫',Utility:'🛠️',
  Leveling:'📈',Roles:'🎭',Tickets:'🎫',Economy:'⚡',Games:'🎮',Fun:'🎉',Giveaways:'🎁',
  Music:'🎵',Social:'🌐','Blox Fruits':'🍎',AI:'🤖',Other:'✨',Premium:'🟨'
};

const CATEGORY_ORDER=['Setup','Moderation','Security','Channels','Restrictions','Utility','Leveling','Roles','Tickets','Economy','Games','Fun','Giveaways','Music','Social','Blox Fruits','AI','Other'];
const PREMIUM_SET=new Set((process.env.SPARXIE_PREMIUM_COMMANDS??'').split(/[\s,]+/i).map(x=>x.trim().toLowerCase()).filter(Boolean));
const CATEGORY_MAP:Record<string,string>={setup:'Setup',autosetup:'Setup',setprefix:'Setup',levelconfig:'Leveling',embed:'Setup',welcome:'Setup',greet:'Setup',ban:'Moderation',kick:'Moderation',mute:'Moderation',unmute:'Moderation',timeout:'Moderation',warn:'Moderation',warnings:'Moderation',clearwarns:'Moderation',warnsleaderboard:'Moderation',nick:'Moderation',temprole:'Moderation',automod:'Security',antinuke:'Security',recovery:'Security',clearchannels:'Security',purge:'Channels',purgebots:'Channels',lock:'Channels',unlock:'Channels',slowmode:'Channels',invitelog:'Channels',chatban:'Restrictions',unchatban:'Restrictions',jail:'Restrictions',unjail:'Restrictions',afk:'Utility',remindme:'Utility',poll:'Utility',snipe:'Utility',editsnipe:'Utility',userinfo:'Utility',serverinfo:'Utility',autoresponder:'Utility',help:'Utility',ping:'Utility',uptime:'Utility',av:'Utility',banner:'Utility',rank:'Leveling',leaderboard:'Leveling',createrole:'Roles',roleassign:'Roles',joinrole:'Roles',reactionrole:'Roles',roleconnection:'Roles',inviterole:'Roles',extraowner:'Roles',uploademoji:'Roles',setbloxemojis:'Roles',ticket:'Tickets',closeticket:'Tickets',ticketpanel:'Tickets',coinleaderboard:'Economy',shop:'Economy',removeshop:'Economy',trade:'Economy',game:'Games',games:'Games',gamepolicy:'Games',roast:'Fun',gay:'Fun',pro:'Fun',noob:'Fun',ship:'Fun',cool:'Fun',aura:'Fun',funny:'Fun',sad:'Fun',angry:'Fun',legend:'Fun',giveaway:'Giveaways',giveawaydaily:'Giveaways',music:'Music',socialnotification:'Social',bloxemoji:'Blox Fruits',bloxscanner:'Blox Fruits',bloxvalue:'Blox Fruits',ai:'AI'};

// Discord application emojis have their own canonical names. The old code
// guessed names such as "setup", which can produce literal :setup: text when
// the actual application emoji has a different name. Resolve the IDs once
// from Discord and then use the returned emoji object's toString()/name.
type ResolvedEmoji={id:string;name:string;animated:boolean;markup:string};
const resolvedApplicationEmojis=new Map<string,ResolvedEmoji>();

export async function primeHelpApplicationEmojis(client:any):Promise<void>{
  try{
    const manager=client?.application?.emojis;
    if(!manager?.fetch)return;
    const emojis=await manager.fetch();
    for(const [category,id] of Object.entries(CUSTOM_EMOJI_IDS)){
      const emoji=emojis.get(id);
      if(emoji?.name){
        resolvedApplicationEmojis.set(category,{id:emoji.id,name:emoji.name,animated:Boolean(emoji.animated),markup:emoji.toString()});
      }else{
        console.warn(`[Help] Application emoji not found for ${category}: ${id}`);
      }
    }
  }catch(error){
    console.warn('[Help] Could not fetch application emojis; using Unicode fallbacks.',error);
  }
}

let commandRegistry:Command[]=[];
export function setHelpCommandRegistry(commands:Command[]):void{commandRegistry=commands;}

function customEmojiMarkup(category:string):string{
  return resolvedApplicationEmojis.get(category)?.markup ?? (FALLBACK_EMOJIS[category]??FALLBACK_EMOJIS.Other);
}

function emojiFor(category:string):string{return customEmojiMarkup(category);}
function menuEmojiFor(category:string):{id:string;name:string;animated?:boolean}|string{
  const resolved=resolvedApplicationEmojis.get(category);
  return resolved?{id:resolved.id,name:resolved.name,animated:resolved.animated}: (FALLBACK_EMOJIS[category]??FALLBACK_EMOJIS.Other);
}
function categoryFor(name:string):string{return CATEGORY_MAP[name.toLowerCase()]??'Other';}
function resolveCommands(value:any):Command[]{if(Array.isArray(value)&&value.length&&value[0]?.data?.toJSON)return value as Command[];return commandRegistry;}
function optionEntries(data:any,prefix:string){const out:{name:string;description:string}[]=[];for(const option of data.options??[]){if(option.type===1)out.push({name:`${prefix}${data.name} ${option.name}`,description:option.description??'Command option'});else if(option.type===2)for(const sub of option.options??[])if(sub.type===1)out.push({name:`${prefix}${data.name} ${option.name} ${sub.name}`,description:sub.description??'Command option'});}return out;}

export type HelpEntry={name:string;description:string;premium:boolean};
export type HelpCategory={name:string;emoji:string;commands:HelpEntry[]};

export function getHelpCategories(commands:any=commandRegistry,prefix='.'):HelpCategory[]{
  const list=resolveCommands(commands);
  const buckets=new Map<string,HelpEntry[]>();
  for(const c of CATEGORY_ORDER)buckets.set(c,[]);
  for(const command of list){
    const data:any=command.data.toJSON();
    const name=String(data.name);
    const category=categoryFor(name);
    const premium=PREMIUM_SET.has(name.toLowerCase());
    buckets.get(category)!.push({name:`${prefix}${name}`,description:String(data.description??'No description available.'),premium});
    for(const sub of optionEntries(data,prefix))buckets.get(category)!.push({name:sub.name,description:sub.description,premium});
  }
  buckets.get('Utility')!.push({name:`${prefix}help <category>`,description:'Open a category directly',premium:false});
  buckets.get('Games')!.push({name:`${prefix}buy role <name>`,description:'Buy a configured shop role with ⚡ sparks',premium:false},{name:`${prefix}buy colour <name>`,description:'Buy a configured colour with ⚡ sparks',premium:false});
  return CATEGORY_ORDER.map(name=>({name,emoji:emojiFor(name),commands:buckets.get(name)!.sort((a,b)=>a.name.localeCompare(b.name))})).filter(c=>c.commands.length>0);
}

export const HELP_CATEGORIES:HelpCategory[]=[];
export const HELP_COMMAND_COUNT=0;

export function findHelpCategory(category?:string|null,commands:any=commandRegistry,prefix='.'):HelpCategory|undefined{
  if(!category||category.toLowerCase()==='all')return undefined;
  return getHelpCategories(commands,prefix).find(c=>c.name.toLowerCase()===category.toLowerCase());
}
function formatCommand(entry:HelpEntry):string{return`• ${entry.name}${entry.premium?' '+emojiFor('Premium'):''} — ${entry.description}`;}

export function buildHelpEmbed(category?:string|null,prefix='.',commands:any=commandRegistry):EmbedBuilder{
  const categories=getHelpCategories(commands,prefix);
  const selected=category?categories.find(c=>c.name.toLowerCase()===category.toLowerCase()):undefined;
  const count=categories.reduce((n,c)=>n+c.commands.length,0);
  const premiumEmoji=emojiFor('Premium');
  const embed=new EmbedBuilder().setColor(0x12d9d3).setAuthor({name:'Sparxie Help Center'}).setFooter({text:'Sparxie • Complete command directory'}).setTimestamp();
  if(!selected)embed.setTitle('✨ Welcome to Sparxie').setDescription(`Your complete command directory, organized by category.\n\n**Prefix:** \`${prefix}\`\n**Command entries:** \`${count}\`\n**${premiumEmoji}:** Premium feature when premium metadata is configured.\n\n${categories.map(c=>`${c.emoji} **${c.name}** — ${c.commands.length}`).join('\n')}\n\nUse \`${prefix}help <category>\` or the selector below.`);
  else{
    embed.setTitle(`${selected.emoji} ${selected.name}`).setDescription(`${selected.commands.length} command entries.\n${premiumEmoji} = Premium.`);
    for(let i=0;i<selected.commands.length;i+=10)embed.addFields({name:i?'More commands':'Commands',value:selected.commands.slice(i,i+10).map(formatCommand).join('\n').slice(0,1024)});
  }
  return embed;
}

export function buildHelpMenu(category?:string|null,commands:any=commandRegistry,prefix='.'):ActionRowBuilder<StringSelectMenuBuilder>{
  const categories=getHelpCategories(commands,prefix);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(HELP_SELECT_CUSTOM_ID).setPlaceholder('Select a category…').addOptions(
    {label:'All commands',description:'Browse the complete command directory',value:'all',default:!category||category==='all',emoji:'📚'},
    ...categories.slice(0,24).map(c=>({label:c.name,description:`${c.commands.length} entries`,value:c.name.toLowerCase(),default:category?.toLowerCase()===c.name.toLowerCase(),emoji:menuEmojiFor(c.name)}))
  ));
}

export const help:Command={
  data:new SlashCommandBuilder().setName('help').setDescription('Open the complete Sparxie command directory').addStringOption(o=>o.setName('category').setDescription('Show one category').addChoices(...CATEGORY_ORDER.map(c=>({name:`${emojiFor(c)} ${c}`.slice(0,100),value:c.toLowerCase()})))),
  async execute(interaction){
    await interaction.deferReply();
    await primeHelpApplicationEmojis(interaction.client);
    const prefix=(await import('../prefixHandler.js')).getGuildPrefix(interaction.guild?.id??'');
    const commands=Array.from(interaction.client.commands?.values?.()??commandRegistry);
    const filter=interaction.options.getString('category');
    if(filter&&!findHelpCategory(filter,commands,prefix)){await interaction.editReply({content:'❌ Unknown help category.',embeds:[],components:[]});return;}
    await interaction.editReply({embeds:[buildHelpEmbed(filter,prefix,commands)],components:[buildHelpMenu(filter,commands,prefix)]});
  }
};
