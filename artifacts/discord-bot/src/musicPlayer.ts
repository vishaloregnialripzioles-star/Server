/**
 * Music player — SoundCloud + YouTube with resilient stream fallbacks.
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
    console.log('[Music] SoundCloud ready');
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
    if (scResults.length) {
      const t = scResults[0];
      return {
        title: t.name ?? 'Unknown',
        url: t.url,
        thumbnail: t.thumbnail?.url,
        duration: formatSeconds(t.durationInSec ?? 0),
        requestedBy: '',
        source: 'soundcloud',
      };
    }
  } catch (e) {
    console.error('[Music] SoundCloud search failed:', e);
  }

  try {
    const ytResults = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (ytResults.length) {
      const v = ytResults[0];
      return {
        title: v.title ?? 'Unknown',
        url: v.url,
        thumbnail: v.thumbnails?.[0]?.url,
        duration: formatSeconds(v.durationInSec ?? 0),
        requestedBy: '',
        source: 'youtube',
      };
    }
  } catch (e) {
    console.error('[Music] YouTube search failed:', e);
  }
  return null;
}

function formatSeconds(s: number): string {
  if (!s || s <= 0) return '?:??';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

type StreamResult = { stream: NodeJS.ReadableStream; type: StreamType };

async function createStream(track: Track): Promise<StreamResult> {
  if (track.source === 'soundcloud') {
    const s = await playdl.stream(track.url);
    if (!s?.stream) throw new Error('SoundCloud returned no audio stream');
    return { stream: s.stream, type: StreamType.Arbitrary };
  }

  // Prefer play-dl for YouTube. This avoids relying on a system yt-dlp binary
  // that may be missing/outdated on a cloud host.
  try {
    const s = await playdl.stream(track.url, { quality: 2 });
    if (s?.stream) return { stream: s.stream, type: StreamType.Arbitrary };
  } catch (e) {
    console.error('[Music] play-dl YouTube stream failed:', e);
  }

  // yt-dlp is the final fallback when play-dl cannot obtain a stream.
  const proc = spawn(YTDLP, [
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    '-f', 'bestaudio/best',
    '-o', '-',
    track.url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stderr.on('data', (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });
  proc.on('error', err => console.error('[yt-dlp] spawn error:', err.message));
  return { stream: proc.stdout, type: StreamType.Arbitrary };
}

export async function enqueue(
  guild: Guild,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  track: Track,
): Promise<{ position: number }> {
  let q = queues.get(guild.id);

  if (!q) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });

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
  if (q.player.state.status === AudioPlayerStatus.Idle && !q.current) await advanceQueue(guild.id);
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
    // Do not create/play the resource until Discord voice is actually READY.
    await entersState(q.connection, VoiceConnectionStatus.Ready, 15_000);
    if (!q.connection.state || q.connection.state.status !== VoiceConnectionStatus.Ready) {
      throw new Error('Voice connection did not become ready');
    }

    const { stream, type } = await createStream(next);
    const resource = createAudioResource(stream as any, {
      inputType: type,
      metadata: { title: next.title, url: next.url },
    });

    if (!resource.readable) throw new Error('Audio resource is not readable');
    if (!q.player.playable.includes(q.connection)) q.connection.subscribe(q.player);

    q.player.play(resource);
    if (!q.player.checkPlayable()) throw new Error('Audio player rejected the resource');

    console.log(`[Music] Playing "${next.title}" from ${next.source}`);
    await q.textChannel.send({ embeds: [buildNowPlayingEmbed(next)] }).catch(() => undefined);
  } catch (err) {
    console.error(`[Music] Failed to play "${next.title}":`, err);
    q.current = null;

    // Retry SoundCloud tracks through YouTube search, and vice versa.
    try {
      const fallbackSource = next.source === 'soundcloud' ? 'youtube' : 'soundcloud';
      if (fallbackSource === 'youtube') {
        const results = await playdl.search(next.title, { source: { youtube: 'video' }, limit: 1 });
        if (results.length) {
          q.tracks.unshift({
            title: results[0].title ?? next.title,
            url: results[0].url,
            thumbnail: results[0].thumbnails?.[0]?.url,
            duration: formatSeconds(results[0].durationInSec ?? 0),
            requestedBy: next.requestedBy,
            source: 'youtube',
          });
        }
      } else {
        const results = await playdl.search(next.title, { source: { soundcloud: 'tracks' }, limit: 1 });
        if (results.length) {
          q.tracks.unshift({
            title: results[0].name ?? next.title,
            url: results[0].url,
            thumbnail: results[0].thumbnail?.url,
            duration: formatSeconds(results[0].durationInSec ?? 0),
            requestedBy: next.requestedBy,
            source: 'soundcloud',
          });
        }
      }
    } catch (fallbackError) {
      console.error('[Music] Fallback search failed:', fallbackError);
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
  return q.player.pause();
}

export function resume(guildId: string): boolean {
  const q = queues.get(guildId);
  if (!q || q.player.state.status !== AudioPlayerStatus.Paused) return false;
  return q.player.unpause();
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
