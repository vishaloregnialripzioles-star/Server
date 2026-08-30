import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, type TextChannel } from 'discord.js';
import type { Command } from '../types.js';

export const lock: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so members cannot send messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('reason').setDescription('Reason for lock').setMaxLength(1000)),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) return;
    await interaction.deferReply();

    const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';
    const channel = interaction.channel as TextChannel;

    try {
      if (!('permissionOverwrites' in channel)) {
        await interaction.editReply('❌ This channel cannot be locked.');
        return;
      }

      const everyone = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, {
        reason: `Locked by ${interaction.user.tag}: ${reason}`,
      });

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setAuthor({ name: `${interaction.guild.name} • Moderation`, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTitle('🔒 Channel Locked')
        .setDescription('**This channel has been locked.**\n\nMembers can no longer send messages here until the channel is unlocked.')
        .addFields(
          { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
          { name: '🛡️ Locked by', value: `${interaction.user}`, inline: true },
          { name: '📝 Reason', value: reason.slice(0, 1024), inline: false },
        )
        .setFooter({ text: 'Use /unlock when you are ready to reopen this channel.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[lock] Failed to lock channel:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('⚠️ Could Not Lock Channel')
            .setDescription('I could not change the channel permissions. Make sure my role is high enough and I have **Manage Channels** permission.')
            .setTimestamp(),
        ],
      });
    }
  },
};
