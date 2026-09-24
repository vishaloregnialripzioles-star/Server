import { ChannelType, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { generateId } from '../utils.js';

export const ticketpanel: Command = {
  data:new SlashCommandBuilder().setName('ticketpanel').setDescription('Create and send a customizable ticket panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s=>s.setName('create').setDescription('Create a saved ticket panel')
      .addStringOption(o=>o.setName('name').setDescription('Panel ID/name').setRequired(true).setMaxLength(32))
      .addStringOption(o=>o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(256))
      .addStringOption(o=>o.setName('description').setDescription('Panel description').setRequired(true).setMaxLength(4000))
      .addStringOption(o=>o.setName('color').setDescription('Hex color, e.g. #5865F2'))
      .addChannelOption(o=>o.setName('category').setDescription('Category where tickets are created').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o=>o.setName('support_role').setDescription('Staff role with read-only access until claimed'))
      .addStringOption(o=>o.setName('questions').setDescription('Up to 5 questions, separated with |').setMaxLength(1000)))
    .addSubcommand(s=>s.setName('send').setDescription('Send an existing panel to a channel')
      .addStringOption(o=>o.setName('name').setDescription('Saved panel name').setRequired(true))
      .addChannelOption(o=>o.setName('channel').setDescription('Channel to post in').setRequired(true)))
    .addSubcommand(s=>s.setName('delete').setDescription('Delete a saved panel').addStringOption(o=>o.setName('name').setDescription('Panel name').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('List saved ticket panels'))
    .addSubcommand(s=>s.setName('option-add').setDescription('Add a selectable ticket category to a panel')
      .addStringOption(o=>o.setName('panel').setDescription('Saved panel name').setRequired(true))
      .addStringOption(o=>o.setName('name').setDescription('Category name shown to members').setRequired(true).setMaxLength(100))
      .addStringOption(o=>o.setName('description').setDescription('Short category description').setRequired(true).setMaxLength(100))
      .addChannelOption(o=>o.setName('category').setDescription('Discord category where this ticket is created').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o=>o.setName('support_role').setDescription('Staff role for this ticket category'))
      .addStringOption(o=>o.setName('questions').setDescription('Up to 5 questions, separated with |').setMaxLength(1000)))
    .addSubcommand(s=>s.setName('option-remove').setDescription('Remove a selectable ticket category')
      .addStringOption(o=>o.setName('panel').setDescription('Saved panel name').setRequired(true))
      .addStringOption(o=>o.setName('name').setDescription('Category name').setRequired(true)))
    .addSubcommand(s=>s.setName('option-list').setDescription('List selectable ticket categories')
      .addStringOption(o=>o.setName('panel').setDescription('Saved panel name').setRequired(true))),
  async execute(interaction){
    if(!interaction.guild)return;await interaction.deferReply({ephemeral:true});const sub=interaction.options.getSubcommand();
    if(sub==='create'){
      const name=interaction.options.getString('name',true).toLowerCase().trim().replace(/[^a-z0-9_-]/g,'-');const title=interaction.options.getString('title',true),description=interaction.options.getString('description',true),rawColor=interaction.options.getString('color');
      let color:number|undefined;if(rawColor){const clean=rawColor.replace(/^#/,'');if(!/^[0-9a-f]{6}$/i.test(clean)){await interaction.editReply('❌ Invalid color.');return;}color=parseInt(clean,16);}
      const questions=(interaction.options.getString('questions')??'').split('|').map(x=>x.trim()).filter(Boolean).slice(0,5);
      const category=interaction.options.getChannel('category'),support=interaction.options.getRole('support_role');const id=generateId();
      updateGuild(interaction.guild.id,d=>{if(!d.config.ticketPanels)d.config.ticketPanels={};d.config.ticketPanels[name]={id,name,title,description,color,categoryId:category?.id,supportRoleId:support?.id,questions};});
      await interaction.editReply(`✅ Ticket panel **${name}** saved with ${questions.length} question(s). Use \`/ticketpanel send name:${name} channel:#channel\`.`);return;
    }
    if(sub==='option-add'){
      const panelName=interaction.options.getString('panel',true).toLowerCase();const optionName=interaction.options.getString('name',true).trim();const optionDescription=interaction.options.getString('description',true).trim();const category=interaction.options.getChannel('category',true);const support=interaction.options.getRole('support_role');const questions=(interaction.options.getString('questions')??'').split('|').map(x=>x.trim()).filter(Boolean).slice(0,5);const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found. Create it first.');return;}
      if((panel.options??[]).length>=25){await interaction.editReply('❌ A ticket panel can have up to 25 selectable categories.');return;}
      if(panel.options?.some(x=>x.name.toLowerCase()===optionName.toLowerCase())){await interaction.editReply('❌ That category already exists in this panel.');return;}
      const option={id:generateId(),name:optionName,description:optionDescription,categoryId:category.id,supportRoleId:support?.id,questions};
      updateGuild(interaction.guild.id,d=>{const target=d.config.ticketPanels?.[panelName];if(!target)return;target.options=[...(target.options??[]),option];});
      await interaction.editReply(`✅ Added **${optionName}** to panel **${panelName}** with ${questions.length} question(s).`);return;
    }
    if(sub==='option-remove'){
      const panelName=interaction.options.getString('panel',true).toLowerCase();const optionName=interaction.options.getString('name',true).trim();const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];if(!panel){await interaction.editReply('❌ Panel not found.');return;}
      const exists=panel.options?.some(x=>x.name.toLowerCase()===optionName.toLowerCase());if(!exists){await interaction.editReply('❌ Ticket category not found.');return;}
      updateGuild(interaction.guild.id,d=>{const target=d.config.ticketPanels?.[panelName];if(target)target.options=(target.options??[]).filter(x=>x.name.toLowerCase()!==optionName.toLowerCase());});await interaction.editReply(`🗑️ Removed **${optionName}** from panel **${panelName}**.`);return;
    }
    if(sub==='option-list'){
      const panelName=interaction.options.getString('panel',true).toLowerCase();const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];if(!panel){await interaction.editReply('❌ Panel not found.');return;}
      const options=panel.options??[];const description=options.length?options.map((x,i)=>`${i+1}. **${x.name}** — ${x.description} • ${x.questions.length} question(s) • <#${x.categoryId}>`).join('\\n'):'No selectable categories configured.';await interaction.editReply({embeds:[new EmbedBuilder().setColor(panel.color??0x5865F2).setTitle(`🎫 ${panel.name} Categories`).setDescription(description)]});return;
    }
    if(sub==='delete'){const name=interaction.options.getString('name',true).toLowerCase();const exists=loadGuild(interaction.guild.id).config.ticketPanels?.[name];if(!exists){await interaction.editReply('❌ Panel not found.');return;}updateGuild(interaction.guild.id,d=>{delete d.config.ticketPanels![name];});await interaction.editReply(`🗑️ Deleted ticket panel **${name}**.`);return;}
    if(sub==='list'){const panels=loadGuild(interaction.guild.id).config.ticketPanels??{};const names=Object.values(panels).map(p=>`• **${p.name}** — ${p.questions.length} question(s)`).join('\n')||'No saved panels.';await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket Panels').setDescription(names)]});return;}
    const name=interaction.options.getString('name',true).toLowerCase(),channel=interaction.options.getChannel('channel',true);const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[name];if(!panel){await interaction.editReply('❌ Panel not found. Create it first.');return;}
    const embed=new EmbedBuilder().setColor(panel.color??0x5865F2).setTitle(`🎫 ${panel.title}`).setDescription(panel.description).setFooter({text:`Panel: ${panel.name}`}).setTimestamp();
    const components:any[] = panel.options?.length ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`ticket:select:${panel.id}`).setPlaceholder('🎫 Select a ticket category').addOptions(panel.options.slice(0,25).map(option=>new StringSelectMenuOptionBuilder().setLabel(option.name.slice(0,100)).setDescription(option.description.slice(0,100)).setValue(option.id))))] : [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`ticket:open:${panel.id}`).setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))];
    try{await (channel as unknown as TextChannel).send({embeds:[embed],components});await interaction.editReply(`✅ Panel **${name}** sent to <#${channel.id}>.`);}catch{await interaction.editReply('❌ I could not send the panel. Check channel permissions.');}
  },
};
