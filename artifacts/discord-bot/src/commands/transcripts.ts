import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildTicketTranscript } from '../ticketUtils.js';

export const transcripts: Command = {
  data: new SlashCommandBuilder().setName('transcripts').setDescription('Configure and manage ticket transcripts')
    .addSubcommand(s => s.setName('set').setDescription('Set the channel where ticket transcripts are saved').addChannelOption(o => o.setName('channel').setDescription('Transcript logging channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('disable').setDescription('Disable ticket transcript logging'))
    .addSubcommand(s => s.setName('status').setDescription('Show the current transcript logging channel'))
    .addSubcommand(s => s.setName('save').setDescription('Save the current ticket transcript now')),
  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    const sub = interaction.options.getSubcommand();
    const isStaff = (interaction.member as { permissions: { has(p: bigint): boolean } }).permissions.has(PermissionFlagsBits.ManageGuild);
    if (sub === 'set') {
      if (!isStaff) { await interaction.reply({content:'❌ Staff only.',ephemeral:true}); return; }
      const channel = interaction.options.getChannel('channel', true);
      updateGuild(interaction.guild.id, d => { d.config.transcriptLogChannel = channel.id; });
      await interaction.reply({content:'✅ Ticket transcript logging is now set to <#'+channel.id+'>.',ephemeral:true}); return;
    }
    if (sub === 'disable') {
      if (!isStaff) { await interaction.reply({content:'❌ Staff only.',ephemeral:true}); return; }
      updateGuild(interaction.guild.id, d => { d.config.transcriptLogChannel = undefined; });
      await interaction.reply({content:'✅ Ticket transcript logging has been disabled.',ephemeral:true}); return;
    }
    const data = loadGuild(interaction.guild.id);
    if (sub === 'status') {
      await interaction.reply({content:data.config.transcriptLogChannel ? '📄 Transcript logging: <#'+data.config.transcriptLogChannel+'>' : '📄 Transcript logging is not configured.',ephemeral:true}); return;
    }
    const ticket = Object.values(data.tickets).find(t => t.channelId === interaction.channelId);
    if (!ticket) { await interaction.reply({content:'❌ This channel is not a ticket.',ephemeral:true}); return; }
    const isOwner = ticket.creatorId === interaction.user.id;
    if (!isStaff && !isOwner) { await interaction.reply({content:'❌ Only the ticket owner or staff can save a transcript.',ephemeral:true}); return; }
    const channel = interaction.channel as TextChannel;
    await interaction.deferReply({ephemeral:true});
    const attachment = await buildTicketTranscript(channel,ticket.id);
    const logId = data.config.transcriptLogChannel;
    const logChannel = logId ? await interaction.guild.channels.fetch(logId).catch(()=>null) as TextChannel|null : null;
    if (!logChannel?.isTextBased?.()) { await interaction.editReply('❌ No valid transcript logging channel is configured. Use /transcripts set first.'); return; }
    await logChannel.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('📄 Ticket Transcript').setDescription('Transcript for ticket '+ticket.id+' from <#'+ticket.channelId+'>.').addFields({name:'Ticket Owner',value:'<@'+ticket.creatorId+'>',inline:true},{name:'Saved By',value:'<@'+interaction.user.id+'>',inline:true}).setTimestamp()],files:[attachment]});
    await interaction.editReply('✅ Transcript saved to <#'+logId+'>.');
  }
};