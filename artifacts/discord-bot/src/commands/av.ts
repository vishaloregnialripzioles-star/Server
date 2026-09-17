import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const av: Command = {
  data: new SlashCommandBuilder()
    .setName('av')
    .setDescription("Show a user's avatar")
    .addUserOption(o => o.setName('user').setDescription('User whose avatar to show').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    const global = user.displayAvatarURL({ extension: 'png', size: 1024 });
    const server = member?.displayAvatarURL({ extension: 'png', size: 1024 });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ Avatar — ${user.tag}`).setImage(server ?? global).addFields({ name: 'Global Avatar', value: `[Open full size](${global})`, inline: true });
    if (server && server !== global) embed.addFields({ name: 'Server Avatar', value: `[Open full size](${server})`, inline: true });
    await interaction.reply({ embeds: [embed] });
  },
};
