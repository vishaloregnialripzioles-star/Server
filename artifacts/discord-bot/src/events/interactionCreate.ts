import {
  type Interaction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Command, Giveaway } from '../types.js';
import { createTicketForUser } from '../ticketUtils.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildSnipeEmbed, buildSnipeButtons } from '../snipeUtils.js';
import {
  buildGiveawayEmbed,
  buildGiveawayRow,
  buildGiveawayEndedEmbed,
  buildAdminPanelEmbed,
  buildAdminPanelRows,
  endGiveaway,
  pickWinners,
} from '../giveawayUtils.js';
import { pendingGiveaways, buildConfigEmbed, buildConfigRows } from '../giveawaySetup.js';
import type { PendingGiveaway } from '../giveawaySetup.js';
import { parseDuration, generateId } from '../utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIdFromMention(raw: string): string {
  // Handles <@!id>, <@id>, <@&id>, <#id>, or bare snowflake
  return raw.trim().replace(/^<[@#!&]+/, '').replace(/>$/, '').trim();
}

function makeModal(customId: string, title: string, ...inputs: TextInputBuilder[]): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const input of inputs) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

function text(id: string, label: string, placeholder?: string, required = false, style = TextInputStyle.Short, value?: string): TextInputBuilder {
  const t = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
  if (placeholder) t.setPlaceholder(placeholder);
  if (value !== undefined) t.setValue(value);
  return t;
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const { customId } = interaction;

    // ── Snipe navigation ─────────────────────────────────────────────────────
    if (customId.startsWith('snipe_nav:') || customId.startsWith('editsnipe_nav:')) {
      if (!interaction.guild) return;
      const isEdit = customId.startsWith('editsnipe_nav:');
      const parts = customId.split(':');
      const channelId = parts[1];
      const index = parseInt(parts[2], 10);
      if (isNaN(index) || index < 0) return;
      const data = loadGuild(interaction.guild.id);
      const messages = isEdit ? data.lastEdited[channelId] : data.lastDeleted[channelId];
      if (!messages || messages.length === 0) {
        await interaction.reply({ content: '❌ No messages to navigate.', flags: 64 });
        return;
      }
      const clampedIndex = Math.max(0, Math.min(index, messages.length - 1));
      const embed = buildSnipeEmbed(messages, clampedIndex, isEdit ? 'edit' : 'delete');
      const row = buildSnipeButtons(channelId, clampedIndex, messages.length, isEdit ? 'editsnipe' : 'snipe');
      await interaction.update({ embeds: [embed], components: messages.length > 1 ? [row] : [] });
      return;
    }

    // ── Giveaway enter ───────────────────────────────────────────────────────
    if (customId.startsWith('giveaway_enter:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('giveaway_enter:'.length);
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);

      if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
        await interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });
        return;
      }
      if (giveaway.entries.includes(interaction.user.id)) {
        await interaction.reply({ content: '✅ You have already entered this giveaway!', flags: 64 });
        return;
      }

      await interaction.deferUpdate();

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.followUp({ content: '❌ Could not verify your membership.', ephemeral: true });
        return;
      }
      if (giveaway.blacklistRoleId && member.roles.cache.has(giveaway.blacklistRoleId)) {
        await interaction.followUp({ content: '❌ You are not allowed to enter this giveaway.', ephemeral: true });
        return;
      }
      if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
        await interaction.followUp({
          content: `❌ You need the <@&${giveaway.requiredRoleId}> role to enter.`,
          ephemeral: true,
        });
        return;
      }

      // Drop giveaway: first click wins immediately
      if (giveaway.type === 'drop') {
        updateGuild(interaction.guild.id, d => {
          const g = d.giveaways.find(g => g.id === giveawayId);
          if (g && !g.ended) {
            g.entries.push(interaction.user.id);
            g.ended = true;
            g.winnerIds = [interaction.user.id];
            g.winnerId = interaction.user.id;
          }
        });
        const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId)!;
        const endedEmbed = buildGiveawayEndedEmbed(updated);
        await interaction.editReply({ embeds: [endedEmbed], components: [] }).catch(() => undefined);
        await interaction.followUp({
          content: `⚡ Drop Giveaway over! <@${interaction.user.id}> was the first to click and wins **${giveaway.prize}**! 🎉`,
          allowedMentions: { users: [interaction.user.id] },
        });
        return;
      }

      // Standard / Lottery: add entry
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g && !g.entries.includes(interaction.user.id)) g.entries.push(interaction.user.id);
      });

      const updatedData = loadGuild(interaction.guild.id);
      const updatedGiveaway = updatedData.giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        await interaction.editReply({
          embeds: [buildGiveawayEmbed(updatedGiveaway)],
          components: [buildGiveawayRow(giveawayId, updatedGiveaway.entries.length, updatedGiveaway.hideEntryCount)],
        }).catch(() => undefined);
      }

      // Ephemeral success message with a leave button
      await interaction.followUp({
        content: '✅ Successfully joined the giveaway! 🎉',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`giveaway_leave:${giveawayId}`)
              .setLabel('Leave Giveaway')
              .setStyle(ButtonStyle.Danger),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // ── Giveaway leave ───────────────────────────────────────────────────────
    if (customId.startsWith('giveaway_leave:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('giveaway_leave:'.length);
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);
      if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
        await interaction.reply({ content: '❌ This giveaway has already ended.', flags: 64 });
        return;
      }
      if (!giveaway.entries.includes(interaction.user.id)) {
        await interaction.reply({ content: "❌ You haven't entered this giveaway.", flags: 64 });
        return;
      }

      // Defer update of whatever message holds this button (ephemeral or giveaway panel)
      await interaction.deferUpdate();

      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== interaction.user.id);
      });

      // Directly edit the giveaway panel message (works regardless of where button is)
      const updatedGiveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        try {
          const ch = await interaction.guild.channels.fetch(updatedGiveaway.channelId);
          if (ch?.isTextBased()) {
            const panelMsg = await (ch as BaseGuildTextChannel).messages
              .fetch(updatedGiveaway.messageId).catch(() => null);
            if (panelMsg) {
              await panelMsg.edit({
                embeds: [buildGiveawayEmbed(updatedGiveaway)],
                components: [buildGiveawayRow(giveawayId, updatedGiveaway.entries.length, updatedGiveaway.hideEntryCount)],
              }).catch(() => undefined);
            }
          }
        } catch { /* channel inaccessible */ }
      }

      // Update the button's own message (ephemeral success → "left" confirmation)
      await interaction.editReply({
        content: '👋 You have left the giveaway.',
        components: [],
      }).catch(() => undefined);
      return;
    }

    // ── Giveaway participants ────────────────────────────────────────────────
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
      const list = entries.length === 0
        ? '*No participants yet.*'
        : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') +
          (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 Participants — ${giveaway.prize}`)
        .setDescription(list)
        .setFooter({ text: `Total: ${entries.length} • ID: ${giveawayId}` });
      if (isAdmin && entries.length > 0) {
        const selectIds = entries.slice(0, 25);
        const memberMap = new Map<string, string>();
        try {
          const fetched = await interaction.guild.members.fetch({ user: selectIds });
          for (const [id, m] of fetched) memberMap.set(id, m.displayName);
        } catch { /* fall back */ }
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

    // ── Ticket panel button ──────────────────────────────────────────────────
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

    // ── Giveaway config panel buttons (gwcfg_*) ──────────────────────────────
    if (customId.startsWith('gwcfg_')) {
      if (!interaction.guild) return;
      const colonIdx = customId.indexOf(':');
      const action = customId.slice('gwcfg_'.length, colonIdx);
      const userId = customId.slice(colonIdx + 1);

      // Permission: only the host can control their own config panel
      if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ This is not your giveaway setup panel.', flags: 64 });
        return;
      }

      const pending = pendingGiveaways.get(userId);
      if (!pending) {
        await interaction.reply({ content: '❌ Setup session expired. Run `/giveaway create` again.', flags: 64 });
        return;
      }

      // ── Done ──────────────────────────────────────────────────────────────
      if (action === 'done') {
        if (!pending.channelId) {
          await interaction.update({
            embeds: [buildConfigEmbed(pending).setColor(0xED4245).setFooter({ text: '❌ Please set a Channel before finishing.' })],
            components: buildConfigRows(userId),
          });
          return;
        }
        const durationMs = parseDuration(pending.durationStr);
        if (!durationMs || durationMs < 10_000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
          await interaction.update({
            embeds: [buildConfigEmbed(pending).setColor(0xED4245).setFooter({ text: '❌ Invalid duration. Use formats like 30m, 1h, 2d (min 10s, max 30d).' })],
            components: buildConfigRows(userId),
          });
          return;
        }

        const endsAt = Date.now() + durationMs;
        const giveawayId = generateId();

        const newGiveaway: Giveaway = {
          id: giveawayId,
          guildId: interaction.guild.id,
          channelId: pending.channelId,
          messageId: '',
          name: pending.prize,
          prize: pending.prize,
          endsAt,
          hostId: pending.hostId,
          donorId: pending.donorId,
          winnerCount: pending.winnerCount,
          type: pending.type,
          pingRoleId: pending.pingRoleId,
          customMessage: pending.customMessage,
          hideEntryCount: pending.hideEntryCount,
          durationStr: pending.durationStr,
          entries: [],
          requiredRoleId: pending.requiredRoleId,
          blacklistRoleId: pending.blacklistRoleId,
          extraEntryRoles: pending.extraEntryRoles.length > 0 ? pending.extraEntryRoles : undefined,
          imageUrl: pending.imageUrl,
          ended: false,
        };

        const targetCh = interaction.guild.channels.cache.get(pending.channelId);
        if (!targetCh?.isTextBased()) {
          await interaction.update({
            embeds: [buildConfigEmbed(pending).setColor(0xED4245).setFooter({ text: '❌ Could not find the selected channel.' })],
            components: buildConfigRows(userId),
          });
          return;
        }

        let pingContent = '🎉 GIVEAWAY 🎉';
        if (pending.pingRoleId === 'everyone') pingContent = '@everyone\n🎉 GIVEAWAY 🎉';
        else if (pending.pingRoleId) pingContent = `<@&${pending.pingRoleId}>\n🎉 GIVEAWAY 🎉`;

        try {
          const sent = await (targetCh as BaseGuildTextChannel).send({
            content: pingContent,
            embeds: [buildGiveawayEmbed(newGiveaway)],
            components: [buildGiveawayRow(giveawayId, 0, pending.hideEntryCount)],
            allowedMentions: pending.pingRoleId === 'everyone'
              ? { parse: ['everyone'] }
              : pending.pingRoleId
                ? { roles: [pending.pingRoleId] }
                : { parse: [] },
          });

          newGiveaway.messageId = sent.id;
          updateGuild(interaction.guild.id, data => { data.giveaways.push(newGiveaway); });
          pendingGiveaways.delete(userId);

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Giveaway Started!')
                .setDescription(`**${pending.prize}** is now live in <#${pending.channelId}>!\n\nID: \`${giveawayId}\``)
                .setFooter({ text: 'Use /giveaway end to end early • /giveaway reroll to reroll' }),
            ],
            components: [],
          });
        } catch {
          await interaction.update({
            embeds: [buildConfigEmbed(pending).setColor(0xED4245).setFooter({ text: '❌ Failed to post. Check I have Send Messages & Embed Links in that channel.' })],
            components: buildConfigRows(userId),
          });
        }
        return;
      }

      // ── Hide Entry Count (toggle — no modal) ────────────────────────────────
      if (action === 'hide') {
        pending.hideEntryCount = !pending.hideEntryCount;
        await interaction.update({ embeds: [buildConfigEmbed(pending)], components: buildConfigRows(userId) });
        return;
      }

      // ── All other buttons show a modal ───────────────────────────────────
      let modal: ModalBuilder;

      switch (action) {
        case 'limiters':
          modal = makeModal(`gwmod_limiters:${userId}`, 'Limiters & Requirements',
            text('required_role', 'Required Role ID or mention', '<@&roleId> or bare ID', false, TextInputStyle.Short, pending.requiredRoleId ?? ''),
            text('blacklist_role', 'Blacklisted Role ID or mention', '<@&roleId> or bare ID', false, TextInputStyle.Short, pending.blacklistRoleId ?? ''),
          );
          break;

        case 'multipliers':
          modal = makeModal(`gwmod_multipliers:${userId}`, 'Bonus Entry Roles (Multipliers)',
            text('role1_id', 'Role 1 — ID or mention', '<@&roleId> or bare ID', false, TextInputStyle.Short,
              pending.extraEntryRoles[0] ? `<@&${pending.extraEntryRoles[0].roleId}>` : ''),
            text('role1_entries', 'Role 1 — Bonus entries (e.g. 2)', 'e.g. 2', false, TextInputStyle.Short,
              pending.extraEntryRoles[0] ? String(pending.extraEntryRoles[0].entries) : ''),
            text('role2_id', 'Role 2 — ID or mention (optional)', '<@&roleId> or bare ID', false, TextInputStyle.Short,
              pending.extraEntryRoles[1] ? `<@&${pending.extraEntryRoles[1].roleId}>` : ''),
            text('role2_entries', 'Role 2 — Bonus entries (e.g. 2)', 'e.g. 2', false, TextInputStyle.Short,
              pending.extraEntryRoles[1] ? String(pending.extraEntryRoles[1].entries) : ''),
          );
          break;

        case 'prize':
          modal = makeModal(`gwmod_prize:${userId}`, 'Change Prize',
            text('prize', 'Giveaway Prize', 'What are you giving away?', true, TextInputStyle.Short, pending.prize),
          );
          break;

        case 'winners':
          modal = makeModal(`gwmod_winners:${userId}`, 'Number of Winners',
            text('count', 'Winner count (1–20)', 'e.g. 1', true, TextInputStyle.Short, String(pending.winnerCount)),
          );
          break;

        case 'donor':
          modal = makeModal(`gwmod_donor:${userId}`, 'Set Donor',
            text('donor', 'Donor User ID or mention', '@user or user ID', false, TextInputStyle.Short, pending.donorId ?? ''),
          );
          break;

        case 'message':
          modal = makeModal(`gwmod_message:${userId}`, 'Custom Message',
            text('msg', 'Message shown on the giveaway', 'Enter a custom message...', false, TextInputStyle.Paragraph, pending.customMessage ?? ''),
          );
          break;

        case 'pingrole':
          modal = makeModal(`gwmod_pingrole:${userId}`, 'Ping Role',
            text('role', 'Type "everyone" or paste a Role ID', '@everyone or role ID', false, TextInputStyle.Short, pending.pingRoleId ?? ''),
          );
          break;

        case 'channel':
          modal = makeModal(`gwmod_channel:${userId}`, 'Giveaway Channel',
            text('channel', 'Channel ID or #mention', '<#channelId> or bare ID', true, TextInputStyle.Short, pending.channelId ?? ''),
          );
          break;

        case 'image':
          modal = makeModal(`gwmod_image:${userId}`, 'Giveaway Image',
            text('url', 'Image URL (must be a direct image link)', 'https://...', false, TextInputStyle.Short, pending.imageUrl ?? ''),
          );
          break;

        case 'duration':
          modal = makeModal(`gwmod_duration:${userId}`, 'Change Duration',
            text('duration', 'Duration (e.g. 30m, 1h, 2d)', 'How long will your giveaway be?', true, TextInputStyle.Short, pending.durationStr),
          );
          break;

        default:
          return;
      }

      await interaction.showModal(modal);
      return;
    }

    // ── Admin panel: End Giveaway ────────────────────────────────────────────
    if (customId.startsWith('gwadmin_end:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('gwadmin_end:'.length);
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      await interaction.deferUpdate();
      const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (!giveaway || giveaway.ended) {
        await interaction.editReply({ content: '❌ Giveaway already ended or not found.', embeds: [], components: [] });
        return;
      }
      await endGiveaway(interaction.guild, giveaway);
      const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId) ?? { ...giveaway, ended: true };
      await interaction.editReply({
        embeds: [buildAdminPanelEmbed(updated as typeof giveaway)],
        components: buildAdminPanelRows(giveawayId, true),
      }).catch(() => undefined);
      return;
    }

    // ── Admin panel: Edit Giveaway ───────────────────────────────────────────
    if (customId.startsWith('gwadmin_edit:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('gwadmin_edit:'.length);
      const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.reply({ content: '❌ Giveaway not found.', flags: 64 });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`gwadmin_modal_edit:${giveawayId}`)
        .setTitle('Edit Giveaway')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('prize').setLabel('Prize').setStyle(TextInputStyle.Short)
              .setRequired(true).setValue(giveaway.prize),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('winners').setLabel('Number of Winners').setStyle(TextInputStyle.Short)
              .setRequired(true).setValue(String(giveaway.winnerCount ?? 1)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('extend').setLabel('Extend By (e.g. 30m, 2h, 1d — blank to skip)')
              .setStyle(TextInputStyle.Short).setRequired(false)
              .setPlaceholder('Leave blank to keep current end time'),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    // ── Admin panel: View / Remove Participants ──────────────────────────────
    if (customId.startsWith('gwadmin_participants:')) {
      if (!interaction.guild) return;
      const giveawayId = customId.slice('gwadmin_participants:'.length);
      const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.reply({ content: '❌ Giveaway not found.', flags: 64 });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const entries = giveaway.entries;
      const list = entries.length === 0
        ? '*No participants yet.*'
        : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') +
          (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 Participants — ${giveaway.prize}`)
        .setDescription(list)
        .setFooter({ text: `Total: ${entries.length} • ID: ${giveawayId}` });
      const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
      if (entries.length > 0) {
        const selectIds = entries.slice(0, 25);
        const memberMap = new Map<string, string>();
        try {
          const fetched = await interaction.guild.members.fetch({ user: selectIds });
          for (const [id, m] of fetched) memberMap.set(id, m.displayName);
        } catch { /* fall back to IDs */ }
        components.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`gwadmin_remove_select:${giveawayId}`)
              .setPlaceholder('🔨 Select a participant to remove')
              .addOptions(selectIds.map(id => ({
                label: (memberMap.get(id) ?? `User ${id}`).slice(0, 100),
                value: id,
              }))),
          ),
        );
      }
      await interaction.editReply({ embeds: [embed], components });
      return;
    }
  }

  // ── String select menus ──────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {

    // ── Admin panel: Remove participant (select menu) ────────────────────────
    if (interaction.customId.startsWith('gwadmin_remove_select:')) {
      if (!interaction.guild) return;
      const giveawayId = interaction.customId.slice('gwadmin_remove_select:'.length);
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      const targetUserId = interaction.values[0];
      if (!targetUserId) return;
      await interaction.deferUpdate();
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== targetUserId);
      });
      const updatedGiveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        // Update live panel
        try {
          const ch = await interaction.guild.channels.fetch(updatedGiveaway.channelId);
          if (ch?.isTextBased()) {
            const panelMsg = await (ch as BaseGuildTextChannel).messages.fetch(updatedGiveaway.messageId).catch(() => null);
            if (panelMsg) {
              await panelMsg.edit({
                embeds: [buildGiveawayEmbed(updatedGiveaway)],
                components: [buildGiveawayRow(giveawayId, updatedGiveaway.entries.length, updatedGiveaway.hideEntryCount)],
              }).catch(() => undefined);
            }
          }
        } catch { /* channel inaccessible */ }
        // Refresh participants list in admin panel
        const entries = updatedGiveaway.entries;
        const list = entries.length === 0
          ? '*No participants yet.*'
          : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') +
            (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`👥 Participants — ${updatedGiveaway.prize}`)
          .setDescription(`✅ Removed <@${targetUserId}>.\n\n${list}`)
          .setFooter({ text: `Total: ${entries.length} • ID: ${giveawayId}` });
        const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
        if (entries.length > 0) {
          const selectIds = entries.slice(0, 25);
          const memberMap = new Map<string, string>();
          try {
            const fetched = await interaction.guild.members.fetch({ user: selectIds });
            for (const [id, m] of fetched) memberMap.set(id, m.displayName);
          } catch { /* fall back */ }
          rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`gwadmin_remove_select:${giveawayId}`)
              .setPlaceholder('🔨 Select another participant to remove')
              .addOptions(selectIds.map(id => ({
                label: (memberMap.get(id) ?? `User ${id}`).slice(0, 100),
                value: id,
              }))),
          ));
        }
        await interaction.editReply({ embeds: [embed], components: rows });
      }
      return;
    }

    // ── Giveaway remove participant (admin) ──────────────────────────────────
    if (interaction.customId.startsWith('giveaway_remove_select:')) {
      if (!interaction.guild) return;
      const giveawayId = interaction.customId.slice('giveaway_remove_select:'.length);
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      const targetUserId = interaction.values[0];
      if (!targetUserId) return;
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== targetUserId);
      });
      const updatedData = loadGuild(interaction.guild.id);
      const updatedGiveaway = updatedData.giveaways.find(g => g.id === giveawayId);
      if (updatedGiveaway) {
        try {
          const ch = await interaction.guild.channels.fetch(updatedGiveaway.channelId);
          if (ch?.isTextBased()) {
            const panelMsg = await (ch as BaseGuildTextChannel).messages.fetch(updatedGiveaway.messageId).catch(() => null);
            if (panelMsg) {
              await panelMsg.edit({
                embeds: [buildGiveawayEmbed(updatedGiveaway)],
                components: [buildGiveawayRow(giveawayId, updatedGiveaway.entries.length, updatedGiveaway.hideEntryCount)],
              }).catch(() => undefined);
            }
          }
        } catch { /* channel inaccessible */ }
      }
      await interaction.reply({ content: `✅ Removed <@${targetUserId}> from the giveaway.`, flags: 64 });
      return;
    }

    // ── Giveaway type select → show setup modal ───────────────────────────────
    if (interaction.customId === 'giveaway_type_select') {
      if (!interaction.guild) return;
      const type = interaction.values[0] as 'standard' | 'drop' | 'lottery';

      // Initialize pending state
      const pending: PendingGiveaway = {
        type,
        prize: '',
        durationStr: '1h',
        channelId: undefined,
        winnerCount: 1,
        donorId: undefined,
        customMessage: undefined,
        pingRoleId: undefined,
        imageUrl: undefined,
        extraEntryRoles: [],
        requiredRoleId: undefined,
        blacklistRoleId: undefined,
        guildId: interaction.guild.id,
        hostId: interaction.user.id,
        hideEntryCount: false,
      };
      pendingGiveaways.set(interaction.user.id, pending);

      const modal = new ModalBuilder()
        .setCustomId('giveaway_modal_create')
        .setTitle('Giveaway Setup')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('prize')
              .setLabel('Giveaway Prize')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('What are you giving away?')
              .setRequired(true)
              .setMaxLength(200),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('duration')
              .setLabel('Giveaway Duration (Ex: 5m, 2h30m, 7d)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('How long will your giveaway be?')
              .setRequired(true)
              .setMaxLength(50),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('channel')
              .setLabel('Channel ID or #mention')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('<#channelId> or bare channel ID')
              .setRequired(true)
              .setMaxLength(100),
          ),
        );

      await interaction.showModal(modal);
      return;
    }
  }

  // ── Modal submissions ────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {

    // ── Ticket ────────────────────────────────────────────────────────────────
    if (interaction.customId === 'ticket_modal') {
      if (!interaction.guild) return;
      await interaction.deferReply({ flags: 64 });
      const reason = interaction.fields.getTextInputValue('ticket_reason');
      const result = await createTicketForUser(interaction.guild, interaction.user, interaction.client, reason);
      if (result.success) {
        await interaction.editReply(`✅ Your ticket has been created: <#${result.channel.id}>`);
      } else {
        await interaction.editReply(`❌ ${result.message}`);
      }
      return;
    }

    // ── Initial giveaway setup modal ─────────────────────────────────────────
    if (interaction.customId === 'giveaway_modal_create') {
      if (!interaction.guild) return;

      const pending = pendingGiveaways.get(interaction.user.id);
      if (!pending) {
        await interaction.reply({ content: '❌ Setup session expired. Run `/giveaway create` again.', flags: 64 });
        return;
      }

      // Parse prize
      pending.prize = interaction.fields.getTextInputValue('prize').trim();
      pending.durationStr = interaction.fields.getTextInputValue('duration').trim();

      // Parse channel
      const rawChannel = interaction.fields.getTextInputValue('channel').trim();
      const channelId = parseIdFromMention(rawChannel);
      const channelOk = /^\d+$/.test(channelId);
      if (channelOk) {
        const ch = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (ch?.isTextBased()) pending.channelId = channelId;
      }

      const embed = buildConfigEmbed(pending);
      if (!pending.channelId) {
        embed.setColor(0xED4245).setFooter({ text: '⚠️ Channel not found — click Channel to set it.' });
      }

      // update() replaces the type select menu message with the config panel
      await interaction.update({
        embeds: [embed],
        components: buildConfigRows(interaction.user.id),
      });
      return;
    }

    // ── Config panel modals (gwmod_*) ────────────────────────────────────────
    if (interaction.customId.startsWith('gwmod_')) {
      if (!interaction.guild) return;
      const colonIdx = interaction.customId.indexOf(':');
      const action = interaction.customId.slice('gwmod_'.length, colonIdx);
      const userId = interaction.customId.slice(colonIdx + 1);

      const pending = pendingGiveaways.get(userId);
      if (!pending) {
        await interaction.reply({ content: '❌ Setup session expired. Run `/giveaway create` again.', flags: 64 });
        return;
      }

      let error: string | undefined;

      switch (action) {
        case 'prize': {
          const val = interaction.fields.getTextInputValue('prize').trim();
          if (val) pending.prize = val;
          break;
        }

        case 'duration': {
          const val = interaction.fields.getTextInputValue('duration').trim();
          const ms = parseDuration(val);
          if (!ms || ms < 10_000 || ms > 30 * 24 * 60 * 60 * 1000) {
            error = 'Invalid duration. Use formats like 30m, 1h, 2d (min 10s, max 30d).';
          } else {
            pending.durationStr = val;
          }
          break;
        }

        case 'winners': {
          const val = parseInt(interaction.fields.getTextInputValue('count').trim(), 10);
          if (isNaN(val) || val < 1 || val > 20) {
            error = 'Winner count must be a number between 1 and 20.';
          } else {
            pending.winnerCount = val;
          }
          break;
        }

        case 'donor': {
          const raw = interaction.fields.getTextInputValue('donor').trim();
          if (!raw) {
            pending.donorId = undefined;
          } else {
            const id = parseIdFromMention(raw);
            if (/^\d+$/.test(id)) {
              pending.donorId = id;
            } else {
              error = 'Invalid user. Paste a user mention like @user or their user ID.';
            }
          }
          break;
        }

        case 'message': {
          const val = interaction.fields.getTextInputValue('msg').trim();
          pending.customMessage = val || undefined;
          break;
        }

        case 'pingrole': {
          const raw = interaction.fields.getTextInputValue('role').trim().toLowerCase();
          if (!raw) {
            pending.pingRoleId = undefined;
          } else if (raw === 'everyone' || raw === '@everyone') {
            pending.pingRoleId = 'everyone';
          } else {
            const id = parseIdFromMention(raw);
            if (/^\d+$/.test(id)) {
              pending.pingRoleId = id;
            } else {
              error = 'Type "everyone" or paste a valid role ID.';
            }
          }
          break;
        }

        case 'channel': {
          const raw = interaction.fields.getTextInputValue('channel').trim();
          const id = parseIdFromMention(raw);
          if (!/^\d+$/.test(id)) {
            error = 'Invalid channel. Paste a #channel mention or bare channel ID.';
          } else {
            const ch = await interaction.guild.channels.fetch(id).catch(() => null);
            if (!ch || !ch.isTextBased()) {
              error = 'Channel not found or not a text channel.';
            } else {
              pending.channelId = id;
            }
          }
          break;
        }

        case 'image': {
          const url = interaction.fields.getTextInputValue('url').trim();
          if (!url) {
            pending.imageUrl = undefined;
          } else if (/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url)) {
            pending.imageUrl = url;
          } else {
            error = 'Invalid image URL. Must be a direct link ending in .png, .jpg, .jpeg, .gif, or .webp.';
          }
          break;
        }

        case 'limiters': {
          const reqRaw = interaction.fields.getTextInputValue('required_role').trim();
          const blkRaw = interaction.fields.getTextInputValue('blacklist_role').trim();
          if (reqRaw) {
            const id = parseIdFromMention(reqRaw);
            if (/^\d+$/.test(id)) pending.requiredRoleId = id;
            else { error = 'Invalid Required Role ID.'; break; }
          } else {
            pending.requiredRoleId = undefined;
          }
          if (blkRaw) {
            const id = parseIdFromMention(blkRaw);
            if (/^\d+$/.test(id)) pending.blacklistRoleId = id;
            else { error = 'Invalid Blacklisted Role ID.'; break; }
          } else {
            pending.blacklistRoleId = undefined;
          }
          break;
        }

        case 'multipliers': {
          const newRoles: { roleId: string; entries: number }[] = [];
          for (const slot of ['1', '2']) {
            const rawId = interaction.fields.getTextInputValue(`role${slot}_id`).trim();
            const rawEntries = interaction.fields.getTextInputValue(`role${slot}_entries`).trim();
            if (!rawId) continue;
            const id = parseIdFromMention(rawId);
            if (!/^\d+$/.test(id)) { error = `Invalid role ID for slot ${slot}.`; break; }
            const count = parseInt(rawEntries, 10);
            if (isNaN(count) || count < 1 || count > 100) { error = `Entries for slot ${slot} must be 1–100.`; break; }
            newRoles.push({ roleId: id, entries: count });
          }
          if (!error) pending.extraEntryRoles = newRoles;
          break;
        }
      }

      const embed = buildConfigEmbed(pending);
      if (error) embed.setColor(0xED4245).setFooter({ text: `❌ ${error}` });

      await interaction.update({ embeds: [embed], components: buildConfigRows(userId) });
      return;
    }

    // ── Admin panel: Edit Giveaway modal submit ──────────────────────────────
    if (interaction.customId.startsWith('gwadmin_modal_edit:')) {
      if (!interaction.guild) return;
      const giveawayId = interaction.customId.slice('gwadmin_modal_edit:'.length);
      const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.reply({ content: '❌ Giveaway not found.', flags: 64 });
        return;
      }
      const prize = interaction.fields.getTextInputValue('prize').trim();
      const winnersRaw = interaction.fields.getTextInputValue('winners').trim();
      const extendRaw = interaction.fields.getTextInputValue('extend').trim();
      const winnerCount = parseInt(winnersRaw, 10);
      if (!prize) {
        await interaction.reply({ content: '❌ Prize cannot be empty.', flags: 64 });
        return;
      }
      if (isNaN(winnerCount) || winnerCount < 1 || winnerCount > 20) {
        await interaction.reply({ content: '❌ Winner count must be 1–20.', flags: 64 });
        return;
      }
      let newEndsAt = giveaway.endsAt;
      if (extendRaw) {
        const match = extendRaw.match(/^(\d+)(s|m|h|d)$/i);
        if (!match) {
          await interaction.reply({ content: '❌ Invalid duration. Use e.g. `30m`, `2h`, `1d`.', flags: 64 });
          return;
        }
        const amount = parseInt(match[1]!, 10);
        const unit = match[2]!.toLowerCase();
        const ms = unit === 's' ? amount * 1000 :
                   unit === 'm' ? amount * 60_000 :
                   unit === 'h' ? amount * 3_600_000 :
                   amount * 86_400_000;
        newEndsAt = giveaway.endsAt + ms;
      }
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) { g.prize = prize; g.winnerCount = winnerCount; g.endsAt = newEndsAt; }
      });
      const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId)!;
      // Refresh the live giveaway panel
      try {
        const ch = await interaction.guild.channels.fetch(updated.channelId);
        if (ch?.isTextBased()) {
          const panelMsg = await (ch as BaseGuildTextChannel).messages.fetch(updated.messageId).catch(() => null);
          if (panelMsg) {
            await panelMsg.edit({
              embeds: [buildGiveawayEmbed(updated)],
              components: [buildGiveawayRow(giveawayId, updated.entries.length, updated.hideEntryCount)],
            }).catch(() => undefined);
          }
        }
      } catch { /* channel inaccessible */ }
      // Reply with refreshed admin panel
      await interaction.reply({
        embeds: [buildAdminPanelEmbed(updated)],
        components: buildAdminPanelRows(giveawayId, updated.ended),
        flags: 64,
      });
      return;
    }
  }

  } catch (err) {
    console.error('[interactionCreate] Unhandled error:', err);
    try {
      const repliable = interaction.isChatInputCommand() || interaction.isButton() ||
        interaction.isModalSubmit() || interaction.isStringSelectMenu();
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
