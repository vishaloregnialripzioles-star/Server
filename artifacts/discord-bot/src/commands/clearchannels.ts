import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../types.js';

async function clearGuildChannels(guild: any, actorTag: string): Promise<{ deleted: number; failed: number }> {
  await guild.channels.fetch();
  const channels = [...guild.channels.cache.values()]
    .filter((channel: any) => channel && channel.type !== ChannelType.GuildDirectory)
    // Delete child channels first, then categories, so category deletion never blocks the cleanup.
    .sort((a: any, b: any) => {
      const ac = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bc = b.type === ChannelType.GuildCategory ? 1 : 0;
      return ac - bc;
    });

  let deleted = 0;
  let failed = 0;
  for (const channel of channels as any[]) {
    if (!channel.deletable) { failed++; continue; }
    try {
      await channel.delete(`Cleared by ${actorTag} using clear channels`);
      deleted++;
    } catch (error) {
      failed++;
      console.warn(`[ClearChannels] Could not delete ${channel.name} (${channel.id})`, error);
    }
  }
  return { deleted, failed };
}

async function runClearConfirmation(interaction: any): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('clear_channels_confirm').setLabel('Yes, clear all').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('clear_channels_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const message = await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('⚠️ Clear All Channels?')
      .setDescription('This will permanently delete **all channels and categories that the bot is allowed to delete**.\n\nPress **Yes, clear all** within 60 seconds to continue.')],
    components: [row],
    fetchReply: true,
  });

  try {
    const button = await interaction.awaitMessageComponent({
      time: 60_000,
      filter: (i: any) => i.isButton() && i.user.id === interaction.user.id && i.message.id === message.id,
    });

    if (button.customId === 'clear_channels_cancel') {
      await button.update({ content: '✅ Channel clearing cancelled.', embeds: [], components: [] });
      return;
    }

    const guild = interaction.guild;
    const me = guild?.members.me ?? await guild?.members.fetchMe().catch(() => null);
    if (!guild || !me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await button.update({ content: '❌ I no longer have the **Manage Channels** permission.', embeds: [], components: [] });
      return;
    }

    await button.update({ content: '⏳ Clearing all deletable channels and categories...', embeds: [], components: [] });
    const result = await clearGuildChannels(guild, interaction.user.tag);
    await interaction.editReply({
      content: `✅ **Channel clear complete.** Deleted **${result.deleted}** channel(s)/category(ies).${result.failed ? ` Could not delete **${result.failed}** protected/unavailable item(s).` : ''}`,
      embeds: [],
      components: [],
    });
  } catch {
    await interaction.editReply({ content: '⌛ Confirmation expired. Nothing was deleted.', embeds: [], components: [] }).catch(() => undefined);
  }
}

export const clearchannels: Command = {
  data: new SlashCommandBuilder()
    .setName('clearchannels')
    .setDescription('Delete all deletable channels and categories in this server'),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: '❌ You need **Manage Channels** permission to use this command.', ephemeral: true });
      return;
    }
    const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: '❌ I need the **Manage Channels** permission to do this.', ephemeral: true });
      return;
    }
    await runClearConfirmation(interaction);
  },
};
