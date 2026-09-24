import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { createTicketForUser, getTicketPanel } from '../ticketUtils.js';
import { generateId } from '../utils.js';
import { loadGuild, updateGuild } from '../storage.js';

function parseQuestions(raw:string|undefined):string[] {
  return (raw ?? '').split('|').map(x => x.trim()).filter(Boolean).slice(0, 5);
}

function cleanPanelName(value:string):string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').slice(0, 32);
}

function parseColor(value:string|undefined):number|undefined {
  if (!value) return undefined;
  const clean=value.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return undefined;
  return parseInt(clean, 16);
}

export const ticket: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create, send and manage ticket panels')
    .addSubcommand(s => s.setName('create').setDescription('Create a ticket panel')
      .addStringOption(o => o.setName('name').setDescription('Unique panel name').setRequired(true).setMaxLength(32))
      .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(256))
      .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(true).setMaxLength(4000))
      .addStringOption(o => o.setName('color').setDescription('Hex color, e.g. #5865F2'))
      .addChannelOption(o => o.setName('category').setDescription('Default ticket category').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('support_role').setDescription('Default support role'))
      .addStringOption(o => o.setName('questions').setDescription('Up to 5 questions separated by |').setMaxLength(1000)))
    .addSubcommand(s => s.setName('send').setDescription('Send a saved ticket panel')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel where the panel will be sent').setRequired(true))
    )
    .addSubcommand(s => s.setName('edit').setDescription('Edit a panel or one of its ticket categories')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true))
      .addStringOption(o => o.setName('option').setDescription('Existing category name to edit (leave empty to edit the panel)'))
      .addStringOption(o => o.setName('name').setDescription('New panel/category name'))
      .addStringOption(o => o.setName('title').setDescription('New panel title'))
      .addStringOption(o => o.setName('description').setDescription('New description'))
      .addStringOption(o => o.setName('color').setDescription('New hex color, e.g. #5865F2'))
      .addChannelOption(o => o.setName('category').setDescription('New Discord ticket category').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('support_role').setDescription('New support role'))
      .addStringOption(o => o.setName('questions').setDescription('Replace questions, separated by |').setMaxLength(1000))
      .addBooleanOption(o => o.setName('clear_category').setDescription('Remove the current category'))
      .addBooleanOption(o => o.setName('clear_support_role').setDescription('Remove the current support role'))
      .addBooleanOption(o => o.setName('clear_questions').setDescription('Remove all questions')))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a saved ticket panel')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List saved ticket panels'))
    .addSubcommand(s => s.setName('option-add').setDescription('Add a selectable category to a panel')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Category name shown to members').setRequired(true).setMaxLength(100))
      .addStringOption(o => o.setName('description').setDescription('Category description').setRequired(true).setMaxLength(100))
      .addChannelOption(o => o.setName('category').setDescription('Discord category for this ticket').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('support_role').setDescription('Support role for this category'))
      .addStringOption(o => o.setName('questions').setDescription('Up to 5 questions separated by |').setMaxLength(1000)))
    .addSubcommand(s => s.setName('option-list').setDescription('List selectable categories in a panel')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true)))
    .addSubcommand(s => s.setName('option-remove').setDescription('Remove a selectable category')
      .addStringOption(o => o.setName('panel').setDescription('Panel name').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Category name').setRequired(true)))
    .addSubcommand(s => s.setName('open').setDescription('Open a ticket directly')
      .addStringOption(o => o.setName('reason').setDescription('What do you need help with?').setRequired(true))
      .addStringOption(o => o.setName('panel').setDescription('Optional saved panel name'))),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });
    const sub=interaction.options.getSubcommand();
    const managementSubcommands=new Set(['create','send','edit','delete','list','option-add','option-list','option-remove']);
    if (managementSubcommands.has(sub) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply('❌ You need Manage Server permission to manage ticket panels.');
      return;
    }

    if (sub==='create') {
      const name=cleanPanelName(interaction.options.getString('name', true));
      const title=interaction.options.getString('title', true);
      const description=interaction.options.getString('description', true);
      const rawColor=interaction.options.getString('color');
      const color=rawColor ? parseColor(rawColor) : undefined;
      if (rawColor && color===undefined) { await interaction.editReply('❌ Invalid color. Use a 6-digit hex color like #5865F2.'); return; }
      const category=interaction.options.getChannel('category');
      const support=interaction.options.getRole('support_role');
      const questions=parseQuestions(interaction.options.getString('questions'));
      const existing=loadGuild(interaction.guild.id).config.ticketPanels?.[name];
      if (existing) { await interaction.editReply(`❌ Panel **${name}** already exists. Use /ticket edit or choose another name.`); return; }
      const id=generateId();
      updateGuild(interaction.guild.id,d=>{
        if(!d.config.ticketPanels) d.config.ticketPanels={};
        d.config.ticketPanels[name]={id,name,title,description,color,categoryId:category?.id,supportRoleId:support?.id,questions,options:[]};
      });
      await interaction.editReply(`✅ Created ticket panel **${name}**.\nUse **/ticket send** to publish it, or **/ticket option-add** to add selectable categories.`);
      return;
    }

    if (sub==='send') {
      const panelName=interaction.options.getString('panel', true).toLowerCase();
      const channel=interaction.options.getChannel('channel', true);
      const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found. Use /ticket list.');return;}
      if(!channel.isTextBased()){await interaction.editReply('❌ Select a text channel.');return;}
      const embed=new EmbedBuilder().setColor(panel.color??0x5865F2).setTitle(`🎫 ${panel.title}`).setDescription(panel.description).setFooter({text:`Panel: ${panel.name}`}).setTimestamp();
      let components:any[];
      if(panel.options?.length){
        const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder }=await import('discord.js');
        components=[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`ticket:select:${panel.id}`).setPlaceholder('🎫 Select a ticket category').addOptions(panel.options.slice(0,25).map(option=>new StringSelectMenuOptionBuilder().setLabel(option.name.slice(0,100)).setDescription(option.description.slice(0,100)).setValue(option.id))))];
      } else {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle }=await import('discord.js');
        components=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:open:${panel.id}`).setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))];
      }
      try { await channel.send({embeds:[embed],components}); await interaction.editReply(`✅ Panel **${panelName}** sent to <#${channel.id}>.`); }
      catch { await interaction.editReply('❌ I could not send the panel. Check my View Channel, Send Messages and Embed Links permissions.'); }
      return;
    }

    if (sub==='edit') {
      const panelName=interaction.options.getString('panel', true).toLowerCase();
      const optionName=interaction.options.getString('option')?.trim();
      const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found. Use /ticket list.');return;}

      const newName=interaction.options.getString('name');
      const newTitle=interaction.options.getString('title');
      const newDescription=interaction.options.getString('description');
      const rawColor=interaction.options.getString('color');
      const newColor=rawColor ? parseColor(rawColor) : undefined;
      const category=interaction.options.getChannel('category');
      const support=interaction.options.getRole('support_role');
      const rawQuestions=interaction.options.getString('questions');
      const clearCategory=interaction.options.getBoolean('clear_category')??false;
      const clearSupport=interaction.options.getBoolean('clear_support_role')??false;
      const clearQuestions=interaction.options.getBoolean('clear_questions')??false;

      if(rawColor && newColor===undefined){await interaction.editReply('❌ Invalid color.');return;}
      if(optionName){
        const target=panel.options?.find(x=>x.name.toLowerCase()===optionName.toLowerCase());
        if(!target){await interaction.editReply('❌ Ticket category not found in this panel. Use /ticket option-list.');return;}
        const questions=rawQuestions!==null ? parseQuestions(rawQuestions??'') : undefined;
        if(!newName&&!newDescription&&!category&&!support&&!rawQuestions&&!clearCategory&&!clearSupport&&!clearQuestions){await interaction.editReply('❌ Provide at least one field to edit.');return;}
        if(newName && panel.options?.some(x=>x!==target&&x.name.toLowerCase()===newName.toLowerCase())){await interaction.editReply('❌ Another category already uses that name.');return;}
        updateGuild(interaction.guild.id,d=>{
          const targetPanel=d.config.ticketPanels?.[panelName]; const targetOption=targetPanel?.options?.find(x=>x.id===target.id); if(!targetPanel||!targetOption)return;
          if(newName)targetOption.name=newName.trim().slice(0,100);
          if(newDescription)targetOption.description=newDescription.trim().slice(0,100);
          if(category)targetOption.categoryId=category.id; else if(clearCategory)delete targetOption.categoryId;
          if(support)targetOption.supportRoleId=support.id; else if(clearSupport)delete targetOption.supportRoleId;
          if(rawQuestions!==null)targetOption.questions=questions??[]; else if(clearQuestions)targetOption.questions=[];
        });
        await interaction.editReply(`✅ Updated ticket category **${newName??target.name}** in panel **${panelName}**.`);return;
      }

      if(!newName&&!newTitle&&!newDescription&&!rawColor&&!category&&!support&&!rawQuestions&&!clearCategory&&!clearSupport&&!clearQuestions){await interaction.editReply('❌ Provide at least one panel field to edit.');return;}
      const renamed=newName?cleanPanelName(newName):panelName;
      if(renamed!==panelName&&loadGuild(interaction.guild.id).config.ticketPanels?.[renamed]){await interaction.editReply('❌ A panel with that name already exists.');return;}
      updateGuild(interaction.guild.id,d=>{
        const target=d.config.ticketPanels?.[panelName]; if(!target)return;
        if(newName) { target.name=renamed; d.config.ticketPanels![renamed]=target; delete d.config.ticketPanels![panelName]; }
        if(newTitle)target.title=newTitle;
        if(newDescription)target.description=newDescription;
        if(newColor!==undefined)target.color=newColor;
        if(category)target.categoryId=category.id; else if(clearCategory)delete target.categoryId;
        if(support)target.supportRoleId=support.id; else if(clearSupport)delete target.supportRoleId;
        if(rawQuestions!==null)target.questions=parseQuestions(rawQuestions??''); else if(clearQuestions)target.questions=[];
      });
      await interaction.editReply(`✅ Updated ticket panel **${renamed}**.`);return;
    }

    if (sub==='delete') {
      const panelName=interaction.options.getString('panel', true).toLowerCase();
      if(!loadGuild(interaction.guild.id).config.ticketPanels?.[panelName]){await interaction.editReply('❌ Panel not found.');return;}
      updateGuild(interaction.guild.id,d=>{delete d.config.ticketPanels![panelName];});
      await interaction.editReply(`🗑️ Deleted ticket panel **${panelName}**.`);return;
    }

    if (sub==='list') {
      const panels=loadGuild(interaction.guild.id).config.ticketPanels??{};
      const lines=Object.values(panels).map(p=>`• **${p.name}** — ${p.options?.length??0} categories — ${p.questions.length} panel question(s)`);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket Panels').setDescription(lines.join('\\n')||'No saved panels. Create one with /ticket create.')]});return;
    }

    if (sub==='option-add') {
      const panelName=interaction.options.getString('panel',true).toLowerCase();
      const name=interaction.options.getString('name',true).trim();
      const description=interaction.options.getString('description',true).trim();
      const category=interaction.options.getChannel('category',true);
      const support=interaction.options.getRole('support_role');
      const questions=parseQuestions(interaction.options.getString('questions'));
      const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found.');return;}
      if((panel.options?.length??0)>=25){await interaction.editReply('❌ A panel can have at most 25 selectable categories.');return;}
      if(panel.options?.some(x=>x.name.toLowerCase()===name.toLowerCase())){await interaction.editReply('❌ That category already exists.');return;}
      const option={id:generateId(),name,description,categoryId:category.id,supportRoleId:support?.id,questions};
      updateGuild(interaction.guild.id,d=>{const target=d.config.ticketPanels?.[panelName];if(target)target.options=[...(target.options??[]),option];});
      await interaction.editReply(`✅ Added ticket category **${name}** to **${panelName}**.`);return;
    }

    if (sub==='option-list') {
      const panelName=interaction.options.getString('panel',true).toLowerCase();
      const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found.');return;}
      const lines=(panel.options??[]).map((x,i)=>`${i+1}. **${x.name}** — ${x.description} • <#${x.categoryId}> • ${x.questions.length} question(s)`);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(panel.color??0x5865F2).setTitle(`🎫 ${panel.name} Categories`).setDescription(lines.join('\\n')||'No selectable categories yet.') ]});return;
    }

    if (sub==='option-remove') {
      const panelName=interaction.options.getString('panel',true).toLowerCase();
      const name=interaction.options.getString('name',true).trim();
      const panel=loadGuild(interaction.guild.id).config.ticketPanels?.[panelName];
      if(!panel){await interaction.editReply('❌ Panel not found.');return;}
      const found=panel.options?.some(x=>x.name.toLowerCase()===name.toLowerCase());
      if(!found){await interaction.editReply('❌ Category not found.');return;}
      updateGuild(interaction.guild.id,d=>{const target=d.config.ticketPanels?.[panelName];if(target)target.options=(target.options??[]).filter(x=>x.name.toLowerCase()!==name.toLowerCase());});
      await interaction.editReply(`🗑️ Removed category **${name}**.`);return;
    }

    const reason=interaction.options.getString('reason',true);
    const panelName=interaction.options.getString('panel')??undefined;
    const panel=panelName?getTicketPanel(interaction.guild,panelName):getTicketPanel(interaction.guild);
    if(panelName&&!panel){await interaction.editReply('❌ That ticket panel does not exist.');return;}
    const result=await createTicketForUser(interaction.guild,interaction.user,interaction.client,reason,panel?.name);
    await interaction.editReply(result.success?`✅ Your ticket has been created: <#${result.channel.id}>`:`❌ ${result.message}`);
  },
};
