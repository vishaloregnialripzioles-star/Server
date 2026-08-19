import type { Client, TextChannel } from 'discord.js';
import { loadGuild, saveGuild } from './storage.js';

const POLL_MS = 60_000;
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

function clean(v: unknown): string { return String(v ?? '').trim(); }

async function resolveYouTubeChannelId(input: string): Promise<string | null> {
  const value = clean(input);
  const direct = value.match(/youtube\.com\/channel\/(UC[\w-]+)/i) || value.match(/^(UC[\w-]+)$/i);
  if (direct) return direct[1];
  const handle = value.match(/youtube\.com\/@([\w.-]+)/i)?.[1] || value.replace(/^@/, '').trim();
  if (!handle) return null;
  const response = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) return null;
  const html = await response.text();
  return html.match(/"channelId":"(UC[\w-]+)"/)?.[1] || html.match(/"externalId":"(UC[\w-]+)"/)?.[1] || null;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

async function latestYouTube(input: string): Promise<{ id: string; title: string; url: string; published: string } | null> {
  const channelId = await resolveYouTubeChannelId(input);
  if (!channelId) return null;
  const response = await fetch(`${YT_FEED}${channelId}`, { headers: { 'user-agent': 'Sparxie/1.0' } });
  if (!response.ok) return null;
  const xml = await response.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) return null;
  const id = tag(entry, 'yt:videoId');
  const title = tag(entry, 'title');
  const published = tag(entry, 'published');
  if (!id) return null;
  return { id, title, published, url: `https://www.youtube.com/watch?v=${id}` };
}

function renderTemplate(template: string, video: { title: string; url: string; published: string }, platform: string): string {
  return template.replaceAll('{platform}', platform).replaceAll('{title}', video.title).replaceAll('{url}', video.url).replaceAll('{published}', video.published);
}

async function checkGuild(client: Client, guildId: string): Promise<void> {
  const data = loadGuild(guildId);
  const cfg = (data.config.socialNotifications ?? {}) as any;
  if (!cfg.enabled || clean(cfg.platform).toLowerCase() !== 'youtube' || !clean(cfg.source)) return;
  try {
    const video = await latestYouTube(cfg.source);
    if (!video) return;
    if (!cfg.lastVideoId) {
      cfg.lastVideoId = video.id;
      saveGuild(guildId, data);
      return;
    }
    if (cfg.lastVideoId === video.id) return;
    const channelIds = Array.isArray(cfg.channelIds) ? cfg.channelIds.map(clean).filter(Boolean) : (clean(cfg.channelId) ? [clean(cfg.channelId)] : []);
    if (!channelIds.length) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const message = renderTemplate(clean(cfg.message) || '📢 **{title}**\n{url}', video, 'YouTube');
    let sent = false;
    for (const channelId of channelIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).send({ content: message }).catch(() => null);
        sent = true;
      }
    }
    if (sent) {
      cfg.lastVideoId = video.id;
      saveGuild(guildId, data);
      console.log(`[Social] Announced YouTube upload ${video.id} for guild ${guildId}`);
    }
  } catch (error) {
    console.warn(`[Social] YouTube check failed for guild ${guildId}:`, error instanceof Error ? error.message : error);
  }
}

export function startSocialNotifications(client: Client): void {
  const run = () => Promise.all(client.guilds.cache.map(guild => checkGuild(client, guild.id))).catch(error => console.error('[Social]', error));
  void run();
  setInterval(() => { void run(); }, POLL_MS);
}
