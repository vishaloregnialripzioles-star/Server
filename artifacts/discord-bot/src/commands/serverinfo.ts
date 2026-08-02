import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../types.js';

export const serverinfo: Command = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show detailed information about this server'),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const guild = await interaction.guild.fetch();
    const owner = await guild.fetchOwner().catch(() => null);

    const totalChannels = guild.channels.cache.size;
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = guild.members.cache.filter(m => !m.user.bot).size;

    const boostLevel = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `${totalMembers} total (${humanCount} humans, ${botCount} bots)`, inline: false },
        { name: '📢 Channels', value: `${totalChannels} total • ${textChannels} text • ${voiceChannels} voice • ${categories} categories`, inline: false },
        { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🚀 Boost Level', value: `Level ${boostLevel} (${boostCount} boosts)`, inline: true },
        { name: '🌍 Region', value: guild.preferredLocale, inline: true },
        { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true },
      )
      .setTimestamp();

    if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }) ?? null);

    await interaction.editReply({ embeds: [embed] });
  },
};
