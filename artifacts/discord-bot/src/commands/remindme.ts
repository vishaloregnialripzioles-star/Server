import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { parseDuration, formatDuration, generateId } from '../utils.js';
import { updateGuild } from '../storage.js';

export const remindme: Command = {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Set a reminder that will be delivered in this channel')
    .addStringOption(o =>
      o.setName('time')
        .setDescription('When to remind you (e.g. 10m, 1h, 2d)')
        .setRequired(true),
    )
    .addStringOption(o =>
      o.setName('message')
        .setDescription('What to remind you about')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;

    const timeStr = interaction.options.getString('time', true);
    const message = interaction.options.getString('message', true);

    const durationMs = parseDuration(timeStr);
    if (!durationMs) {
      await interaction.reply({
        content: '❌ Invalid time format. Examples: `10m`, `1h`, `2d`, `1w`',
        flags: 64,
      });
      return;
    }

    const MAX_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (durationMs > MAX_DURATION) {
      await interaction.reply({ content: '❌ Maximum reminder time is 30 days.', flags: 64 });
      return;
    }

    const due = Date.now() + durationMs;
    const reminderId = generateId();

    updateGuild(interaction.guild.id, data => {
      data.reminders.push({
        id: reminderId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guild!.id,
        message,
        due,
      });
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⏰ Reminder Set')
          .addFields(
            { name: 'Message', value: message },
            { name: 'Remind In', value: formatDuration(durationMs), inline: true },
            { name: 'At', value: `<t:${Math.floor(due / 1000)}:F>`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};
