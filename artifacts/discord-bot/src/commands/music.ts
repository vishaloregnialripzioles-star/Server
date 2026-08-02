import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { Command } from '../types.js';
import {
  searchTrack,
  enqueue,
  skip,
  stop,
  pause,
  resume,
  getQueue,
  buildQueueEmbed,
  buildNowPlayingEmbed,
} from '../musicPlayer.js';

export const music: Command = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music player — stream songs from YouTube')
    .addSubcommand(sub =>
      sub
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption(o =>
          o.setName('song').setDescription('Song name or YouTube URL').setRequired(true),
        ),
    )
    .addSubcommand(sub => sub.setName('skip').setDescription('Skip the current track'))
    .addSubcommand(sub => sub.setName('stop').setDescription('Stop music and disconnect the bot'))
    .addSubcommand(sub => sub.setName('pause').setDescription('Pause the current track'))
    .addSubcommand(sub => sub.setName('resume').setDescription('Resume the paused track'))
    .addSubcommand(sub => sub.setName('queue').setDescription('Show the current queue'))
    .addSubcommand(sub => sub.setName('nowplaying').setDescription('Show what is currently playing')),

  async execute(interaction) {
    if (!interaction.guild) return;

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;
    const sub = interaction.options.getSubcommand();

    // Most subcommands require the user to be in a voice channel
    if (sub !== 'queue' && sub !== 'nowplaying' && !voiceChannel) {
      await interaction.reply({ content: '❌ You need to be in a voice channel first.', flags: 64 });
      return;
    }

    // ── play ──────────────────────────────────────────────────────────────────
    if (sub === 'play') {
      await interaction.deferReply();
      const query = interaction.options.getString('song', true);

      const track = await searchTrack(query);
      if (!track) {
        await interaction.editReply('❌ No results found for that search. Try a different song name.');
        return;
      }
      track.requestedBy = interaction.user.id;

      const { position } = await enqueue(interaction.guild, voiceChannel!, interaction.channel!, track);

      if (position === 1 && !getQueue(interaction.guild.id)?.current) {
        // Will start playing immediately — nowPlaying embed sent by the player
        await interaction.editReply({ content: `✅ Starting **${track.title}**...` });
      } else {
        await interaction.editReply({
          content: `✅ Added to queue at position **#${position}**: **${track.title}** \`${track.duration}\``,
        });
      }
      return;
    }

    // ── skip ──────────────────────────────────────────────────────────────────
    if (sub === 'skip') {
      const skipped = skip(interaction.guild.id);
      if (!skipped) {
        await interaction.reply({ content: '❌ Nothing is playing right now.', flags: 64 });
      } else {
        await interaction.reply({ content: `⏭️ Skipped **${skipped.title}**.` });
      }
      return;
    }

    // ── stop ──────────────────────────────────────────────────────────────────
    if (sub === 'stop') {
      const q = getQueue(interaction.guild.id);
      if (!q) {
        await interaction.reply({ content: '❌ Nothing is playing right now.', flags: 64 });
        return;
      }
      stop(interaction.guild.id);
      await interaction.reply({ content: '⏹️ Stopped music and disconnected.' });
      return;
    }

    // ── pause ─────────────────────────────────────────────────────────────────
    if (sub === 'pause') {
      const ok = pause(interaction.guild.id);
      await interaction.reply({ content: ok ? '⏸️ Paused.' : '❌ Nothing is playing or already paused.', flags: ok ? undefined : 64 });
      return;
    }

    // ── resume ────────────────────────────────────────────────────────────────
    if (sub === 'resume') {
      const ok = resume(interaction.guild.id);
      await interaction.reply({ content: ok ? '▶️ Resumed.' : '❌ Nothing is paused right now.', flags: ok ? undefined : 64 });
      return;
    }

    // ── queue ─────────────────────────────────────────────────────────────────
    if (sub === 'queue') {
      await interaction.reply({ embeds: [buildQueueEmbed(interaction.guild.id)] });
      return;
    }

    // ── nowplaying ────────────────────────────────────────────────────────────
    if (sub === 'nowplaying') {
      const q = getQueue(interaction.guild.id);
      if (!q?.current) {
        await interaction.reply({ content: '❌ Nothing is playing right now.', flags: 64 });
        return;
      }
      await interaction.reply({ embeds: [buildNowPlayingEmbed(q.current)] });
      return;
    }
  },
};
