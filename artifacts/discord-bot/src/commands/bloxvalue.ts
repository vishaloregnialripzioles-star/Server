import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export type BloxValueEntry = {
  name: string;
  aliases: string[];
  rarity: string;
  type: string;
  regular: string;
  perm: string;
  beli: string;
  demand: string;
  trend: string;
  bestFor: string;
};

const V = (name:string, aliases:string[], rarity:string, type:string, regular:string, perm:string, beli:string, demand:string, trend:string, bestFor:string):BloxValueEntry => ({name,aliases,rarity,type,regular,perm,beli,demand,trend,bestFor});

export const BLOX_VALUES: BloxValueEntry[] = [
  V('Buddha',['buddha','human buddha'],'Legendary','Beast','10M','1.71B','1.2M','10/10','Overpaid','PVP, Grinding'),
  V('West Dragon',['west dragon','dragon west'],'Mythical','Beast','1.275B','2.805B','15M','10/10','Stable','PVP, Trading'),
  V('East Dragon',['east dragon','dragon east'],'Mythical','Beast','1.02B','2.805B','15M','10/10','Stable','PVP, Trading'),
  V('Kitsune',['kitsune'],'Mythical','Beast','255M','2.04B','8M','10/10','Stable','PVP, Trading'),
  V('Leopard',['leopard'],'Mythical','Beast','55M','1.48B','5M','10/10','Stable','PVP, Trading'),
  V('Dough',['dough'],'Mythical','Natural','30M','1.275B','2.8M','10/10','Stable','PVP, Grinding'),
  V('T-Rex',['t-rex','trex'],'Mythical','Beast','20M','1.275B','2.7M','8/10','Stable','PVP, Grinding'),
  V('Mammoth',['mammoth'],'Mythical','Beast','10M','1.275B','2.5M','7/10','Stable','PVP, Grinding'),
  V('Spirit',['spirit'],'Mythical','Natural','10M','1.435B','3.4M','8/10','Stable','PVP'),
  V('Venom',['venom'],'Mythical','Natural','10M','1.275B','3M','8/10','Stable','PVP'),
  V('Control',['control'],'Mythical','Natural','10M','1.38B','3.2M','10/10','Stable','PVP'),
  V('Shadow',['shadow'],'Mythical','Natural','6.5M','1.275B','2.9M','6/10','Stable','PVP'),
  V('Gravity',['gravity'],'Mythical','Natural','20M','1.275B','2.5M','4/10','Stable','Trading'),
  V('Rumble',['rumble','lightning'],'Legendary','Elemental','75M','870M','2.1M','9/10','Stable','PVP'),
  V('Portal',['portal'],'Legendary','Natural','15M','840M','1.9M','10/10','Stable','PVP, Grinding'),
  V('Blizzard',['blizzard'],'Legendary','Elemental','5M','935M','2.4M','5/10','Stable','PVP'),
  V('Sound',['sound'],'Legendary','Natural','2.5M','790M','1.7M','4/10','Stable','PVP'),
  V('Phoenix',['phoenix'],'Legendary','Beast','2.75M','830M','1.8M','4/10','Stable','PVP'),
  V('Pain',['pain'],'Legendary','Natural','20M','915M','2.3M','1/10','Stable','PVP'),
  V('Spider',['spider'],'Legendary','Natural','1.5M','750M','1.5M','3/10','Stable','PVP'),
  V('Love',['love'],'Legendary','Natural','1.5M','705M','1.3M','3/10','Stable','PVP'),
  V('Quake',['quake'],'Legendary','Natural','1M','625M','1M','3/10','Stable','PVP'),
  V('Magma',['magma'],'Rare','Elemental','1.15M','540M','850K','7/10','Stable','Grinding, PVP'),
  V('Light',['light'],'Rare','Elemental','800K','430M','650K','7/10','Stable','Grinding'),
  V('Ghost',['ghost'],'Rare','Natural','800K','530M','940K','1/10','Stable','Grinding'),
  V('Rubber',['rubber'],'Rare','Natural','700K','450M','750K','4/10','Stable','PVP'),
  V('Barrier',['barrier'],'Rare','Natural','3.5M','730M','800K','1/10','Stable','Trading'),
  V('Diamond',['diamond'],'Uncommon','Natural','1M','415M','600K','3/10','Stable','Grinding'),
  V('Ice',['ice'],'Uncommon','Elemental','550K','310M','350K','8/10','Stable','PVP, Grinding'),
  V('Sand',['sand'],'Uncommon','Elemental','420K','340M','420K','3/10','Stable','Grinding'),
  V('Dark',['dark'],'Uncommon','Elemental','400K','380M','500K','6/10','Stable','PVP'),
  V('Falcon',['falcon'],'Uncommon','Beast','800K','400M','300K','1/10','Stable','Grinding'),
  V('Flame',['flame'],'Uncommon','Elemental','250K','220M','250K','4/10','Stable','Grinding'),
  V('Spike',['spike'],'Common','Natural','180K','95M','180K','1/10','Stable','Grinding'),
  V('Smoke',['smoke'],'Common','Elemental','100K','63M','100K','1/10','Stable','Grinding'),
  V('Bomb',['bomb'],'Common','Natural','80K','55M','80K','1/10','Stable','Grinding'),
  V('Spring',['spring'],'Common','Natural','60K','45M','60K','1/10','Stable','Grinding'),
  V('Spin',['spin'],'Common','Natural','7.5K','15M','7.5K','1/10','Stable','Grinding'),
  V('Rocket',['rocket'],'Common','Natural','5K','10M','5K','1/10','Stable','Grinding'),
  V('Chromatic Skin',['chromatic skin','chromatic'],'Premium','Skin','2.025B','—','—','10/10','Stable','Trading'),
  V('Dragon Token',['dragon token','dragon token skin'],'Premium','Skin','450M','—','460M','6/10','Stable','Trading'),
];

export function findBloxValue(query:string):BloxValueEntry|undefined {
  const normalized=query.trim().toLocaleLowerCase().replace(/\s+/g,' ');
  if(!normalized)return undefined;
  return BLOX_VALUES.find(v => v.name.toLocaleLowerCase()===normalized || v.aliases.some(a=>a===normalized));
}

export function buildBloxValueEmbed(entry:BloxValueEntry):EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xF4C430)
    .setTitle(`🍈 ${entry.name}`)
    .setDescription(`🟡 **${entry.rarity}**  ·  🐾 **${entry.type}**\n\n━━━━━━━━━━━━━━━━━━`)
    .addFields(
      {name:'💱 Regular Value',value:`\`${entry.regular}\``,inline:false},
      {name:':PERM: Perm Value',value:`\`${entry.perm}\``,inline:false},
      {name:'💲 Beli Price',value:`\`${entry.beli}\``,inline:false},
      {name:'📊 Demand',value:`🟢 **${entry.demand}**`,inline:false},
      {name:'⚖️ Trend',value:`📈 **${entry.trend}**`,inline:false},
      {name:'🏆 Best Used For',value:`${entry.bestFor}`,inline:false},
    )
    .setFooter({text:'Blox Fruits Values | Sparxie'})
    .setTimestamp();
}

export const bloxvalue: Command = {
  data: new SlashCommandBuilder()
    .setName('bloxvalue')
    .setDescription('Show the Blox Fruits value for a fruit or skin')
    .addStringOption(o=>o.setName('item').setDescription('Fruit or skin name').setRequired(true)),
  async execute(interaction) {
    const item=interaction.options.getString('item',true);
    const entry=findBloxValue(item);
    if(!entry){await interaction.reply({content:`❌ I couldn't find a Blox Fruits value for **${item}**.`,ephemeral:true});return;}
    await interaction.reply({embeds:[buildBloxValueEmbed(entry)]});
  },
};

export const setbloxvaluechannel: Command = {
  data: new SlashCommandBuilder()
    .setName('setbloxvaluechannel')
    .setDescription('Enable automatic Blox Fruits value lookups in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Channel where @Sparxie <fruit> will work').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  async execute(interaction) {
    if(!interaction.guild)return;
    const channel=interaction.options.getChannel('channel',true);
    updateGuild(interaction.guild.id,d=>{d.config.bloxValueChannelId=channel.id;});
    await interaction.reply({content:`✅ Blox Fruits value lookup is now enabled in <#${channel.id}>.\n\nUse **@${interaction.client.user.username} Yeti** (or any supported fruit/skin name) in that channel.`});
  },
};
