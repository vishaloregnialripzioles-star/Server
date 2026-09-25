import type { Client, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { loadGuild, saveGuild } from './storage.js';
import type { YouTubeNotification } from './types.js';

const POLL_MS = 60_000;
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const MAX_CATCHUP = 5;

function clean(v: unknown): string { return String(v ?? '').trim(); }

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function extractChannelId(html: string): string | null {
  const patterns = [
    /"channelId":"(UC[\w-]{20,})"/,
    /"externalId":"(UC[\w-]{20,})"/,
    /"browseId":"(UC[\w-]{20,})"/,
    /"channelRenderer":\{[\s\S]*?"channelId":"(UC[\w-]{20,})"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export async function resolveYouTubeChannel(input: string): Promise<{ channelId: string; channelName: string } | null> {
  const value = clean(input);
  if (!value) return null;

  const direct = value.match(/(?:youtube\.com\/channel\/)(UC[\w-]{20,})/i) || value.match(/^(UC[\w-]{20,})$/i);
  let channelId = direct?.[1] ?? null;

  if (!channelId) {
    const handle = value.match(/youtube\.com\/@([\w.-]+)/i)?.[1] ?? (value.startsWith('@') ? value.slice(1) : null);
    if (handle) {
      const response = await fetch('https://www.youtube.com/@' + encodeURIComponent(handle), { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
      if (response.ok) channelId = extractChannelId(await response.text());
    }
  }

  if (!channelId && /^(https?:\/\/|youtube\.com\/)/i.test(value)) {
    const response = await fetch(value.startsWith('http') ? value : 'https://' + value, { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
    if (response.ok) channelId = extractChannelId(await response.text());
  }

  if (!channelId) {
    const search = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(value), { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
    if (search.ok) channelId = extractChannelId(await search.text());
  }

  if (!channelId) return null;

  const feed = await fetch(YT_FEED + channelId, { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
  if (!feed.ok) return null;
  const xml = await feed.text();
  const author = xml.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i)?.[1];
  return { channelId, channelName: decodeHtml(author ? author.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : value) };
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return match ? decodeHtml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : '';
}

type YouTubeItem = { id: string; title: string; url: string; published: string; channelName: string; thumbnail: string; };

async function latestYouTube(channelId: string): Promise<YouTubeItem[]> {
  const response = await fetch(YT_FEED + channelId, { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
  if (!response.ok) return [];
  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map(match => match[1]);
  return entries.map(entry => {
    const id = tag(entry, 'yt:videoId');
    const title = tag(entry, 'title');
    const published = tag(entry, 'published');
    const thumbnail = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] ?? ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg');
    const channelName = tag(entry, 'name');
    return { id, title, published, channelName, thumbnail, url: 'https://www.youtube.com/watch?v=' + id };
  }).filter(item => item.id);
}

async function getVideoType(video: YouTubeItem): Promise<'live' | 'video'> {
  try {
    const response = await fetch(video.url, { headers: { 'user-agent': 'Mozilla/5.0 SparxieBot/1.0' } });
    if (!response.ok) return 'video';
    const html = await response.text();
    if (/"isLiveContent":true/.test(html) || /"isLiveNow":true/.test(html)) return 'live';
  } catch {}
  return 'video';
}

function renderTemplate(template: string, video: YouTubeItem, type: 'live' | 'video'): string {
  return template.replaceAll('{platform}', 'YouTube').replaceAll('{type}', type === 'live' ? 'LIVE' : 'VIDEO').replaceAll('{title}', video.title).replaceAll('{url}', video.url).replaceAll('{channel}', video.channelName).replaceAll('{published}', video.published);
}

async function sendNotification(client: Client, guildId: string, sub: YouTubeNotification, video: YouTubeItem): Promise<boolean> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;
  const channel = await guild.channels.fetch(sub.discordChannelId).catch(() => null);
  if (!channel?.isTextBased()) return false;

  const type = await getVideoType(video);
  const content = renderTemplate(sub.message || '📢 **{channel}** has a new {type}: **{title}**\n{url}', video, type);
  const embed = new EmbedBuilder().setColor(type === 'live' ? 0xED4245 : 0xFF0000).setTitle(type === 'live' ? '🔴 YouTube Live' : '📺 New YouTube Video').setDescription(content).setURL(video.url).setThumbnail(video.thumbnail).setTimestamp();
  await (channel as TextChannel).send({ embeds: [embed] });
  return true;
}

async function checkYouTubeSubscription(client: Client, guildId: string, sub: YouTubeNotification): Promise<void> {
  if (!sub.enabled) return;
  const items = await latestYouTube(sub.channelId);
  if (!items.length) return;
  if (!sub.lastVideoId) { sub.lastVideoId = items[0].id; return; }

  const newestIndex = items.findIndex(item => item.id === sub.lastVideoId);
  const unseen = (newestIndex === -1 ? items : items.slice(0, newestIndex)).slice(0, MAX_CATCHUP).reverse();
  if (!unseen.length) return;

  let delivered = false;
  for (const video of unseen) {
    if (await sendNotification(client, guildId, sub, video)) {
      sub.lastVideoId = video.id;
      delivered = true;
    }
  }
  if (delivered) console.log('[YouTube] Announced ' + unseen.length + ' update(s) for ' + sub.channelName + ' in guild ' + guildId);
}

async function checkLegacySocialNotification(client: Client, guildId: string): Promise<void> {
  const data = loadGuild(guildId);
  const cfg = data.config.socialNotifications;
  if (!cfg?.enabled || clean(cfg.platform).toLowerCase() !== 'youtube' || !clean(cfg.source)) return;
  const resolved = await resolveYouTubeChannel(clean(cfg.source));
  if (!resolved) return;
  const items = await latestYouTube(resolved.channelId);
  const video = items[0];
  if (!video) return;
  if (!cfg.lastVideoId) { cfg.lastVideoId = video.id; saveGuild(guildId, data); return; }
  if (cfg.lastVideoId === video.id) return;
  const channelIds = Array.isArray(cfg.channelIds) ? cfg.channelIds.map(clean).filter(Boolean) : (clean(cfg.channelId) ? [clean(cfg.channelId)] : []);
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const message = renderTemplate(clean(cfg.message) || '📢 **{title}**\n{url}', video, 'video');
  let sent = false;
  for (const id of channelIds) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased()) { await (channel as TextChannel).send({ content: message }).catch(() => null); sent = true; }
  }
  if (sent) { cfg.lastVideoId = video.id; saveGuild(guildId, data); }
}

export function startSocialNotifications(client: Client): void {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      const data = loadGuild(guild.id);
      const subscriptions = data.config.youtubeNotifications ?? [];
      let changed = false;
      for (const sub of subscriptions) {
        const before = sub.lastVideoId;
        await checkYouTubeSubscription(client, guild.id, sub).catch(error => console.warn('[YouTube] Check failed for ' + sub.channelName + ':', error instanceof Error ? error.message : error));
        if (sub.lastVideoId !== before) changed = true;
      }
      if (changed) saveGuild(guild.id, data);
      await checkLegacySocialNotification(client, guild.id).catch(error => console.warn('[Social] Legacy YouTube check failed for ' + guild.id + ':', error instanceof Error ? error.message : error));
    }
  };
  void run();
  setInterval(() => { void run(); }, POLL_MS);
}
