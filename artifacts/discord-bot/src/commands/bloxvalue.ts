import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export type BloxValueEntry = {
  name:string; aliases:string[]; rarity:string; type:string; regular:string; perm:string; beli:string;
  demand:string; trend:string; bestFor:string; obtain?:string;
};
const V=(name:string,aliases:string[],rarity:string,type:string,regular:string,perm:string,beli:string,demand:string,trend:string,bestFor:string,obtain?:string):BloxValueEntry=>({name,aliases,rarity,type,regular,perm,beli,demand,trend,bestFor,obtain});

export const BLOX_VALUES:BloxValueEntry[]=[
V('West Dragon',['west dragon','dragon west'],'Mythical','Beast','2.85B','3.91B','15M','6/10','Stable','PVP, Trading'),
V('East Dragon',['east dragon','dragon east'],'Mythical','Beast','2.46B','3.36B','15M','6/10','Stable','PVP, Trading'),
V('Kitsune',['kitsune'],'Mythical','Beast','600M','640M','8M','10/10','Stable','PVP, Trading'),
V('Control',['control'],'Mythical','Natural','150M','160M','9M','8/10','Stable','PVP'),
V('Tiger',['tiger','leopard'],'Mythical','Beast','120M','140M','5M','8/10','Stable','PVP'),
V('Yeti',['yeti'],'Mythical','Beast','110M','120M','5M','7/10','Stable','PVP, Grinding'),
V('Gas',['gas'],'Mythical','Logia','60M','60M','3.2M','8/10','Stable','PVP'),
V('Dough',['dough'],'Mythical','Logia','30M','2.4B','2.8M','9/10','Stable','PVP, Grinding'),
V('Venom',['venom'],'Mythical','Natural','20M','2.45B','3M','7/10','Stable','PVP, Grinding'),
V('T-Rex',['t-rex','trex'],'Mythical','Beast','20M','2.35B','2.7M','8/10','Stable','PVP, Grinding'),
V('Gravity',['gravity'],'Mythical','Natural','10M','2.3B','2.5M','5/10','Stable','PVP'),
V('Mammoth',['mammoth'],'Mythical','Beast','10M','2.35B','2.7M','5/10','Stable','PVP, Grinding'),
V('Spirit',['spirit'],'Mythical','Natural','10M','2.55B','3.4M','7/10','Stable','PVP'),
V('Shadow',['shadow'],'Mythical','Natural','6.5M','2.42B','2.9M','5/10','Stable','PVP'),
V('Lightning',['lightning','rumble'],'Legendary','Logia','40M','2.1B','2.1M','6/10','Stable','PVP'),
V('Pain',['pain'],'Legendary','Natural','10M','2.2B','2.3M','5/10','Stable','PVP'),
V('Portal',['portal'],'Legendary','Natural','10M','2B','1.9M','10/10','Overpaid','Mobility, PVP'),
V('Buddha',['buddha','human buddha'],'Legendary','Beast','10M','1.65B','1.2M','10/10','Overpaid','PVP, Grinding'),
V('Blizzard',['blizzard'],'Legendary','Logia','5M','2.25B','2.4M','5/10','Stable','PVP, Grinding'),
V('Phoenix',['phoenix'],'Legendary','Beast','2.75M','2B','1.8M','3/10','Stable','PVP'),
V('Creation',['creation'],'Legendary','Natural','2.5M','1.75B','1.4M','2/10','Stable','N/A'),
V('Sound',['sound'],'Legendary','Natural','2.5M','1.9B','1.7M','4/10','Stable','PVP'),
V('Spider',['spider'],'Legendary','Natural','1.5M','1.8B','1.5M','2/10','Stable','PVP'),
V('Love',['love'],'Legendary','Natural','1.5M','1.7B','1.3M','3/10','Stable','PVP'),
V('Quake',['quake'],'Legendary','Natural','1M','1.5B','1M','2/10','Stable','PVP'),
V('Magma',['magma'],'Rare','Logia','1.15M','1.3B','960K','5/10','Overpaid','Grinding, PVP'),
V('Light',['light'],'Rare','Logia','800K','1.1B','650K','2/10','Stable','Mobility, PVP, Grinding'),
V('Ghost',['ghost'],'Rare','Natural','800K','1.27B','940K','1/10','Underpaid','PVP'),
V('Rubber',['rubber'],'Rare','Natural','700K','1.2B','750K','1/10','Stable','PVP'),
V('Diamond',['diamond'],'Uncommon','Natural','1M','1B','600K','2/10','Stable','Grinding'),
V('Eagle',['eagle','falcon'],'Uncommon','Beast','800K','975M','550K','2/10','Stable','Grinding'),
V('Ice',['ice'],'Uncommon','Logia','550K','750M','350K','2/10','Stable','PVP, Grinding'),
V('Sand',['sand'],'Uncommon','Logia','420K','850M','420K','1/10','Stable','Grinding'),
V('Dark',['dark'],'Uncommon','Logia','400K','950M','500K','1/10','Stable','PVP'),
V('Flame',['flame'],'Uncommon','Logia','250K','550M','250K','1/10','Stable','Grinding'),
V('Spike',['spike'],'Common','Natural','180K','380M','180K','1/10','Stable','Grinding'),
V('Smoke',['smoke'],'Common','Logia','100K','250M','100K','1/10','Stable','Grinding'),
V('Bomb',['bomb'],'Common','Natural','80K','220M','80K','1/10','Stable','Grinding'),
V('Spring',['spring'],'Common','Natural','60K','180M','60K','1/10','Stable','Grinding'),
V('Blade',['blade','chop'],'Common','Natural','50K','100M','30K','1/10','Stable','PvP (Sword Immunity)'),
V('Spin',['spin'],'Common','Natural','7.5K','75M','7.5K','1/10','Stable','N/A'),
V('Rocket',['rocket'],'Common','Natural','5K','50M','5K','1/10','Stable','N/A'),

V('Galaxy Empyrean Kitsune',['galaxy empyrean kitsune','galaxy kitsune','galaxy'],'Mythical','Skin','9.63B','—','—','10/10','Stable','Trading','Winter 2025 Fruit Box; tradeable now'),
V('Rabid Dog Blade',['rabid dog blade','rabid dog'],'Limited','Skin','7.98B','—','—','10/10','Fluctuating','Trading','Limited release/event; tradeable now'),
V('Crimson Kitsune',['crimson kitsune','crimson'],'Mythical','Skin','7.41B','—','—','9/10','Stable','Trading','Shop for 2,000 Robux or Fox Spirit Bundle during Christmas Event; tradeable now'),
V('Doghouse (Frame Break)',['doghouse','doghouse frame break','frame break'],'Limited','Skin','6.63B','—','—','10/10','Fluctuating','Trading','Limited release/event; tradeable now'),
V('Ember West Dragon',['ember west dragon','ember dragon','ember'],'Limited','Skin','6.12B','—','—','9/10','Stable','Trading','Winter 2025 Fruit Box; tradeable now'),
V('Purple Lightning',['purple lightning','purple'],'Limited','Skin','4.59B','—','—','7/10','Stable','Trading','Summer Gacha for 500 Summer Tokens; tradeable now'),
V('Super Spirit Pain',['super spirit pain','super spirit'],'Limited','Skin','3B','—','—','8/10','Stable','Trading','Party Gacha for 500 Summer Tokens; tradeable now'),
V('Red Lightning',['red lightning','red lighting','red'],'Limited','Skin','2.61B','—','—','8/10','Stable','Trading','Party Gacha for 500 Summer Tokens during 50B Celebration Event; tradeable now'),
V('Divine Portal',['divine portal','divine'],'Limited','Skin','1.56B','—','—','8/10','Stable','Trading','Limited event/gacha release; tradeable now'),
V('Yellow Lightning',['yellow lightning','yellow lighting','yellow light','yellow'],'Limited','Skin','1.53B','—','—','9/10','Stable','Trading','Summer Gacha for 500 Summer Tokens; tradeable now'),
V('Werewolf',['werewolf'],'Limited','Skin','1.2B','—','—','10/10','Overpaid','Trading','Limited event/release; tradeable now'),
V('Fiend Yeti',['fiend yeti','fiend'],'Limited','Skin','1.08B','—','—','10/10','Overpaid','Trading','Limited event/release; tradeable now'),
V('Dog Blade',['dog blade'],'Limited','Skin','1.02B','—','—','10/10','Overpaid','Trading','Limited release/event; tradeable now'),
V('Celestial Pain',['celestial pain','celestial'],'Limited','Skin','900M','—','—','7/10','Stable','Trading','Celestial Gacha for 250 Celestial Tokens or Party Gacha for 500 Summer Tokens; tradeable now'),
V('Frustration Pain',['frustration pain','frustration'],'Limited','Skin','780M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens; tradeable now'),
V('Sadness Pain',['sadness pain','sadness'],'Limited','Skin','750M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens; tradeable now'),
V('Azura Bomb',['azura bomb','azura'],'Limited','Skin','600M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens; tradeable now'),
V('Nuclear Bomb',['nuclear bomb','nuclear'],'Limited','Skin','570M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens / Summer Box; tradeable now'),
V('Thermite Bomb',['thermite bomb','thermite'],'Limited','Skin','540M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens / Summer Box; tradeable now'),
V('Green Lightning',['green lightning','green lighting','green'],'Limited','Skin','390M','—','—','8/10','Stable','Trading','Summer Gacha for 500 Summer Tokens or Winter 2025 Fruit Box; tradeable now'),
V('Rose Quartz Diamond',['rose quartz diamond','rose quartz'],'Limited','Skin','300M','—','—','7/10','Stable','Trading','Limited event/release; tradeable now'),
V('Eagle Matrix',['eagle matrix','matrix'],'Limited','Skin','270M','—','—','5/10','Stable','Trading','Limited event/release; tradeable now'),
V('Emerald Diamond',['emerald diamond','emerald'],'Limited','Skin','210M','—','—','5/10','Stable','Trading','Limited event/release; tradeable now'),
V('Topaz Diamond',['topaz diamond','topaz'],'Limited','Skin','180M','—','—','4/10','Stable','Trading','Limited event/release; tradeable now'),
V('Ruby Diamond',['ruby diamond','ruby'],'Limited','Skin','150M','—','—','5/10','Stable','Trading','Limited event/release; tradeable now'),
V('Torment Pain',['torment pain','torment'],'Limited','Skin','150M','—','—','6/10','Stable','Trading','Summer Gacha for 500 Summer Tokens or Winter 2025 Fruit Box; tradeable now'),
V('Eagle Requiem',['eagle requiem','requiem'],'Limited','Skin','150M','—','—','5/10','Stable','Trading','Limited event/release; tradeable now'),
V('Eagle Glacier',['eagle glacier','glacier'],'Limited','Skin','20M','—','—','4/10','Stable','Trading','Limited event/release; tradeable now'),
V('Celebration Bomb',['celebration bomb','celebration'],'Limited','Skin','10M','—','—','4/10','Stable','Trading','Party Gacha for 500 Summer Tokens during 50B Celebration Event; tradeable now'),
V('Permanent Dragon Token',['permanent dragon token','dragon token permanent'],'Limited','Skin','N/A','—','—','6/10','Overpaid','Trading','Limited release; tradeable now'),
V('Parrot',['parrot'],'Limited','Skin','N/A','—','—','1/10','Stable','Trading','Limited release; tradeable now'),
V('Dragon Token',['dragon token','dragon token skin'],'Limited','Skin','N/A','—','—','4/10','Overpaid','Trading','Limited release; tradeable now'),
V('Eclipse',['eclipse'],'Limited','Skin','N/A','—','—','10/10','Overpaid','Trading','Limited Shop release; tradeable now'),
V('Orange Portal',['orange portal','orange'],'Limited','Skin','N/A','—','—','N/A','Stable','Trading','Limited release; tradeable now'),
V('Pink Portal',['pink portal','pink'],'Limited','Skin','N/A','—','—','N/A','Stable','Trading','Limited release; tradeable now'),
];

// Keep matching intentionally simple and robust. These are English Blox Fruits names,
// so ASCII normalization avoids regex Unicode-escape issues and also handles punctuation.
function normalizeBloxQuery(query:string):string{return query.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}

export function findBloxValue(query:string):BloxValueEntry|undefined{
  const normalized=normalizeBloxQuery(query);
  if(!normalized)return undefined;
  const entries=BLOX_VALUES.map(entry=>({entry,name:normalizeBloxQuery(entry.name),aliases:entry.aliases.map(normalizeBloxQuery)}));
  const exact=entries.find(({name,aliases})=>name===normalized||aliases.includes(normalized));
  if(exact)return exact.entry;
  const candidates=entries.filter(({name,aliases})=>name.startsWith(normalized)||aliases.some(alias=>alias.startsWith(normalized))||name.includes(normalized)||aliases.some(alias=>alias.includes(normalized)));
  if(!candidates.length)return undefined;
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

export function buildBloxValueEmbed(entry:BloxValueEntry):EmbedBuilder{
  const embed=new EmbedBuilder().setColor(0xF4C430).setTitle(`🍈 ${entry.name}`).setDescription(`🟡 **${entry.rarity}**  ·  🐾 **${entry.type}**\n\n━━━━━━━━━━━━━━━━━━`);
  if(entry.type==='Skin'){
    embed.addFields(
      {name:'💎 Value',value:`\`${entry.regular}\``},
      {name:'📊 Demand',value:`🟢 **${entry.demand}**`},
      {name:'⚖️ Trend',value:`📈 **${entry.trend}**`},
      {name:'🏆 Best Used For',value:entry.bestFor},
      {name:'🎯 How to Obtain',value:entry.obtain??'Limited release; tradeable now'},
    );
  }else{
    embed.addFields(
      {name:'💱 Regular Value',value:`\`${entry.regular}\``},
      {name:':PERM: Perm Value',value:`\`${entry.perm}\``},
      {name:'💲 Beli Price',value:`\`${entry.beli}\``},
      {name:'📊 Demand',value:`🟢 **${entry.demand}**`},
      {name:'⚖️ Trend',value:`📈 **${entry.trend}**`},
      {name:'🏆 Best Used For',value:entry.bestFor},
    );
  }
  return embed.setFooter({text:'Blox Fruits Values | Sparxie'});
}

export const bloxValueCommand:Command={
  data:new SlashCommandBuilder().setName('bloxvalue').setDescription('Look up a Blox Fruits value').addStringOption(o=>o.setName('item').setDescription('Fruit or skin name').setRequired(true)),
  async execute(interaction){
    const query=interaction.options.getString('item',true);
    const entry=findBloxValue(query);
    if(!entry){await interaction.reply({content:`❌ No Blox Fruits value found for **${query}**. Try a fruit/skin name or part of its name.`,ephemeral:true});return;}
    await interaction.reply({embeds:[buildBloxValueEmbed(entry)]});
  },
};

export const setBloxValueChannelCommand:Command={
  data:new SlashCommandBuilder().setName('setbloxvaluechannel').setDescription('Set the channel for automatic Blox Fruits value lookups').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addChannelOption(o=>o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  async execute(interaction){
    const channel=interaction.options.getChannel('channel',true);
    updateGuild(interaction.guildId!,d=>{d.config.bloxValueChannelId=channel.id;});
    await interaction.reply(`✅ Blox Fruits value channel set to <#${channel.id}>. Ping me with a fruit or skin name to look it up.`);
  },
};
