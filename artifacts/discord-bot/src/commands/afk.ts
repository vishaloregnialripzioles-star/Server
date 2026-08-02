import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export const afk: Command = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status — the bot will notify others when you are mentioned')
    .addStringOption(o =>
      o.setName('reason')
        .setDescription('AFK reason (default: AFK)'),
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) return;

    const reason = interaction.options.getString('reason') ?? 'AFK';
    const userId = interaction.user.id;

    updateGuild(interaction.guild.id, data => {
      data.afk[userId] = { reason, timestamp: Date.now() };
    });

    // Add [AFK] prefix to nickname
    const member = interaction.guild.members.cache.get(userId);
    if (member && member.manageable) {
      const currentName = member.nickname ?? member.user.username;
      if (!currentName.startsWith('[AFK] ')) {
        await member.setNickname(`[AFK] ${currentName}`.slice(0, 32)).catch(() => undefined);
      }
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xAAAAAA)
          .setTitle('💤 AFK Status Set')
          .setDescription(`You are now AFK: **${reason}**\nI'll let people know when they mention you.`)
          .setTimestamp(),
      ],
    });
  },
};
