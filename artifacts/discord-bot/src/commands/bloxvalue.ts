import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export type BloxValueEntry = { name:string; aliases:string[]; rarity:string; type:string; regular:string; perm:string; beli:string; demand:string; trend:string; bestFor:string; };
const V=(name:string,aliases:string[],rarity:string,type:string,regular:string,perm:string,beli:string,demand:string,trend:string,bestFor:string):BloxValueEntry=>({name,aliases,rarity,type,regular,perm,beli,demand,trend,bestFor});

export const BLOX_VALUES:BloxValueEntry[]=[
V('West Dragon',['west dragon','dragon west'],'Mythical','Beast','2.85B','—','15M','6/10','Stable','PVP, Trading'),V('East Dragon',['east dragon','dragon east'],'Mythical','Beast','2.46B','—','15M','6/10','Stable','PVP, Trading'),V('Kitsune',['kitsune'],'Mythical','Beast','600M','—','8M','10/10','Stable','PVP, Trading'),V('Control',['control'],'Mythical','Natural','150M','—','9M','8/10','Stable','PVP'),V('Tiger',['tiger'],'Mythical','Beast','120M','—','5M','8/10','Stable','PVP'),V('Yeti',['yeti'],'Mythical','Beast','110M','—','5M','7/10','Stable','PVP, Grinding'),V('Gas',['gas'],'Mythical','Logia','60M','—','3.2M','8/10','Stable','PVP'),V('Dough',['dough'],'Mythical','Logia','30M','—','2.8M','9/10','Overpaid','PVP, Grinding'),V('Venom',['venom'],'Mythical','Natural','20M','—','3M','7/10','Stable','PVP, Grinding'),V('T-Rex',['t-rex','trex'],'Mythical','Beast','20M','—','2.7M','8/10','Stable','PVP, Grinding'),V('Gravity',['gravity'],'Mythical','Natural','10M','—','2.5M','5/10','Stable','PVP'),V('Mammoth',['mammoth'],'Mythical','Beast','10M','—','2.7M','5/10','Stable','PVP, Grinding'),V('Spirit',['spirit'],'Mythical','Natural','10M','—','3.4M','7/10','Stable','PVP'),V('Shadow',['shadow'],'Mythical','Natural','6.5M','—','2.9M','5/10','Stable','PVP'),
V('Lightning',['lightning','rumble'],'Legendary','Logia','40M','—','2.1M','6/10','Stable','PVP'),V('Pain',['pain'],'Legendary','Natural','10M','—','2.3M','5/10','Stable','PVP'),V('Portal',['portal'],'Legendary','Natural','10M','2.49B','1.9M','10/10','Overpaid','Mobility, PVP'),V('Buddha',['buddha','human buddha'],'Legendary','Beast','10M','1.71B','1.2M','10/10','Overpaid','PVP, Grinding'),V('Blizzard',['blizzard'],'Legendary','Logia','5M','3.09B','2.4M','5/10','Stable','PVP, Grinding'),V('Phoenix',['phoenix'],'Legendary','Beast','2.75M','—','1.8M','3/10','Stable','PVP'),V('Creation',['creation'],'Legendary','Natural','2.5M','1.89B','1.4M','2/10','Stable','N/A'),V('Sound',['sound'],'Legendary','Natural','2.5M','2.25B','1.7M','4/10','Stable','PVP'),V('Spider',['spider'],'Legendary','Natural','1.5M','—','1.5M','2/10','Stable','PVP'),V('Love',['love'],'Legendary','Natural','1.5M','1.77B','1.3M','3/10','Stable','PVP'),V('Quake',['quake'],'Legendary','Natural','1M','—','1M','2/10','Stable','PVP'),
V('Magma',['magma'],'Rare','Logia','1.15M','—','960K','5/10','Overpaid','Grinding, PVP'),V('Light',['light'],'Rare','Logia','800K','930M','650K','2/10','Stable','Mobility, PVP, Grinding'),V('Ghost',['ghost'],'Rare','Natural','800K','1.08B','940K','1/10','Underpaid','PVP'),V('Rubber',['rubber'],'Rare','Natural','700K','—','750K','1/10','Stable','PVP'),
V('Diamond',['diamond'],'Uncommon','Natural','1M','—','600K','2/10','Stable','Grinding'),V('Eagle',['eagle','falcon'],'Uncommon','Beast','800K','—','550K','2/10','Stable','Grinding'),V('Ice',['ice'],'Uncommon','Logia','550K','—','350K','2/10','Stable','PVP, Grinding'),V('Sand',['sand'],'Uncommon','Logia','420K','—','420K','1/10','Stable','Grinding'),V('Dark',['dark'],'Uncommon','Logia','400K','—','500K','1/10','Stable','PVP'),V('Flame',['flame'],'Uncommon','Logia','250K','—','250K','1/10','Stable','Grinding'),
V('Spike',['spike'],'Common','Natural','180K','—','180K','1/10','Stable','Grinding'),V('Smoke',['smoke'],'Common','Logia','100K','—','100K','1/10','Stable','Grinding'),V('Bomb',['bomb'],'Common','Natural','80K','—','80K','1/10','Stable','Grinding'),V('Spring',['spring'],'Common','Natural','60K','60M','60K','1/10','Stable','Grinding'),V('Blade',['blade','chop'],'Common','Natural','50K','20M','30K','1/10','Stable','PvP (Sword Immunity)'),V('Spin',['spin'],'Common','Natural','7.5K','15M','7.5K','1/10','Stable','N/A'),V('Rocket',['rocket'],'Common','Natural','5K','10M','5K','1/10','Stable','N/A'),
V('Chromatic Skin',['chromatic skin','chromatic'],'Premium','Skin','2.025B','—','—','10/10','Stable','Trading'),V('Dragon Token',['dragon token','dragon token skin'],'Limited','Skin','N/A','—','N/A','4/10','Overpaid','Trading'),
V('Yellow Lightning',['yellow lightning','yellow lighting','yellow light','yellow'],'Limited','Skin','1.53B','—','—','9/10','Stable','Trading'),
];

function normalizeBloxQuery(query:string):string{return query.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}

export function findBloxValue(query:string):BloxValueEntry|undefined{
  const normalized=normalizeBloxQuery(query);
  if(!normalized)return undefined;
  const entries=BLOX_VALUES.map(entry=>({entry,name:normalizeBloxQuery(entry.name),aliases:entry.aliases.map(normalizeBloxQuery)}));

  // Exact names/aliases always win. This keeps "light" = Light and
  // "lightning" = Lightning even though one is contained in the other.
  const exact=entries.find(({name,aliases})=>name===normalized||aliases.includes(normalized));
  if(exact)return exact.entry;

  // Natural chat-style lookup: "bud" -> Buddha, "yeti" -> Yeti,
  // "yellow" / "yellow ligh" -> Yellow Lightning, etc.
  const candidates=entries.filter(({name,aliases})=>
    name.startsWith(normalized)||
    aliases.some(alias=>alias.startsWith(normalized))||
    name.includes(normalized)||
    aliases.some(alias=>alias.includes(normalized))
  );
  if(!candidates.length)return undefined;

  // Prefer the closest/most specific match, then keep the database order as a
  // deterministic tie-breaker so a partial query always returns one item.
  candidates.sort((a,b)=>{
    const score=(item:{name:string;aliases:string[]}):number=>{
      if(item.name.startsWith(normalized))return 0;
      if(item.aliases.some(alias=>alias.startsWith(normalized)))return 1;
      if(item.name.includes(normalized))return 2;
      return 3;
    };
    return score(a)-score(b)||a.name.length-b.name.length;
  });
  return candidates[0].entry;
}

export function buildBloxValueEmbed(entry:BloxValueEntry):EmbedBuilder{return new EmbedBuilder().setColor(0xF4C430).setTitle(`🍈 ${entry.name}`).setDescription(`🟡 **${entry.rarity}**  ·  🐾 **${entry.type}**\n\n━━━━━━━━━━━━━━━━━━`).addFields({name:'💱 Regular Value',value:`\`${entry.regular}\`'},{name:':PERM: Perm Value',value:`\`${entry.perm}\`'},{name:'💲 Beli Price',value:`\`${entry.beli}\`'},{name:'📊 Demand',value:`🟢 **${entry.demand}**`},{name:'⚖️ Trend',value:`📈 **${entry.trend}**`},{name:'🏆 Best Used For',value:entry.bestFor}).setFooter({text:'Blox Fruits Values | Sparxie'}).setTimestamp();}

export const bloxvalue:Command={data:new SlashCommandBuilder().setName('bloxvalue').setDescription('Show the Blox Fruits value for a fruit or skin').addStringOption(o=>o.setName('item').setDescription('Fruit or skin name').setRequired(true)),async execute(interaction){const item=interaction.options.getString('item',true);const entry=findBloxValue(item);if(!entry){await interaction.reply({content:`❌ I couldn't find a Blox Fruits value for **${item}**.`,ephemeral:true});return;}await interaction.reply({embeds:[buildBloxValueEmbed(entry)]});}};
export const setbloxvaluechannel:Command={data:new SlashCommandBuilder().setName('setbloxvaluechannel').setDescription('Enable automatic Blox Fruits value lookups in a channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addChannelOption(o=>o.setName('channel').setDescription('Channel where @Sparxie <fruit> will work').setRequired(true).addChannelTypes(ChannelType.GuildText)),async execute(interaction){if(!interaction.guild)return;const channel=interaction.options.getChannel('channel',true);updateGuild(interaction.guild.id,d=>{d.config.bloxValueChannelId=channel.id;});await interaction.reply({content:`✅ Blox Fruits value lookup is now enabled in <#${channel.id}>.\n\nUse **@${interaction.client.user.username} Yeti** (or any supported fruit/skin name) in that channel.`});}};
