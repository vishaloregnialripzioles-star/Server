import { PermissionFlagsBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ComponentType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('clear-channels')
  .setDescription('Delete all channels and categories in this server (with confirmation).');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: '❌ You need **Manage Channels** permission.', ephemeral: true });
  }

  const confirm = new ButtonBuilder().setCustomId('clear_channels_confirm').setLabel('Yes, clear all').setStyle(ButtonStyle.Danger);
  const cancel = new ButtonBuilder().setCustomId('clear_channels_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel);

  const msg = await interaction.reply({
    content: '⚠️ **WARNING:** This will delete **all channels and categories** that the bot can delete in this server.\n\nOnly you can confirm this action. Continue?',
    components: [row],
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
  collector.on('collect', async button => {
    if (button.user.id !== interaction.user.id) {
      await button.reply({ content: '❌ Only the person who started this command can confirm it.', ephemeral: true });
      return;
    }
    if (button.customId === 'clear_channels_cancel') {
      collector.stop('cancelled');
      await button.update({ content: '✅ Cancelled. No channels were deleted.', components: [] });
      return;
    }

    collector.stop('confirmed');
    await button.update({ content: '🧹 Clearing channels and categories...', components: [] });

    const channels = [...interaction.guild.channels.cache.values()];
    let deleted = 0;
    for (const channel of channels) {
      try {
        await channel.delete('Clear all channels command');
        deleted++;
      } catch (error) {
        console.warn(`[ClearChannels] Could not delete ${channel.name} (${channel.id})`, error);
      }
    }

    try {
      await interaction.editReply({ content: `✅ **Clear complete.** Deleted ${deleted} channel(s)/category(ies).`, components: [] });
    } catch {}
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      try { await interaction.editReply({ content: '⌛ Confirmation expired. Nothing was deleted.', components: [] }); } catch {}
    }
  });
}
