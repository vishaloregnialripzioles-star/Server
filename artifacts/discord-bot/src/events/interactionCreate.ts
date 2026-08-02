import {
  type Interaction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Command } from '../types.js';
import { createTicketForUser } from '../ticketUtils.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildSnipeEmbed, buildSnipeButtons } from '../snipeUtils.js';
import { buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  try {
  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const { commandName } = interaction;
    if (commandName === 'embed' || commandName === 'welcome') {
      const data    = loadGuild(interaction.guildId ?? '');
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = Object.keys(data.savedEmbeds ?? {})
        .filter(n => n.includes(focused))
        .slice(0, 25)
        .map(n => ({ name: n, value: n }));
      await interaction.respond(choices).catch(() => undefined);
    }
    return;
  }

  // ── Slash commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const commands = (interaction.client as typeof interaction.client & { commands: Map<string, Command> }).commands;
    const command = commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({ content: '❌ Unknown command.', flags: 64 });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error in command ${interaction.commandName}:`, err);
      const payload = { content: '❌ An error occurred while running this command.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
    return;
  }

  // ── Snipe / Editsnipe button navigation ─────────────────────────────────────
  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId.startsWith('snipe_nav:') || customId.startsWith('editsnipe_nav:')) {
      if (!interaction.guild) return;
      const isEdit = customId.startsWith('editsnipe_nav:');
      const parts = customId.split(':');
      // format: snipe_nav:CHANNEL_ID:INDEX  (channel ID may contain colons if snowflake, but snowflakes don't have colons)
      const channelId = parts[1];
      const index = parseInt(parts[2], 10);

      if (isNaN(index) || index < 0) return;

      const data = loadGuild(interaction.guild.id);
      const messages = isEdit
        ? data.lastEdited[channelId]
        : data.lastDeleted[channelId];

      if (!messages || messages.length === 0) {
        await interaction.reply({ content: '❌ No messages to navigate.', flags: 64 });
        return;
      }

      const clampedIndex = Math.max(0, Math.min(index, messages.length - 1));
      const embed = buildSnipeEmbed(messages, clampedIndex, isEdit ? 'edit' : 'delete');
      const row = buildSnipeButtons(channelId, clampedIndex, messages.length, isEdit ? 'editsnipe' : 'snipe');

      await interaction.update({
        embeds: [embed],
        components: messages.length > 1 ? [row] : [],
      });
      return;
    }

    // ── Giveaway enter button ────────────────────────────────────────────────
    if (customId.startsWith('giveaway_enter:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('giveaway_enter:'.length);

      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);

      // Sync checks first (before deferring) — fast, no API calls
      if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
        await interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });
        return;
      }
      if (giveaway.entries.includes(interaction.user.id)) {
        await interaction.reply({ content: '✅ You have already entered this giveaway!', flags: 64 });
        return;
      }

      // Defer early so Discord doesn't timeout while we fetch the member
      await interaction.deferUpdate();

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.followUp({ content: '❌ Could not verify your membership.', ephemeral: true });
        return;
      }

      // Blacklist check
      if (giveaway.blacklistRoleId && member.roles.cache.has(giveaway.blacklistRoleId)) {
        await interaction.followUp({ content: '❌ You are not allowed to enter this giveaway.', ephemeral: true });
        return;
      }

      // Required role check
      if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
        await interaction.followUp({
          content: `❌ You need the <@&${giveaway.requiredRoleId}> role to enter this giveaway.`,
          ephemeral: true,
        });
        return;
      }

      // Add entry
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g && !g.entries.includes(interaction.user.id)) {
          g.entries.push(interaction.user.id);
        }
      });

      // Update the panel embed with new entry count
      const updatedData = loadGuild(interaction.guild.id);
      const updatedGiveaway = updatedData.giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        const updatedEmbed = buildGiveawayEmbed(updatedGiveaway);
        const row = buildGiveawayRow(giveawayId, updatedGiveaway.entries.length);
        await interaction.editReply({ embeds: [updatedEmbed], components: [row] }).catch(() => undefined);
      }
      return;
    }

    // ── Giveaway leave button ────────────────────────────────────────────────
    if (customId.startsWith('giveaway_leave:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('giveaway_leave:'.length);
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);

      // Sync checks first
      if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
        await interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });
        return;
      }
      if (!giveaway.entries.includes(interaction.user.id)) {
        await interaction.reply({ content: "❌ You haven't entered this giveaway.", flags: 64 });
        return;
      }

      // Defer early
      await interaction.deferUpdate();

      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== interaction.user.id);
      });

      const updatedData = loadGuild(interaction.guild.id);
      const updatedGiveaway = updatedData.giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        const updatedEmbed = buildGiveawayEmbed(updatedGiveaway);
        const row = buildGiveawayRow(giveawayId, updatedGiveaway.entries.length);
        await interaction.editReply({ embeds: [updatedEmbed], components: [row] }).catch(() => undefined);
      }
      return;
    }

    // ── Giveaway participants button ─────────────────────────────────────────
    if (customId.startsWith('giveaway_participants:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('giveaway_participants:'.length);
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);

      if (!giveaway) {
        await interaction.reply({ content: '❌ Giveaway not found.', flags: 64 });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const entries = giveaway.entries;
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;

      const participantList =
        entries.length === 0
          ? '*No participants yet.*'
          : entries
              .slice(0, 50)
              .map((id, i) => `${i + 1}. <@${id}>`)
              .join('\n') + (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 Participants — ${giveaway.name}`)
        .setDescription(participantList)
        .setFooter({ text: `Total: ${entries.length} participant(s) • ID: ${giveawayId}` });

      if (isAdmin && entries.length > 0) {
        // Fetch display names for the select menu (up to 25)
        const selectIds = entries.slice(0, 25);
        const memberMap = new Map<string, string>();
        try {
          const fetched = await interaction.guild.members.fetch({ user: selectIds });
          for (const [id, m] of fetched) memberMap.set(id, m.displayName);
        } catch { /* fall back to IDs */ }

        const options = selectIds.map(id => ({
          label: (memberMap.get(id) ?? `User ${id}`).slice(0, 100),
          value: id,
        }));

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`giveaway_remove_select:${giveawayId}`)
            .setPlaceholder('🔨 Select a participant to remove (Admin only)')
            .addOptions(options),
        );

        await interaction.editReply({ embeds: [embed], components: [selectRow] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
      return;
    }

    // ── Ticket panel button → show modal ──────────────────────────────────────
    if (customId === 'ticket_open') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('Open a Support Ticket')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_reason')
              .setLabel('What do you need help with?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(500)
              .setPlaceholder('Describe your issue or question...'),
          ),
        );

      await interaction.showModal(modal);
      return;
    }
  }

  // ── Giveaway remove participant (admin select menu) ────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('giveaway_remove_select:')) {
    if (!interaction.guild) return;
    const giveawayId = interaction.customId.slice('giveaway_remove_select:'.length);

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Server** permission to remove participants.', flags: 64 });
      return;
    }

    const targetUserId = interaction.values[0];
    if (!targetUserId) return;

    updateGuild(interaction.guild.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g) g.entries = g.entries.filter(id => id !== targetUserId);
    });

    // Update the live giveaway panel message
    const updatedData = loadGuild(interaction.guild.id);
    const updatedGiveaway = updatedData.giveaways.find(g => g.id === giveawayId);
    if (updatedGiveaway) {
      try {
        const ch = await interaction.guild.channels.fetch(updatedGiveaway.channelId);
        if (ch?.isTextBased()) {
          const panelMsg = await (ch as BaseGuildTextChannel).messages
            .fetch(updatedGiveaway.messageId)
            .catch(() => null);
          if (panelMsg) {
            const updatedEmbed = buildGiveawayEmbed(updatedGiveaway);
            const row = buildGiveawayRow(giveawayId, updatedGiveaway.entries.length);
            await panelMsg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => undefined);
          }
        }
      } catch { /* channel inaccessible */ }
    }

    await interaction.reply({
      content: `✅ Removed <@${targetUserId}> from the giveaway.`,
      flags: 64,
    });
    return;
  }

  // ── Ticket modal submission → create channel ────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
    if (!interaction.guild) return;
    await interaction.deferReply({ flags: 64 });

    const reason = interaction.fields.getTextInputValue('ticket_reason');
    const result = await createTicketForUser(
      interaction.guild,
      interaction.user,
      interaction.client,
      reason,
    );

    if (result.success) {
      await interaction.editReply(`✅ Your ticket has been created: <#${result.channel.id}>`);
    } else {
      await interaction.editReply(`❌ ${result.message}`);
    }
  }
  } catch (err) {
    console.error('[interactionCreate] Unhandled error:', err);
    try {
      const repliable = interaction.isChatInputCommand() || interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu();
      if (repliable) {
        const i = interaction as { replied?: boolean; deferred?: boolean; reply: Function; followUp: Function };
        const payload = { content: '❌ Something went wrong. Please try again.', flags: 64 };
        if (i.replied || i.deferred) {
          await i.followUp(payload);
        } else {
          await i.reply(payload);
        }
      }
    } catch { /* interaction already expired */ }
  }
}
