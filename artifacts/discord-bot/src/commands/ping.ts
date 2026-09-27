import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { DEFAULT_EMBED_COLOR } from '../embedDefaults.js';

export const ping: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Show Sparxie latency'),
  async execute(interaction) {
    const latency = interaction.client.ws.ping;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(DEFAULT_EMBED_COLOR).setTitle('🏓 Sparxie Pong!').setDescription('**WebSocket latency:** `' + (latency >= 0 ? latency + 'ms' : 'calculating') + '`').setFooter({ text: 'Sparxie • Health check' }).setTimestamp()] });
  },
};
