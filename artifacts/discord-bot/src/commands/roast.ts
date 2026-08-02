import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { ROASTS } from '../roasts.js';

export const roast: Command = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Roast a user with a savage line')
    .addUserOption(o =>
      o.setName('user')
        .setDescription('User to roast (defaults to yourself)')
        .setRequired(false),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const roastLine = ROASTS[Math.floor(Math.random() * ROASTS.length)];

    const embed = new EmbedBuilder()
      .setColor(0xFF4500)
      .setTitle('🔥 Roasted!')
      .setDescription(`<@${target.id}>, ${roastLine}`)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
