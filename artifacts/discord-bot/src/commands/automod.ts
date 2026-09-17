import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, AutoModAction } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

const COLORS = { blue: 0x5865f2, green: 0x57f287, yellow: 0xfee75c, red: 0xed4245 };
const names: Record<string,string> = { spam:'Message Spam', mentions:'Mention Spam', emoji:'Emoji Spam', ping:'@everyone / @here Spam', lines:'Lines / Character Spam' };
const actionText: Record<string,string> = { delete:'Delete', warn:'Warn', timeout:'Mute / Timeout', delete_timeout:'Delete + Mute', dm_warn:'DM + Warn', kick:'Kick', ban:'Ban' };

function ruleEmbed(title: string, description: string, color = COLORS.blue) { return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: 'Sparxie • AutoMod' }).setTimestamp(); }

export const automod: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure rich, configurable server AutoMod protection')
    .addSubcommand(s => s.setName('enable').setDescription('Enable the AutoMod engine'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the AutoMod engine'))
    .addSubcommand(s => s.setName('status').setDescription('Show all AutoMod rules'))
    .addSubcommand(s => s.setName('rule').setDescription('Configure a spam protection rule')
      .addStringOption(o => o.setName('type').setDescription('Rule').setRequired(true).addChoices(
        {name:'Message spam',value:'spam'},{name:'Mention spam',value:'mentions'},{name:'Emoji spam',value:'emoji'},{name:'@everyone/@here spam',value:'ping'},{name:'Lines / characters',value:'lines'}))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable this rule').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Trigger count / line limit').setMinValue(1).setMaxValue(1000))
      .addIntegerOption(o => o.setName('window').setDescription('Time window in seconds').setMinValue(1).setMaxValue(60))
      .addStringOption(o => o.setName('action').setDescription('Punishment').addChoices(
        {name:'Delete',value:'delete'},{name:'Warn',value:'warn'},{name:'Mute / Timeout',value:'timeout'},{name:'Delete + Mute',value:'delete_timeout'},{name:'DM + Warn',value:'dm_warn'},{name:'Kick',value:'kick'},{name:'Ban',value:'ban'}))
      .addIntegerOption(o => o.setName('timeout_seconds').setDescription('Timeout duration (1–2419200 seconds)').setMinValue(1).setMaxValue(2419200))
    )
    .addSubcommand(s => s.setName('words').setDescription('Manage banned words')
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'Add',value:'add'},{name:'Remove',value:'remove'},{name:'List',value:'list'}))
      .addStringOption(o => o.setName('word').setDescription('Word or phrase'))),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ embeds:[ruleEmbed('🔒 AutoMod Setup Locked','You need **Manage Server** permission.',COLORS.red)], ephemeral:true }); return; }
    const guildId = interaction.guild.id; const sub = interaction.options.getSubcommand();
    if (sub === 'enable' || sub === 'disable') {
      updateGuild(guildId, d => { d.config.automod!.enabled = sub === 'enable'; });
      await interaction.reply({ embeds:[ruleEmbed(`🛡️ AutoMod ${sub === 'enable' ? 'Enabled' : 'Disabled'}`, sub === 'enable' ? 'The AutoMod engine is now watching configured rules.' : 'All AutoMod protections are paused.', sub === 'enable' ? COLORS.green : COLORS.yellow)] }); return;
    }
    if (sub === 'rule') {
      const type = interaction.options.getString('type',true); const enabled = interaction.options.getBoolean('enabled',true); const limit = interaction.options.getInteger('limit'); const window = interaction.options.getInteger('window'); const action = interaction.options.getString('action') as AutoModAction | null; const timeout = interaction.options.getInteger('timeout_seconds');
      if ((action === 'timeout' || action === 'delete_timeout') && !timeout) { await interaction.reply({ embeds:[ruleEmbed('⏱️ Timeout Duration Missing','Set **timeout_seconds** when using a timeout punishment.',COLORS.yellow)],ephemeral:true }); return; }
      updateGuild(guildId,d=>{ const a=d.config.automod!; const r:any=(a as any)[type]??{}; (a as any)[type]={...r,enabled,maxCount:limit??r.maxCount??5,windowSeconds:window??r.windowSeconds??5,action:action??r.action??'delete_timeout',timeoutSeconds:timeout??r.timeoutSeconds??600}; if(type==='spam')a.antiSpam=false; if(type==='mentions')a.massMentions=false; });
      const r:any=(loadGuild(guildId).config.automod as any)[type];
      await interaction.reply({ embeds:[ruleEmbed(`⚙️ ${names[type]} Updated`,`Status: **${enabled ? '🟢 Enabled' : '🔴 Disabled'}**\nLimit: **${r.maxCount}** in **${r.windowSeconds}s**\nPunishment: **${actionText[r.action] ?? r.action}**${r.timeoutSeconds ? `\nTimeout: **${r.timeoutSeconds}s**` : ''}`,enabled ? COLORS.green : COLORS.yellow)] }); return;
    }
    if (sub === 'words') {
      const action=interaction.options.getString('action',true); const word=interaction.options.getString('word')?.trim().toLocaleLowerCase();
      if(action==='list'){const words=loadGuild(guildId).config.automod?.bannedWords??[];await interaction.reply({embeds:[ruleEmbed('🚫 Banned Words',words.length?words.map(w=>`• \`${w}\``).join('\n'):'No banned words configured.')],ephemeral:true});return;}
      if(!word){await interaction.reply({embeds:[ruleEmbed('⚠️ Word Required','Provide a word or phrase.',COLORS.yellow)],ephemeral:true});return;}
      updateGuild(guildId,d=>{const a=d.config.automod!;if(action==='add'&&!a.bannedWords.includes(word))a.bannedWords.push(word);if(action==='remove')a.bannedWords=a.bannedWords.filter(w=>w!==word);});
      await interaction.reply({embeds:[ruleEmbed(action==='add'?'🚫 Word Added':'🧹 Word Removed',`**${word}** was ${action==='add'?'added to':'removed from'} the banned-word list.`,COLORS.green)]});return;
    }
    const a:any=loadGuild(guildId).config.automod??{};
    const rows=Object.entries(names).map(([key,name])=>{const r:any=a[key]??{};return `**${name}** • ${r.enabled?'🟢':'🔴'} • ${r.maxCount??'—'} / ${r.windowSeconds??'—'}s • ${actionText[r.action]??'Delete + Mute'}`;});
    await interaction.reply({embeds:[ruleEmbed('🛡️ AutoMod Status',`Engine: **${a.enabled?'🟢 Enabled':'🔴 Disabled'}**\n\n${rows.join('\n')}`)],ephemeral:true});
  },
};
