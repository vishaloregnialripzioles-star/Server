import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from 'discord.js';
import type { Command, YouTubeNotification } from '../types.js';
import { loadGuild, saveGuild } from '../storage.js';
import { resolveYouTubeChannel } from '../socialNotifications.js';

function makeId(): string { return 'yt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

function listSubscriptions(items: YouTubeNotification[]): string {
  if (!items.length) return 'No YouTube notifications are configured yet.';
  return items.map((item, index) => '**' + (index + 1) + '. ' + item.channelName + '** — ID: ' + item.id + ' → <#' + item.discordChannelId + '>\n> ' + item.message.slice(0, 160)).join('\n');
}

export const ytnotify: Command = {
  data: new SlashCommandBuilder()
    .setName('ytnotify')
    .setDescription('Manage YouTube upload and live notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('add').setDescription('Add a YouTube channel notification')
      .addStringOption(o => o.setName('source').setDescription('YouTube URL, @handle, channel ID, or channel name').setRequired(true).setMaxLength(200))
      .addChannelOption(o => o.setName('channel').setDescription('Discord channel for notifications').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Custom message; placeholders: {channel} {title} {url} {type}').setRequired(true).setMaxLength(1900)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a YouTube notification')
      .addStringOption(o => o.setName('id').setDescription('Notification ID from /ytnotify list').setRequired(true)))
    .addSubcommand(s => s.setName('edit').setDescription('Edit a YouTube notification')
      .addStringOption(o => o.setName('id').setDescription('Notification ID from /ytnotify list').setRequired(true))
      .addStringOption(o => o.setName('source').setDescription('New YouTube URL, @handle, channel ID, or channel name').setRequired(false).setMaxLength(200))
      .addChannelOption(o => o.setName('channel').setDescription('New Discord notification channel').setRequired(false))
      .addStringOption(o => o.setName('message').setDescription('New custom message').setRequired(false).setMaxLength(1900)))
    .addSubcommand(s => s.setName('list').setDescription('List configured YouTube notifications'))
    .addSubcommand(s => s.setName('test').setDescription('Send a test for a YouTube notification')
      .addStringOption(o => o.setName('id').setDescription('Notification ID from /ytnotify list').setRequired(true))),
  async execute(interaction) {
    if (!interaction.guild) return;
    const data = loadGuild(interaction.guild.id);
    data.config.youtubeNotifications ??= [];
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('📺 YouTube Notifications').setDescription(listSubscriptions(data.config.youtubeNotifications));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const id = interaction.options.getString('id') ?? '';
    if (sub === 'remove') {
      const index = data.config.youtubeNotifications.findIndex(item => item.id === id);
      if (index === -1) { await interaction.reply({ content: '❌ Notification ID not found. Use /ytnotify list.', ephemeral: true }); return; }
      const removed = data.config.youtubeNotifications.splice(index, 1)[0];
      saveGuild(interaction.guild.id, data);
      await interaction.reply({ content: '✅ Removed YouTube notifications for **' + removed.channelName + '**.', ephemeral: true });
      return;
    }

    if (sub === 'test') {
      const item = data.config.youtubeNotifications.find(entry => entry.id === id);
      if (!item) { await interaction.reply({ content: '❌ Notification ID not found. Use /ytnotify list.', ephemeral: true }); return; }
      const channel = await interaction.guild.channels.fetch(item.discordChannelId).catch(() => null);
      if (!channel?.isTextBased()) { await interaction.reply({ content: '❌ The configured Discord channel is unavailable.', ephemeral: true }); return; }
      const preview = new EmbedBuilder().setColor(0xFF0000).setTitle('📺 YouTube Notification Test').setDescription(item.message.replaceAll('{channel}', item.channelName).replaceAll('{title}', 'Example new upload').replaceAll('{url}', 'https://www.youtube.com/').replaceAll('{type}', 'VIDEO')).setTimestamp();
      await (channel as TextChannel).send({ embeds: [preview] });
      await interaction.reply({ content: '✅ Test notification sent.', ephemeral: true });
      return;
    }

    if (sub === 'add') {
      const source = interaction.options.getString('source', true);
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      if (!channel.isTextBased()) { await interaction.reply({ content: '❌ Please select a text-based Discord channel.', ephemeral: true }); return; }

      await interaction.deferReply({ ephemeral: true });
      const resolved = await resolveYouTubeChannel(source);
      if (!resolved) { await interaction.editReply('❌ I could not resolve that YouTube channel. Try a full channel URL, @handle, channel ID, or exact channel name.'); return; }

      if (data.config.youtubeNotifications.some(item => item.channelId === resolved.channelId && item.discordChannelId === channel.id)) {
        await interaction.editReply('⚠️ That YouTube channel is already configured for this Discord channel.'); return;
      }

      const item: YouTubeNotification = { id: makeId(), channelId: resolved.channelId, channelName: resolved.channelName || source, source, discordChannelId: channel.id, message, enabled: true };
      data.config.youtubeNotifications.push(item);
      saveGuild(interaction.guild.id, data);
      await interaction.editReply('✅ Added **' + item.channelName + '** → <#' + channel.id + '>\nID: ' + item.id + '\n\nFirst check establishes the current latest video, so old uploads will not spam the server.\n\nPlaceholders: {channel} {title} {url} {type}');
      return;
    }

    if (sub === 'edit') {
      const item = data.config.youtubeNotifications.find(entry => entry.id === id);
      if (!item) { await interaction.reply({ content: '❌ Notification ID not found. Use /ytnotify list.', ephemeral: true }); return; }
      const source = interaction.options.getString('source');
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');

      await interaction.deferReply({ ephemeral: true });
      if (source) {
        const resolved = await resolveYouTubeChannel(source);
        if (!resolved) { await interaction.editReply('❌ I could not resolve the new YouTube channel.'); return; }
        item.channelId = resolved.channelId;
        item.channelName = resolved.channelName || source;
        item.source = source;
        item.lastVideoId = undefined;
      }
      if (channel) {
        if (!channel.isTextBased()) { await interaction.editReply('❌ Please select a text-based Discord channel.'); return; }
        item.discordChannelId = channel.id;
      }
      if (message) item.message = message;
      saveGuild(interaction.guild.id, data);
      await interaction.editReply('✅ Updated **' + item.channelName + '**. ID: ' + item.id);
    }
  },
};
