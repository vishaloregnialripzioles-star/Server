import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

function format(ms: number): string {
  let s = Math.floor(ms / 1000); const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export const uptime: Command = {
  data: new SlashCommandBuilder().setName('uptime').setDescription('Show how long Sparxie has been online'),
  async execute(interaction) {
    const ms = interaction.client.uptime ?? 0;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('⏱️ Sparxie Uptime').setDescription(`Online for **${format(ms)}**\nStarted <t:${Math.floor((Date.now() - ms) / 1000)}:R>.`).setFooter({ text: 'Sparxie • Health check' }).setTimestamp()] });
  },
};
