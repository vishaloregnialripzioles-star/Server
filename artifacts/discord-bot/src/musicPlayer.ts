/**
 * Music player — SoundCloud primary (works on cloud servers),
 * YouTube via yt-dlp as fallback.
 */
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  NoSubscriberBehavior,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import playdl from 'play-dl';
import type { Guild, VoiceBasedChannel, TextBasedChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

let scReady = false;
async function ensureSoundCloud(): Promise<void> {
  if (scReady) return;
  try {
    const id = await playdl.getFreeClientID();
    await playdl.setToken({ soundcloud: { client_id: id } });
    scReady = true;
    console.log('[Music] SoundCloud client_id fetched');
  } catch (e) {
    console.error('[Music] SoundCloud init failed:', e);
  }
}
void ensureSoundCloud();

const YTDLP_CANDIDATES = [
  '/home/runner/.local/bin/yt-dlp',
  '/home/user/.local/bin/yt-dlp',
  '/app/.local/bin/yt-dlp',
  '/tmp/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
];
const YTDLP = YTDLP_CANDIDATES.find(p => existsSync(p)) ?? 'yt-dlp';

export interface Track {
  title: string;
  url: string;
  thumbnail?: string;
  duration: string;
  requestedBy: string;
  source: 'soundcloud' | 'youtube';
}

interface GuildQueue {
  connection: VoiceConnection;
  player: AudioPlayer;
  tracks: Track[];
  current: Track | null;
  textChannel: TextBasedChannel;
}

const queues = new Map<string, GuildQueue>();

export async function searchTrack(query: string): Promise<Track | null> {
  await ensureSoundCloud();
  try {
    const scResults = await playdl.search(query, { source: { soundcloud: 'tracks' }, limit: 1 });
    if (scResults.length > 0) {
      const t = scResults[0];
      return { title: t.name ?? 'Unknown', url: t.url, thumbnail: t.thumbnail?.url, duration: formatSeconds(t.durationInSec ?? 0), requestedBy: '', source: 'soundcloud' };
    }
  } catch (e) { console.error('[Music] SoundCloud search failed:', e); }
  try {
    const ytResults = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (ytResults.length > 0) {
      const v = ytResults[0];
      return { title: v.title ?? 'Unknown', url: v.url, thumbnail: v.thumbnails?.[0]?.url, duration: formatSeconds(v.durationInSec ?? 0), requestedBy: '', source: 'youtube' };
    }
  } catch (e) { console.error('[Music] YouTube search failed:', e); }
  return null;
}

function formatSeconds(s: number): string {
  if (!s || s <= 0) return '?:??';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

async function createStream(track: Track): Promise<{ stream: NodeJS.ReadableStream; type: StreamType }> {
  if (track.source === 'soundcloud') {
    const s = await playdl.stream(track.url);
    // IMPORTANT: play-dl returns the actual codec/container type. The old
    // code discarded it and forced Arbitrary, which can produce silence.
    return { stream: s.stream, type: s.type };
  }

  // Ask yt-dlp for an Opus/WebM stream when possible. Discord can consume
  // this directly without an extra transcoding step.
  const proc = spawn(YTDLP, [
    '-f', 'bestaudio[acodec=opus][ext=webm]/bestaudio[ext=webm]/bestaudio',
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    '--output', '-',
    track.url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stderr.on('data', (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });
  proc.on('error', err => console.error('[yt-dlp] spawn error:', err.message));
  return { stream: proc.stdout, type: StreamType.WebmOpus };
}

export async function enqueue(guild: Guild, voiceChannel: VoiceBasedChannel, textChannel: TextBasedChannel, track: Track): Promise<{ position: number }> {
  let q = queues.get(guild.id);
  if (!q) {
    const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    connection.subscribe(player);
    q = { connection, player, tracks: [], current: null, textChannel };
    queues.set(guild.id, q);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        cleanup(guild.id);
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      const still = queues.get(guild.id);
      if (still) still.current = null;
      void advanceQueue(guild.id);
    });

    player.on('error', err => {
      console.error('[Music] AudioPlayer error:', err.message);
      const still = queues.get(guild.id);
      if (still) still.current = null;
      void advanceQueue(guild.id);
    });
  }

  q.tracks.push(track);
  const position = q.tracks.length;
  if (q.player.state.status === AudioPlayerStatus.Idle && !q.current) {
    await advanceQueue(guild.id);
  }
  return { position };
}

async function advanceQueue(guildId: string): Promise<void> {
  const q = queues.get(guildId);
  if (!q) return;

  const next = q.tracks.shift();
  if (!next) {
    setTimeout(() => {
      const still = queues.get(guildId);
      if (still && !still.current && still.tracks.length === 0) cleanup(guildId);
    }, 5 * 60 * 1000);
    return;
  }

  q.current = next;

  try {
    // Wait until Discord's voice connection is actually ready before
    // starting the player. This prevents a successful-looking silent play.
    await entersState(q.connection, VoiceConnectionStatus.Ready, 15_000);

    const { stream, type } = await createStream(next);
    const resource = createAudioResource(stream, { inputType: type });

    if (!resource.readable) {
      throw new Error(`Audio resource is not readable (${type})`);
    }

    q.player.play(resource);
    console.log(`[Music] Playing "${next.title}" from ${next.source} (${type})`);
    await q.textChannel.send({ embeds: [buildNowPlayingEmbed(next)] }).catch(() => undefined);
  } catch (err) {
    console.error('[Music] Failed to play track:', err);
    q.current = null;

    // Keep the original SoundCloud -> YouTube fallback behavior.
    if (next.source === 'soundcloud') {
      try {
        const ytResults = await playdl.search(next.title, { source: { youtube: 'video' }, limit: 1 });
        if (ytResults.length > 0) {
          const v = ytResults[0];
          q.tracks.unshift({
            title: v.title ?? next.title,
            url: v.url,
            thumbnail: v.thumbnails?.[0]?.url,
            duration: formatSeconds(v.durationInSec ?? 0),
            requestedBy: next.requestedBy,
            source: 'youtube',
          });
        }
      } catch (fallbackErr) {
        console.error('[Music] YouTube fallback failed:', fallbackErr);
      }
    }

    void advanceQueue(guildId);
  }
}

function cleanup(guildId: string): void {
  const q = queues.get(guildId);
  if (!q) return;
  try { q.player.stop(true); } catch {}
  try { q.connection.destroy(); } catch {}
  queues.delete(guildId);
}

export function skip(guildId: string): Track | null {
  const q = queues.get(guildId);
  if (!q) return null;
  const skipped = q.current;
  q.current = null;
  q.player.stop();
  return skipped;
}

export function stop(guildId: string): void { cleanup(guildId); }

export function pause(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q || q.player.state.status !== AudioPlayerStatus.Playing) return false;
  q.player.pause();
  return true;
}

export function resume(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q || q.player.state.status !== AudioPlayerStatus.Paused) return false;
  q.player.unpause();
  return true;
}

export function getQueue(guildId: string): GuildQueue | null { return queues.get(guildId) ?? null; }

export function buildNowPlayingEmbed(track: Track): EmbedBuilder {
  const sourceIcon = track.source === 'soundcloud' ? '☁️ SoundCloud' : '▶️ YouTube';
  return new EmbedBuilder()
    .setColor(track.source === 'soundcloud' ? 0xFF5500 : 0xFF0000)
    .setTitle('🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: '⏱️ Duration', value: track.duration, inline: true },
      { name: '🎧 Source', value: sourceIcon, inline: true },
      ...(track.requestedBy ? [{ name: '👤 Requested by', value: `<@${track.requestedBy}>`, inline: true }] : []),
    )
    .setThumbnail(track.thumbnail ?? null)
    .setTimestamp();
}

export function buildQueueEmbed(guildId: string): EmbedBuilder {
  const q = queues.get(guildId);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Music Queue');
  if (!q || (!q.current && q.tracks.length === 0)) return embed.setDescription('*The queue is empty.*');
  if (q.current) {
    const icon = q.current.source === 'soundcloud' ? '☁️' : '▶️';
    embed.addFields({ name: `${icon} Now Playing`, value: `**[${q.current.title}](${q.current.url})** \`${q.current.duration}\`` });
  }
  if (q.tracks.length > 0) {
    const list = q.tracks.slice(0, 10).map((t, i) => {
      const icon = t.source === 'soundcloud' ? '☁️' : '▶️';
      return `\`${i + 1}.\` ${icon} [${t.title}](${t.url}) \`${t.duration}\``;
    }).join('\n');
    const extra = q.tracks.length > 10 ? `\n*...and ${q.tracks.length - 10} more*` : '';
    embed.addFields({ name: `⏭️ Up Next (${q.tracks.length})`, value: list + extra });
  }
  return embed;
}
