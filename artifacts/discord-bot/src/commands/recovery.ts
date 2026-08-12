import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isOwnerOrExtraOwner } from '../security.js';
import { createRecoveryBackup, restoreRecoveryBackup } from '../recovery.js';

export const recovery: Command = {
  data: new SlashCommandBuilder()
    .setName('recovery')
    .setDescription('Save and restore the server structure')
    .addSubcommand(sub => sub
      .setName('save')
      .setDescription('Save the current server roles, channels, permissions and settings'))
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Choose a saved recovery and restore it'))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show saved recovery points')),

  async execute(interaction) {
    if (!interaction.guild) return;

    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;

    if (sub === 'save') {
      if (!isServerOwner && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '❌ You need the **Administrator** permission to create a recovery save.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const backup = await createRecoveryBackup(interaction.guild);
        updateGuild(guildId, data => {
          data.recoveryBackups = [backup, ...(data.recoveryBackups ?? [])].slice(0, 25);
        });

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('💾 Recovery Saved')
          .setDescription('A recovery point for this server has been saved successfully.')
          .addFields(
            { name: 'Recovery ID', value: `\`${backup.id}\``, inline: true },
            { name: 'Roles', value: String(backup.roles.length), inline: true },
            { name: 'Channels', value: String(backup.channels.length), inline: true },
            { name: 'Custom Emojis', value: String(backup.emojis.length), inline: true },
          )
          .setFooter({ text: 'Use /recovery start to choose this save later.' })
          .setTimestamp(backup.createdAt);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply({ content: `❌ Could not create recovery save: ${error instanceof Error ? error.message : 'unknown error'}` });
      }
      return;
    }

    // Recovery start is owner-only. Extra owners/admins cannot restore the server.
    if (sub === 'start' && !isServerOwner) {
      await interaction.reply({ content: '🔒 **Recovery start is owner-only.** Only the actual server owner can restore a recovery save.', ephemeral: true });
      return;
    }

    if (sub === 'list' && !isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the server owner or an extra owner can view recovery saves.', ephemeral: true });
      return;
    }

    const backups = [...(loadGuild(guildId).recoveryBackups ?? [])].sort((a, b) => b.createdAt - a.createdAt);
    if (sub === 'list') {
      if (!backups.length) {
        await interaction.reply({ content: '📭 No recovery saves exist yet. Use `/recovery save` first.', ephemeral: true });
        return;
      }
      const lines = backups.slice(0, 25).map((backup, index) =>
        `**${index + 1}.** ${backup.name}\n> \`${backup.id}\` • ${backup.roles.length} roles • ${backup.channels.length} channels • <t:${Math.floor(backup.createdAt / 1000)}:R>`
      );
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('💾 Recovery Saves').setDescription(lines.join('\n\n'))],
        ephemeral: true,
      });
      return;
    }

    if (!backups.length) {
      await interaction.reply({ content: '📭 No recovery saves exist yet. Use `/recovery save` first.', ephemeral: true });
      return;
    }

    const options = backups.slice(0, 25).map((backup, index) => new StringSelectMenuOptionBuilder()
      .setLabel(`Recovery ${index + 1} • ${new Date(backup.createdAt).toLocaleDateString('en-IN')}`.slice(0, 100))
      .setDescription(`${backup.roles.length} roles • ${backup.channels.length} channels • ${backup.emojis.length} emojis`.slice(0, 100))
      .setValue(backup.id));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`recovery_select:${interaction.user.id}`)
      .setPlaceholder('Select a recovery save')
      .addOptions(options);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('💾 Recovery Setup')
      .setDescription('Choose the saved recovery point you want to restore.\n\n⚠️ **Recovery deletes the current server channels and rebuilds the saved structure.**');

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    try {
      // ChatInputCommandInteraction has no awaitMessageComponent() method.
      // Collect from the actual reply Message instead.
      const replyMessage = await interaction.fetchReply();
      const selection = await replyMessage.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: component => component.user.id === interaction.user.id && component.customId === `recovery_select:${interaction.user.id}`,
        time: 60_000,
      });

      const backupId = selection.values[0] as string;
      const backup = backups.find(item => item.id === backupId);
      if (!backup) {
        await selection.update({ content: '❌ That recovery save no longer exists.', embeds: [], components: [] });
        return;
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⚠️ Confirm Server Recovery')
        .setDescription(`You selected **${backup.name}**.\n\nThis will **delete the current channels** and recreate the saved roles, channels, permissions and settings. This action cannot be automatically undone unless you have another recovery save.`)
        .addFields(
          { name: 'Roles', value: String(backup.roles.length), inline: true },
          { name: 'Channels', value: String(backup.channels.length), inline: true },
          { name: 'Emojis', value: String(backup.emojis.length), inline: true },
        );
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`recovery_confirm:${interaction.user.id}:${backup.id}`).setLabel('Start Recovery').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`recovery_cancel:${interaction.user.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await selection.update({ embeds: [confirmEmbed], components: [confirmRow] });

      const confirmation = await selection.message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: component => component.user.id === interaction.user.id,
        time: 30_000,
      });

      if (confirmation.customId === `recovery_cancel:${interaction.user.id}`) {
        await confirmation.update({ content: '❌ Recovery cancelled. Nothing was changed.', embeds: [], components: [] });
        return;
      }

      if (confirmation.customId !== `recovery_confirm:${interaction.user.id}:${backup.id}`) return;

      // Acknowledge before deleting the command channel.
      await confirmation.update({
        embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🔄 Recovery Started').setDescription('The server structure is being rebuilt from the selected save. Please do not make changes until it finishes.')],
        components: [],
      });

      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels) || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.followUp({ content: '❌ I need **Manage Channels** and **Manage Roles** to start recovery.', ephemeral: true }).catch(() => undefined);
        return;
      }

      const result = await restoreRecoveryBackup(interaction.guild, backup);
      const skipped = result.skipped.length ? `\n\n⚠️ Skipped: ${result.skipped.slice(0, 10).join('; ')}${result.skipped.length > 10 ? ` and ${result.skipped.length - 10} more.` : ''}` : '';
      await interaction.followUp({
        content: `✅ **Recovery completed.** Restored ${result.roles} roles, ${result.channels} channels and ${result.emojis} emojis.${skipped}`,
        ephemeral: true,
      }).catch(() => undefined);
    } catch (error) {
      if ((error as any)?.code === 'InteractionCollectorError' || error instanceof Error && /time/i.test(error.message)) {
        await interaction.editReply({ content: '⌛ Recovery selection timed out. Nothing was changed.', embeds: [], components: [] }).catch(() => undefined);
      } else {
        console.error('[recovery]', error);
        await interaction.editReply({ content: `❌ Recovery failed: ${error instanceof Error ? error.message : 'unknown error'}`, embeds: [], components: [] }).catch(() => undefined);
      }
    }
  },
};
