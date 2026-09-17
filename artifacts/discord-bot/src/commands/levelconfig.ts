import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

const defaultLeveling = () => ({ xpMin:15, xpMax:25, cooldownSeconds:60, multiplier:1, bonusXp:0, levelUp:{}, ignoreChannels:[] as string[], ignoreRoles:[] as string[], roleRewards:{} as Record<string,string> });

export const levelconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('Configure the server leveling system (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('set').setDescription('Set XP gain, cooldown, multiplier and bonus XP')
      .addIntegerOption(o=>o.setName('xp_min').setDescription('Minimum random XP per message').setMinValue(0).setMaxValue(1000))
      .addIntegerOption(o=>o.setName('xp_max').setDescription('Maximum random XP per message').setMinValue(0).setMaxValue(1000))
      .addIntegerOption(o=>o.setName('cooldown').setDescription('XP cooldown in seconds').setMinValue(0).setMaxValue(86400))
      .addNumberOption(o=>o.setName('multiplier').setDescription('XP multiplier').setMinValue(0).setMaxValue(100))
      .addIntegerOption(o=>o.setName('bonus_xp').setDescription('Flat bonus XP added after the multiplier').setMinValue(0).setMaxValue(10000)))
    .addSubcommand(sub => sub.setName('message').setDescription('Customize the level-up announcement')
      .addStringOption(o=>o.setName('title').setDescription('Title; {user}, {level}, {xp} supported').setMaxLength(256))
      .addStringOption(o=>o.setName('description').setDescription('Description; {user}, {level}, {xp} supported').setMaxLength(4000))
      .addStringOption(o=>o.setName('image').setDescription('Image/GIF URL'))
      .addStringOption(o=>o.setName('color').setDescription('Hex color, e.g. #9B59B6'))
      .addChannelOption(o=>o.setName('channel').setDescription('Announcement channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)))
    .addSubcommand(sub=>sub.setName('reward').setDescription('Give a role automatically at a level')
      .addIntegerOption(o=>o.setName('level').setDescription('Level to reward').setRequired(true).setMinValue(1).setMaxValue(10000))
      .addRoleOption(o=>o.setName('role').setDescription('Role to grant').setRequired(true)))
    .addSubcommand(sub=>sub.setName('removereward').setDescription('Remove a level role reward')
      .addIntegerOption(o=>o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(10000)))
    .addSubcommand(sub=>sub.setName('ignorechannel').setDescription('Toggle XP tracking in a channel')
      .addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)))
    .addSubcommand(sub=>sub.setName('ignorerole').setDescription('Toggle XP tracking for members with a role')
      .addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(sub=>sub.setName('view').setDescription('View current leveling configuration'))
    .addSubcommand(sub=>sub.setName('reset').setDescription('Reset leveling configuration to defaults'))
    .addSubcommand(sub=>sub.setName('preview').setDescription('Preview the current level-up announcement')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });
    const sub=interaction.options.getSubcommand();
    if(sub==='reset'){updateGuild(interaction.guild.id,d=>{d.config.leveling=defaultLeveling();delete d.config.levelUpMessage;});await interaction.editReply('✅ Leveling configuration reset.');return;}
    if(sub==='set'){
      const min=interaction.options.getInteger('xp_min'),max=interaction.options.getInteger('xp_max'),cool=interaction.options.getInteger('cooldown'),mult=interaction.options.getNumber('multiplier'),bonus=interaction.options.getInteger('bonus_xp');
      if(min===null&&max===null&&cool===null&&mult===null&&bonus===null){await interaction.editReply('❌ Provide at least one leveling setting.');return;}
      const current=loadGuild(interaction.guild.id).config.leveling??defaultLeveling();
      const nextMin=min??current.xpMin,nextMax=max??current.xpMax;
      if(nextMin>nextMax){await interaction.editReply('❌ `xp_min` cannot be greater than `xp_max`.');return;}
      updateGuild(interaction.guild.id,d=>{const c=d.config.leveling??defaultLeveling();c.xpMin=nextMin;c.xpMax=nextMax;if(cool!==null)c.cooldownSeconds=cool;if(mult!==null)c.multiplier=mult;if(bonus!==null)c.bonusXp=bonus;d.config.leveling=c;});
      await interaction.editReply(`✅ Leveling updated: **${nextMin}-${nextMax} XP**, **${cool??current.cooldownSeconds}s** cooldown, **${(mult??current.multiplier).toFixed(2)}x** multiplier, **+${bonus??current.bonusXp}** bonus XP.`);return;
    }
    if(sub==='message'){
      const title=interaction.options.getString('title'),description=interaction.options.getString('description'),image=interaction.options.getString('image'),colorRaw=interaction.options.getString('color'),channel=interaction.options.getChannel('channel');
      if(!title&&!description&&!image&&!colorRaw&&!channel){await interaction.editReply('❌ Provide at least one announcement setting.');return;}
      let color:number|undefined; if(colorRaw){const parsed=parseColor(colorRaw);if(parsed===undefined){await interaction.editReply('❌ Invalid color. Use hex like `#9B59B6`.');return;}color=parsed;}
      if(image){try{const u=new URL(image);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{await interaction.editReply('❌ `image` must be a valid HTTP/HTTPS URL.');return;}}
      updateGuild(interaction.guild.id,d=>{const c=d.config.leveling??defaultLeveling();c.levelUp=c.levelUp??{};if(title!==null)c.levelUp.title=title??undefined;if(description!==null)c.levelUp.description=description??undefined;if(image!==null)c.levelUp.imageUrl=image??undefined;if(colorRaw!==null)c.levelUp.color=color;if(channel!==null)c.levelUp.channelId=channel?.id;d.config.leveling=c;d.config.levelUpMessage={title:c.levelUp.title,description:c.levelUp.description,imageUrl:c.levelUp.imageUrl};});
      await interaction.editReply('✅ Level-up announcement customization saved.');return;
    }
    if(sub==='reward'||sub==='removereward'){
      const level=interaction.options.getInteger('level',true);
      if(sub==='reward'){const role=interaction.options.getRole('role',true);if(role.managed){await interaction.editReply('❌ Managed/integration roles cannot be granted.');return;}updateGuild(interaction.guild.id,d=>{const c=d.config.leveling??defaultLeveling();c.roleRewards={...(c.roleRewards??{}),[String(level)]:role.id};d.config.leveling=c;d.config.levelRoles={...(d.config.levelRoles??{}),[String(level)]:role.id};});await interaction.editReply(`✅ **Level ${level}** now rewards ${role}.`);}
      else{updateGuild(interaction.guild.id,d=>{const c=d.config.leveling??defaultLeveling();delete c.roleRewards[String(level)];delete c.levelUp; c.levelUp=c.levelUp??{};d.config.leveling=c;if(d.config.levelRoles)delete d.config.levelRoles[String(level)];});await interaction.editReply(`✅ Removed the role reward for level **${level}**.`);}return;
    }
    if(sub==='ignorechannel'||sub==='ignorerole'){
      const id=sub==='ignorechannel'?interaction.options.getChannel('channel',true).id:interaction.options.getRole('role',true).id;
      updateGuild(interaction.guild.id,d=>{const c=d.config.leveling??defaultLeveling();const key=sub==='ignorechannel'?'ignoreChannels':'ignoreRoles';const list=c[key]??[];const idx=list.indexOf(id);if(idx>=0)list.splice(idx,1);else list.push(id);c[key]=list;d.config.leveling=c;});
      const c=loadGuild(interaction.guild.id).config.leveling??defaultLeveling();const list=sub==='ignorechannel'?c.ignoreChannels:c.ignoreRoles;await interaction.editReply(`${list.includes(id)?'🚫 Added':'✅ Removed'} ${sub==='ignorechannel'?'that channel':'that role'} ${list.includes(id)?'from':'from'} XP tracking.`);return;
    }
    const c=loadGuild(interaction.guild.id).config.leveling??defaultLeveling();
    if(sub==='view'){
      const embed=new EmbedBuilder().setColor(c.levelUp?.color??0x9B59B6).setTitle('📈 Leveling Configuration').addFields(
        {name:'XP Gain',value:`${c.xpMin}-${c.xpMax} per eligible message`,inline:true},{name:'Cooldown',value:`${c.cooldownSeconds}s`,inline:true},{name:'Multiplier',value:`${c.multiplier}x`,inline:true},{name:'Bonus XP',value:`+${c.bonusXp}`,inline:true},{name:'Ignored Channels',value:String(c.ignoreChannels.length),inline:true},{name:'Ignored Roles',value:String(c.ignoreRoles.length),inline:true},{name:'Role Rewards',value:String(Object.keys(c.roleRewards??{}).length),inline:true}).setTimestamp();await interaction.editReply({embeds:[embed]});return;
    }
    const embed=buildLevelUpEmbed(interaction.user.toString(),7,1200,interaction.user.displayAvatarURL(),c.levelUp?.title,c.levelUp?.description,c.levelUp?.imageUrl,c.levelUp?.color);await interaction.editReply({content:'**Level-up preview**',embeds:[embed]});
  },
};

function parseColor(value:string):number|undefined{const clean=value.trim().replace(/^#/,'');if(!/^[0-9a-f]{6}$/i.test(clean))return undefined;return Number.parseInt(clean,16);}

export function buildLevelUpEmbed(userMention:string,level:number,xp:number,avatarUrl:string,customTitle?:string,customDescription?:string,customImageUrl?:string,customColor?:number):EmbedBuilder{
  const replacements:Record<string,string>={'{user}':userMention,'{level}':String(level),'{xp}':xp.toLocaleString()};
  const apply=(s:string)=>Object.entries(replacements).reduce((out,[key,val])=>out.replaceAll(key,val),s);
  const embed=new EmbedBuilder().setColor(customColor??0x9B59B6).setTitle(customTitle?apply(customTitle):'🎉 Level Up!').setDescription(customDescription?apply(customDescription):`Congratulations ${userMention}!\nYou reached **level ${level}**.`).setThumbnail(avatarUrl).setTimestamp();
  if(customImageUrl)embed.setImage(customImageUrl);return embed;
}
