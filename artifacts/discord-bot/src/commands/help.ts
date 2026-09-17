import { ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder, type Client } from 'discord.js';
import type { Command } from '../types.js';
import { allCommands } from './index.js';

export const HELP_SELECT_CUSTOM_ID = 'sparxie_help_category';

const EMOJIS: Record<string,string> = {
  Setup:'⚙️', Moderation:'🔨', Security:'🛡️', Channels:'📢', Restrictions:'🚫', Utility:'🛠️', Profiles:'🖼️', Leveling:'📈', Roles:'🎭', Tickets:'🎫', Economy:'⚡', Games:'🎮', Fun:'🎉', Giveaways:'🎁', Music:'🎵', Social:'🌐', Blox Fruits:'🍎', AI:'🤖', Other:'✨'
};
const CATEGORY_ORDER = ['Setup','Moderation','Security','Channels','Restrictions','Utility','Profiles','Leveling','Roles','Tickets','Economy','Games','Fun','Giveaways','Music','Social','Blox Fruits','AI','Other'];
const PREMIUM = new Set((process.env.SPARXIE_PREMIUM_COMMANDS ?? '').split(/[\s,]+/i).map(x=>x.trim().toLowerCase()).filter(Boolean));
const PREFIX_ONLY = new Set(['buy']);
const CATEGORY_MAP: Record<string,string> = {
  setup:'Setup',autosetup:'Setup',setprefix:'Setup',levelconfig:'Leveling',embed:'Setup',welcome:'Setup',greet:'Setup',gamepolicy:'Games',
  ban:'Moderation',kick:'Moderation',mute:'Moderation',unmute:'Moderation',timeout:'Moderation',warn:'Moderation',warnings:'Moderation',clearwarns:'Moderation',warnsleaderboard:'Moderation',nick:'Moderation',temprole:'Moderation',
  automod:'Security',antinuke:'Security',recovery:'Security',clearchannels:'Security',
  purge:'Channels',purgebots:'Channels',lock:'Channels',unlock:'Channels',slowmode:'Channels',invitelog:'Channels',
  chatban:'Restrictions',unchatban:'Restrictions',jail:'Restrictions',unjail:'Restrictions',
  afk:'Utility',remindme:'Utility',poll:'Utility',snipe:'Utility',editsnipe:'Utility',userinfo:'Utility',serverinfo:'Utility',autoresponder:'Utility',help:'Utility',ai:'AI',ping:'Utility',uptime:'Utility',
  av:'Profiles',banner:'Profiles',
  rank:'Leveling',leaderboard:'Leveling',
  createrole:'Roles',roleassign:'Roles',joinrole:'Roles',reactionrole:'Roles',roleconnection:'Roles',inviterole:'Roles',extraowner:'Roles',uploademoji:'Roles',setbloxemojis:'Roles',
  ticket:'Tickets',closeticket:'Tickets',ticketpanel:'Tickets',
  sparks:'Economy',coinleaderboard:'Economy',shop:'Economy',removeshop:'Economy',trade:'Economy',
  game:'Games',games:'Games',
  roast:'Fun',gay:'Fun',pro:'Fun',noob:'Fun',ship:'Fun',random:'Fun',
  giveaway:'Giveaways',giveawaydaily:'Giveaways',
  music:'Music',
  socialnotification:'Social',
  bloxemoji:'Blox Fruits',bloxscanner:'Blox Fruits',bloxvalue:'Blox Fruits',
};

function categoryFor(name:string):string { return CATEGORY_MAP[name.toLowerCase()] ?? 'Other'; }
function emojiFor(category:string):string { return EMOJIS[category] ?? '✨'; }
function rootCommandJson(command:Command):any { return command.data.toJSON(); }
function displayName(name:string, prefix:string):string { return name.startsWith('/') || name.startsWith('.') ? `${prefix}${name.slice(1)}` : name; }
function subcommandLines(options:any[], prefix:string, commandName:string):string[] {
  const out:string[]=[];
  for(const option of options ?? []) {
    if(option.type===1) {
      const nested=(option.options ?? []).filter((x:any)=>x.type>=3 && x.type<=11).map((x:any)=>x.name).join(' ');
      out.push(`\`${prefix}${commandName} ${option.name}${nested ? ` <${nested}>` : ''}\` — ${option.description ?? 'Command option'}`);
    } else if(option.type===2) {
      for(const sub of option.options ?? []) if(sub.type===1) out.push(`\`${prefix}${commandName} ${option.name} ${sub.name}\` — ${sub.description ?? 'Command option'}`);
    }
  }
  return out;
}

export type HelpEntry = { name:string; description:string; premium:boolean };
export type HelpCategory = { name:string; emoji:string; commands:HelpEntry[] };

export function getHelpCategories(commands:Command[] = allCommands):HelpCategory[] {
  const buckets = new Map<string,HelpEntry[]>();
  for(const category of CATEGORY_ORDER) buckets.set(category,[]);
  for(const command of commands) {
    const data:any = rootCommandJson(command); const name=String(data.name); const category=categoryFor(name); const prefixName=displayName(`/${name}`,'/');
    const subLines=subcommandLines(data.options,'/',name);
    const desc=String(data.description ?? 'No description available.');
    const entry={name: prefixName, description: desc, premium: PREMIUM.has(name.toLowerCase())};
    buckets.get(category)!.push(entry);
    for(const line of subLines) buckets.get(category)!.push({name:line.slice(1,line.indexOf('`',1)),description:'',premium:PREMIUM.has(name.toLowerCase())});
  }
  // Prefix-native extras that are intentionally not separate slash commands.
  buckets.get('Utility')!.push({name:'.help <category>',description:'Open a category directly with the current prefix',premium:false});
  buckets.get('Games')!.push({name:'.buy role <name>',description:'Buy a configured shop role with ⚡ sparks',premium:false},{name:'.buy colour <name>',description:'Buy a configured colour with ⚡ sparks',premium:false});
  return CATEGORY_ORDER.map(name=>({name,emoji:emojiFor(name),commands:buckets.get(name)!.sort((a,b)=>a.name.localeCompare(b.name))})).filter(c=>c.commands.length>0);
}

export const HELP_CATEGORIES = getHelpCategories();
export const HELP_COMMAND_COUNT = HELP_CATEGORIES.reduce((n,c)=>n+c.commands.length,0);
export function findHelpCategory(category?:string|null, commands:Command[] = allCommands):HelpCategory|undefined { if(!category || category.toLowerCase()==='all') return undefined; return getHelpCategories(commands).find(c=>c.name.toLowerCase()===category.toLowerCase()); }

function formatCategoryList(categories:HelpCategory[]):string { return categories.map(c=>`${c.emoji} **${c.name}** — ${c.commands.length} entries`).join('\n'); }
function formatCommand(entry:HelpEntry):string { return `• ${entry.name}${entry.premium ? ' 🟨' : ''}${entry.description ? ` — ${entry.description}` : ''}`; }

export function buildHelpEmbed(category?:string|null,prefix='.',commands:Command[]=allCommands):EmbedBuilder {
  const categories=getHelpCategories(commands); const selected=category ? categories.find(c=>c.name.toLowerCase()===category.toLowerCase()) : undefined; const count=categories.reduce((n,c)=>n+c.commands.length,0);
  const embed=new EmbedBuilder().setColor(0x12d9d3).setAuthor({name:'Sparxie Help Center'}).setFooter({text:'Sparxie • Complete command directory'}).setTimestamp();
  if(!selected) {
    embed.setTitle('✨ Welcome to Sparxie').setDescription(`Your complete command directory — organized so you can find features quickly.\n\n**Prefix:** \`${prefix}\`\n**Command entries:** \`${count}\`\n**🟨 Premium:** Premium commands/features are marked with the yellow indicator when premium metadata is configured.\n\n**Choose a category from the menu below:**\n\n${formatCategoryList(categories)}\n\nUse \`${prefix}help <category>\` or the selector to explore a section.`);
  } else {
    embed.setTitle(`${selected.emoji} ${selected.name}`).setDescription(`${selected.commands.length} command entries in **${selected.name}**.\n\n🟨 = Premium feature.`);
    for(let i=0;i<selected.commands.length;i+=10) embed.addFields({name:i===0 ? 'Commands' : 'More commands',value:selected.commands.slice(i,i+10).map(formatCommand).join('\n').slice(0,1024)});
  }
  return embed;
}

export function buildHelpMenu(category?:string|null,commands:Command[]=allCommands):ActionRowBuilder<StringSelectMenuBuilder> {
  const categories=getHelpCategories(commands);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(HELP_SELECT_CUSTOM_ID).setPlaceholder('Select a category…').addOptions(
    {label:'All commands',description:'Browse the complete Sparxie directory',value:'all',default:!category || category==='all',emoji:'📚'},
    ...categories.slice(0,24).map(c=>({label:c.name,description:`${c.commands.length} command entries`,value:c.name.toLowerCase(),default:category?.toLowerCase()===c.name.toLowerCase(),emoji:c.emoji}))
  ));
}

export const help:Command = {
  data:new SlashCommandBuilder().setName('help').setDescription('Open the complete Sparxie command directory').addStringOption(o=>o.setName('category').setDescription('Show one category').addChoices(...CATEGORY_ORDER.slice(0,25).map(c=>({name:`${emojiFor(c)} ${c}`.slice(0,100),value:c.toLowerCase()})))),
  async execute(interaction) {
    const prefix=(await import('../prefixHandler.js')).getGuildPrefix(interaction.guild?.id ?? '');
    const commands=Array.from(interaction.client.commands?.values?.() ?? allCommands.values());
    const filter=interaction.options.getString('category');
    if(filter && !findHelpCategory(filter,commands)){await interaction.reply({content:'❌ Unknown help category.',ephemeral:true});return;}
    await interaction.reply({embeds:[buildHelpEmbed(filter,prefix,commands)],components:[buildHelpMenu(filter,commands)]});
  },
};

export async function primeHelpApplicationEmojis(_client:Client):Promise<void>{ /* Reserved for dashboard/application emoji integration. */ }
