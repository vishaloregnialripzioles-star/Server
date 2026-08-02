import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const nick: Command = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change or reset a member\'s nickname')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName('user').setDescription('User to rename').setRequired(true))
    .addStringOption(o =>
      o.setName('nickname')
        .setDescription('New nickname (leave blank to reset to username)'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const newNick = interaction.options.getString('nickname') ?? null;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }
    if (!member.manageable) {
      await interaction.editReply('❌ I cannot change this user\'s nickname (insufficient permissions).');
      return;
    }

    const oldNick = member.nickname ?? member.user.username;

    try {
      await member.setNickname(newNick, `Changed by ${interaction.user.tag}`);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✏️ Nickname Updated')
            .addFields(
              { name: 'User', value: `${target.tag}`, inline: true },
              { name: 'Before', value: oldNick, inline: true },
              { name: 'After', value: newNick ?? target.username, inline: true },
            )
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to change nickname.');
    }
  },
};
