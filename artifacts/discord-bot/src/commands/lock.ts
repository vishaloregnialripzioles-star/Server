import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, OverwriteType, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';

export const lock: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so members cannot send messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('reason').setDescription('Reason for lock')),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply();

    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const channel = interaction.channel as TextChannel;

    try {
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: false },
        { reason: `Locked by ${interaction.user.tag}: ${reason}`, type: OverwriteType.Role },
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF3333)
            .setTitle('🔒 Channel Locked')
            .addFields(
              { name: 'Channel', value: `<#${channel.id}>`, inline: true },
              { name: 'Moderator', value: interaction.user.tag, inline: true },
              { name: 'Reason', value: reason },
            )
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to lock the channel.');
    }
  },
};
