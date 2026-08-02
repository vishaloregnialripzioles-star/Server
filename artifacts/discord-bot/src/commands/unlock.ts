import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, OverwriteType, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';

export const unlock: Command = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel so members can send messages again')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('reason').setDescription('Reason for unlock')),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply();

    const reason = interaction.options.getString('reason') ?? 'Channel unlocked';
    const channel = interaction.channel as TextChannel;

    try {
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: null }, // reset to default
        { reason: `Unlocked by ${interaction.user.tag}: ${reason}`, type: OverwriteType.Role },
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00CC44)
            .setTitle('🔓 Channel Unlocked')
            .addFields(
              { name: 'Channel', value: `<#${channel.id}>`, inline: true },
              { name: 'Moderator', value: interaction.user.tag, inline: true },
              { name: 'Reason', value: reason },
            )
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to unlock the channel.');
    }
  },
};
