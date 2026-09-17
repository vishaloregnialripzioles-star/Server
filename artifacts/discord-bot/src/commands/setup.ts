import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild, loadGuild } from '../storage.js';
import { addColourSetup, setupShopRole, setupShopColour } from './shop.js';
import { hasGuildManageAccess, isOwnerOrExtraOwner } from '../security.js';

const LOG_GROUPS: Record<string,string[]> = {
  all:['messageDelete','messageEdit','messageBulkDelete','moderation','invites','joinsLeaves','roleChanges','channelChanges','voice','serverChanges','memberChanges','commands','automod','giveaways'],
  message:['messageDelete','messageEdit','messageBulkDelete'], moderation:['moderation'], invite:['invites'], member:['joinsLeaves','memberChanges'], role:['roleChanges'], channel:['channelChanges'], voice:['voice'], server:['serverChanges'], other:['commands','automod','giveaways'],
};

export const setup: Command = {
  data: new SlashCommandBuilder().setName('setup').setDescription('Configure bot settings for this server')
    .addSubcommand(sub=>sub.setName('logs').setDescription('Configure message, moderation, invite, member, role, channel, voice and server logs')
      .addStringOption(o=>o.setName('type').setDescription('Log group to configure').addChoices(
        {name:'All logs',value:'all'},{name:'Message logs',value:'message'},{name:'Moderation logs',value:'moderation'},{name:'Invite logs',value:'invite'},{name:'Member join/leave logs',value:'member'},{name:'Role logs',value:'role'},{name:'Channel logs',value:'channel'},{name:'Voice logs',value:'voice'},{name:'Server update logs',value:'server'},{name:'Other logs',value:'other'})),
      .addChannelOption(o=>o.setName('channel').setDescription('Channel for this log group'))
      .addBooleanOption(o=>o.setName('enabled').setDescription('Enable or disable this log group')))
    .addSubcommand(sub=>sub.setName('muterole').setDescription('Set the Muted role').addRoleOption(o=>o.setName('role').setDescription('Muted role').setRequired(true)))
    .addSubcommand(sub=>sub.setName('jailrole').setDescription('Set the Jail role').addRoleOption(o=>o.setName('role').setDescription('Jail role').setRequired(true)))
    .addSubcommand(sub=>sub.setName('chatbanrole').setDescription('Set the Chat Ban role').addRoleOption(o=>o.setName('role').setDescription('Chat Ban role').setRequired(true)))
    .addSubcommand(sub=>sub.setName('ticketcategory').setDescription('Set the category where ticket channels are created').addStringOption(o=>o.setName('category_id').setDescription('Category channel ID').setRequired(true)))
    .addSubcommand(sub=>sub.setName('starboard').setDescription('Configure the starboard channel').addChannelOption(o=>o.setName('channel').setDescription('Starboard channel').setRequired(true)).addIntegerOption(o=>o.setName('threshold').setDescription('Star threshold (default 3)').setMinValue(1).setMaxValue(50)))
    .addSubcommand(sub=>sub.setName('levelchannel').setDescription('Set where level-up announcements are sent').addChannelOption(o=>o.setName('channel').setDescription('Level-up channel').setRequired(true)))
    .addSubcommand(sub=>sub.setName('levelrole').setDescription('Assign a role when a member reaches a specific level').addIntegerOption(o=>o.setName('level').setDescription('Level required').setRequired(true).setMinValue(1)).addRoleOption(o=>o.setName('role').setDescription('Role to assign').setRequired(true)))
    .addSubcommand(sub=>sub.setName('ticketrole').setDescription('Set the role that can see and respond to all tickets').addRoleOption(o=>o.setName('role').setDescription('Support/staff role').setRequired(true)))
    .addSubcommand(sub=>sub.setName('snipe').setDescription('Enable or disable the snipe system').addBooleanOption(o=>o.setName('enabled').setDescription('Enable snipe').setRequired(true)))
    .addSubcommand(sub=>sub.setName('shoprole').setDescription('Add a purchasable role to the sparks shop').addStringOption(o=>o.setName('name').setDescription('Role/shop item name').setRequired(true)).addIntegerOption(o=>o.setName('position').setDescription('Display position').setRequired(true).setMinValue(1).setMaxValue(1000)).addIntegerOption(o=>o.setName('coins').setDescription('Price in ⚡ sparks').setRequired(true).setMinValue(0)))
    .addSubcommandGroup(group=>group.setName('shop').setDescription('Configure the sparks shop').addSubcommand(sub=>addColourSetup(sub.setName('colour').setDescription('Add a purchasable colour'))))
    .addSubcommand(sub=>sub.setName('view').setDescription('View current configuration')),

  async execute(interaction) {
    if(!interaction.guild)return;
    const member=interaction.member; const canConfigure=interaction.user.id===interaction.guild.ownerId||isOwnerOrExtraOwner(interaction.guild,interaction.user.id)||(member&&'permissions'in member&&hasGuildManageAccess(member as any));
    if(!canConfigure){await interaction.reply({content:'❌ You need **Manage Server** or extra-owner access to use setup commands.',ephemeral:true});return;}
    const sub=interaction.options.getSubcommand(); const group=interaction.options.getSubcommandGroup(false);
    if(group==='shop'&&sub==='colour'){await setupShopColour(interaction);return;} if(sub==='shoprole'){await setupShopRole(interaction);return;}
    if(sub==='view'){
      const data=loadGuild(interaction.guild.id),cfg=data.config,logging=cfg.logging; const levelRolesText=cfg.levelRoles&&Object.keys(cfg.levelRoles).length?Object.entries(cfg.levelRoles).sort(([a],[b])=>Number(a)-Number(b)).map(([lvl,roleId])=>`Level ${lvl} → <@&${roleId}>`).join('\n'):'None set';
      const logEntries=Object.entries(logging?.categories??{}).filter(([,v])=>v!==false).slice(0,20).map(([k,v])=>`${k}: ${typeof v==='string'?`<#${v}>`:'on'}`).join('\n')||'Not configured';
      const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Server Configuration').addFields({name:'📋 Log Channel',value:cfg.logChannel?`<#${cfg.logChannel}>`:'Not set',inline:true},{name:'🛡️ Anti-Nuke',value:data.antiNuke.enabled?'Enabled':'Disabled',inline:true},{name:'🧾 Advanced Logs',value:logging?.enabled?'Enabled':'Disabled',inline:true},{name:'🔇 Mute Role',value:cfg.muteRole?`<@&${cfg.muteRole}>`:'Not set',inline:true},{name:'🔒 Jail Role',value:cfg.jailRole?`<@&${cfg.jailRole}>`:'Not set',inline:true},{name:'🎫 Ticket Category',value:cfg.ticketCategory?`<#${cfg.ticketCategory}>`:'Not set',inline:true},{name:'⭐ Starboard',value:cfg.starboardChannel?`<#${cfg.starboardChannel}>`:'Not set',inline:true},{name:'📈 Level Channel',value:cfg.levelChannel?`<#${cfg.levelChannel}>`:'Current channel',inline:true},{name:'🔍 Snipe',value:cfg.snipeEnabled?'Enabled':'Disabled',inline:true},{name:'👑 Extra Owners',value:data.extraOwners.length?data.extraOwners.map(id=>`<@${id}>`).join(', '):'None',inline:true},{name:'🏅 Level Roles',value:levelRolesText},{name:'📝 Log Routing',value:logEntries});
      await interaction.reply({embeds:[embed.setTimestamp()]});return;
    }
    await interaction.deferReply();
    if(sub==='logs'){
      const type=interaction.options.getString('type')??'all'; const channel=interaction.options.getChannel('channel'); const enabled=interaction.options.getBoolean('enabled'); const groups=LOG_GROUPS[type]??LOG_GROUPS.all;
      if(enabled===true&&!channel){await interaction.editReply({content:'❌ Select a log channel when enabling logs.'});return;}
      updateGuild(interaction.guild.id,data=>{const cfg=data.config.logging??(data.config.logging={enabled:false,categories:{},channels:{}});cfg.categories??={};cfg.channels??={}; if(type==='all'){cfg.enabled=enabled!==false;if(channel) data.config.logChannel=channel.id; for(const key of groups){cfg.categories[key]=enabled===false?false:(channel?.id??true);if(channel)cfg.channels[key]=channel.id;}}else{for(const key of groups){cfg.categories[key]=enabled===false?false:(channel?.id??true);if(channel)cfg.channels[key]=channel.id;} if(enabled!==false)cfg.enabled=true;}});
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(enabled===false?0xED4245:0x57F287).setTitle(enabled===false?'🧾 Logs Disabled':'🧾 Logs Updated').setDescription(`**${type}** log group ${enabled===false?'disabled':'enabled'}.${channel?`\nChannel: <#${channel.id}>`:''}\n\nYou can route each group to its own channel or point multiple groups at the same channel.`).setTimestamp()]});return;
    }
    updateGuild(interaction.guild.id,data=>{switch(sub){case'muterole':data.config.muteRole=interaction.options.getRole('role',true).id;break;case'jailrole':data.config.jailRole=interaction.options.getRole('role',true).id;break;case'chatbanrole':data.config.chatBanRole=interaction.options.getRole('role',true).id;break;case'ticketcategory':data.config.ticketCategory=interaction.options.getString('category_id',true);break;case'ticketrole':data.config.ticketSupportRole=interaction.options.getRole('role',true).id;break;case'starboard':data.config.starboardChannel=interaction.options.getChannel('channel',true).id;const threshold=interaction.options.getInteger('threshold');if(threshold!==null)data.config.starboardThreshold=threshold;break;case'levelchannel':data.config.levelChannel=interaction.options.getChannel('channel',true).id;break;case'levelrole':if(!data.config.levelRoles)data.config.levelRoles={};data.config.levelRoles[String(interaction.options.getInteger('level',true))]=interaction.options.getRole('role',true).id;break;case'snipe':data.config.snipeEnabled=interaction.options.getBoolean('enabled',true);break;}});
    if(sub==='levelrole'){const level=interaction.options.getInteger('level',true),role=interaction.options.getRole('role',true);await interaction.editReply({content:`✅ Members who reach **Level ${level}** will now receive <@&${role.id}>.`});}else await interaction.editReply({content:`✅ Configuration updated for **${sub}**.`});
  },
};
