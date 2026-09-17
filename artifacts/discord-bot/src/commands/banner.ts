import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const banner: Command = {
  data: new SlashCommandBuilder().setName('banner').setDescription("Show a user's Discord banner").addUserOption(o => o.setName('user').setDescription('User whose banner to show').setRequired(false)),
  async execute(interaction) {
    const user = await (interaction.options.getUser('user') ?? interaction.user).fetch();
    const banner = user.bannerURL({ extension: 'png', size: 1024 });
    if (!banner) { await interaction.reply({ content: `ℹ️ **${user.tag}** does not have a Discord banner.`, ephemeral: true }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ Banner — ${user.tag}`).setImage(banner).setFooter({ text: 'Sparxie • Profile' }).setTimestamp()] });
  },
};
