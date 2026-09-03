import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type BaseGuildTextChannel,
  type Interaction,
} from 'discord.js';
import type { Giveaway, ExtraEntryRole } from '../types.js';
import { pendingGiveaways, buildConfigEmbed, buildConfigRows, finishingGiveaways } from '../giveawaySetup.js';
import { buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';
import { updateGuild, claimGiveawayCreation } from '../storage.js';
import { generateId, parseDuration } from '../utils.js';

function getUserId(customId: string): string | null {
  const parts = customId.split(':');
  return parts.length >= 2 ? parts[1]! : null;
}

function backRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gws_back:${userId}`).setLabel('← Back to Giveaway Setup').setStyle(ButtonStyle.Secondary),
  );
}

function limiterRows(userId: string, pending: ReturnType<typeof pendingGiveaways.get>): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gws_required:${userId}`).setLabel('🎟️ Required Role').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gws_bypass:${userId}`).setLabel('🛡️ Requirement Bypass').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gws_blacklist:${userId}`).setLabel('🚫 Blacklist Role').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gws_clear_required:${userId}`).setLabel('Clear Required').setStyle(ButtonStyle.Secondary).setDisabled(!pending?.requiredRoleId),
    new ButtonBuilder().setCustomId(`gws_clear_bypass:${userId}`).setLabel('Clear Bypass').setStyle(ButtonStyle.Secondary).setDisabled(!pending?.bypassRoleId),
    new ButtonBuilder().setCustomId(`gws_clear_blacklist:${userId}`).setLabel('Clear Blacklist').setStyle(ButtonStyle.Secondary).setDisabled(!pending?.blacklistRoleId),
  );
  return [row1, row2, backRow(userId)];
}

function multiplierRows(userId: string, pending: ReturnType<typeof pendingGiveaways.get>): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const [index, extra] of (pending?.extraEntryRoles ?? []).entries()) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`gws_remove_multiplier:${userId}:${index}`).setLabel(`✕ <@&${extra.roleId}> • ${extra.entries}×`).setStyle(ButtonStyle.Secondary),
    ));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gws_add_multiplier:${userId}`).setLabel('➕ Add Multiplier Role').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gws_clear_multipliers:${userId}`).setLabel('Clear All').setStyle(ButtonStyle.Danger).setDisabled((pending?.extraEntryRoles.length ?? 0) === 0),
  ));
  rows.push(backRow(userId));
  return rows;
}

function selectorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description);
}

function rolePicker(userId: string, action: string, placeholder: string): ActionRowBuilder<RoleSelectMenuBuilder> {
  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId(`gws_pick_${action}:${userId}`).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1),
  );
}

function channelPicker(userId: string): ActionRowBuilder<ChannelSelectMenuBuilder> {
  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(`gws_pick_channel:${userId}`).setPlaceholder('Select the giveaway channel…').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1),
  );
}

function donorPicker(userId: string): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(`gws_pick_donor:${userId}`).setPlaceholder('Select the donor…').setMinValues(1).setMaxValues(1),
  );
}

function multiplierBonusModal(userId: string, roleId: string): ModalBuilder {
  const input = new TextInputBuilder().setCustomId('multiplier').setLabel('Entry multiplier (1–100×)').setStyle(TextInputStyle.Short).setPlaceholder('Example: 2').setRequired(true).setMaxLength(3);
  return new ModalBuilder().setCustomId(`gws_multiplier_bonus:${userId}:${roleId}`).setTitle('Set Multiplier').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

function renderConfig(interaction: any, userId: string, pending: NonNullable<ReturnType<typeof pendingGiveaways.get>>, error?: string) {
  const embed = buildConfigEmbed(pending);
  if (error) embed.setColor(0xED4245).setFooter({ text: `❌ ${error}` });
  return interaction.update({ embeds: [embed], components: buildConfigRows(userId) });
}

async function finishGiveaway(interaction: any, pending: NonNullable<ReturnType<typeof pendingGiveaways.get>>): Promise<void> {
  if (!pending.channelId) { await renderConfig(interaction, pending.hostId, pending, 'Please select a giveaway Channel before finishing.'); return; }
  const durationMs = parseDuration(pending.durationStr);
  if (!durationMs || durationMs < 10_000 || durationMs > 30 * 24 * 60 * 60 * 1000) { await renderConfig(interaction, pending.hostId, pending, 'Invalid duration. Use formats like 30m, 1h, 2d (min 10s, max 30d).'); return; }
  const targetCh = interaction.guild.channels.cache.get(pending.channelId);
  if (!targetCh?.isTextBased()) { await renderConfig(interaction, pending.hostId, pending, 'The selected channel is no longer available.'); return; }

  const finishKey = `${pending.guildId}:${pending.hostId}`;
  if (finishingGiveaways.has(finishKey)) {
    // A second listener/process must acknowledge the component silently. Never
    // send a visible "already creating" message for a duplicate click event.
    await interaction.deferUpdate().catch(() => undefined);
    return;
  }
  finishingGiveaways.add(finishKey);

  try {
    const currentPending = pendingGiveaways.get(pending.hostId);
    if (!currentPending || currentPending !== pending) {
      await interaction.deferUpdate().catch(() => undefined);
      return;
    }

    // The Discord interaction ID is unique. Claim it in Neon before sending the
    // giveaway message, so two bot processes can never both post for one click.
    const interactionClaimed = await claimGiveawayCreation(String(interaction.id));
    if (!interactionClaimed) {
      // This interaction was already handled by another bot process/listener.
      // Acknowledge it without producing a second visible response.
      await interaction.deferUpdate().catch(() => undefined);
      return;
    }

    const giveawayId = generateId();
    const endsAt = Date.now() + durationMs;
    const newGiveaway: Giveaway = {
      id: giveawayId, guildId: interaction.guild.id, channelId: pending.channelId, messageId: '', name: pending.prize, prize: pending.prize, endsAt,
      hostId: pending.hostId, donorId: pending.donorId, winnerCount: pending.winnerCount, type: pending.type, pingRoleId: pending.pingRoleId,
      customMessage: pending.customMessage, hideEntryCount: pending.hideEntryCount, durationStr: pending.durationStr, entries: [],
      requiredRoleId: pending.requiredRoleId, bypassRoleId: pending.bypassRoleId, blacklistRoleId: pending.blacklistRoleId,
      extraEntryRoles: pending.extraEntryRoles.length ? pending.extraEntryRoles : undefined, imageUrl: pending.imageUrl, ended: false,
    };
    let pingContent = '🎉 GIVEAWAY 🎉';
    if (pending.pingRoleId === 'everyone') pingContent = '@everyone\n🎉 GIVEAWAY 🎉';
    else if (pending.pingRoleId) pingContent = `<@&${pending.pingRoleId}>\n🎉 GIVEAWAY 🎉`;

    try {
      const sent = await (targetCh as BaseGuildTextChannel).send({
        content: pingContent,
        embeds: [buildGiveawayEmbed(newGiveaway)],
        components: [buildGiveawayRow(giveawayId, 0, pending.hideEntryCount)],
        allowedMentions: pending.pingRoleId === 'everyone' ? { parse: ['everyone'] } : pending.pingRoleId ? { roles: [pending.pingRoleId] } : { parse: [] },
      });
      newGiveaway.messageId = sent.id;
      updateGuild(interaction.guild.id, data => { data.giveaways.push(newGiveaway); });
      pendingGiveaways.delete(pending.hostId);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Giveaway Started!').setDescription(`**${pending.prize}** is now live in <#${pending.channelId}>!\n\nID: \`${giveawayId}\``).setFooter({ text: 'Use /giveaway end to end early • /giveaway reroll to reroll' })], components: [] });
    } catch {
      await renderConfig(interaction, pending.hostId, pending, 'Failed to post. Check Send Messages and Embed Links permissions.');
    }
  } finally {
    finishingGiveaways.delete(finishKey);
  }
}

export async function handleGiveawaySelectors(interaction: Interaction): Promise<void> {
  if (!interaction.guild) return;
  const customId = 'customId' in interaction ? String((interaction as any).customId) : '';
  if (!customId.startsWith('gws_')) return;
  const userId = getUserId(customId);
  if (!userId || interaction.user.id !== userId) { if ('reply' in interaction) await (interaction as any).reply({ content: '❌ This is not your giveaway setup panel.', flags: 64 }); return; }
  const pending = pendingGiveaways.get(userId);
  if (!pending) { if ('reply' in interaction) await (interaction as any).reply({ content: '❌ Setup session expired. Run `/giveaway create` again.', flags: 64 }); return; }

  if (interaction.isButton()) {
    if (customId === `gws_done:${userId}`) { await finishGiveaway(interaction, pending); return; }
    if (customId === `gws_back:${userId}`) { await renderConfig(interaction, userId, pending); return; }
    if (customId === `gws_limiters:${userId}`) { await interaction.update({ embeds: [selectorEmbed('🎯 Giveaway Requirements', 'Configure who can enter. Each role is selected directly from your server — no IDs to paste.')], components: limiterRows(userId, pending) }); return; }
    if (customId === `gws_multipliers:${userId}`) { await interaction.update({ embeds: [selectorEmbed('✨ Entry Multipliers', 'Give members with selected roles extra weighted chances. Add a role, then choose its multiplier.')], components: multiplierRows(userId, pending) }); return; }
    if (customId === `gws_channel:${userId}`) { await interaction.update({ embeds: [selectorEmbed('📣 Giveaway Channel', 'Select where the giveaway will be posted.')], components: [channelPicker(userId), backRow(userId)] }); return; }
    if (customId === `gws_pingrole:${userId}`) { await interaction.update({ embeds: [selectorEmbed('🔔 Ping Role', 'Select the role to notify when the giveaway starts, or choose @everyone.')], components: [rolePicker(userId, 'pingrole', 'Select a role to ping…'), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`gws_ping_everyone:${userId}`).setLabel('@everyone').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`gws_clear_ping:${userId}`).setLabel('Clear').setStyle(ButtonStyle.Danger)), backRow(userId)] }); return; }
    if (customId === `gws_donor:${userId}`) { await interaction.update({ embeds: [selectorEmbed('🤝 Giveaway Donor', 'Select the donor account directly from the server.')], components: [donorPicker(userId), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`gws_clear_donor:${userId}`).setLabel('Clear Donor').setStyle(ButtonStyle.Danger)), backRow(userId)] }); return; }
    const limiterAction = ['required', 'bypass', 'blacklist'].find(k => customId === `gws_${k}:${userId}`);
    if (limiterAction) { const labels: Record<string, string> = { required: 'Required Role', bypass: 'Requirement Bypass Role', blacklist: 'Blacklist Role' }; await interaction.update({ embeds: [selectorEmbed(`🛡️ ${labels[limiterAction]}`, 'Select a role from this server. The selected role will be applied immediately.')], components: [rolePicker(userId, limiterAction, `Select ${labels[limiterAction]}…`), backRow(userId)] }); return; }
    const clear = ['required', 'bypass', 'blacklist'].find(k => customId === `gws_clear_${k}:${userId}`);
    if (clear) { if (clear === 'required') pending.requiredRoleId = undefined; if (clear === 'bypass') pending.bypassRoleId = undefined; if (clear === 'blacklist') pending.blacklistRoleId = undefined; await interaction.update({ embeds: [selectorEmbed('✅ Updated', 'The requirement was cleared. Returning to the requirements panel…')], components: limiterRows(userId, pending) }); return; }
    if (customId === `gws_add_multiplier:${userId}`) { await interaction.update({ embeds: [selectorEmbed('➕ Add Multiplier Role', 'Select the role that should receive extra weighted chances.')], components: [rolePicker(userId, 'multiplier', 'Select multiplier role…'), backRow(userId)] }); return; }
    if (customId === `gws_clear_multipliers:${userId}`) { pending.extraEntryRoles = []; await interaction.update({ embeds: [selectorEmbed('✅ Multipliers Cleared', 'All multiplier roles have been removed.')], components: multiplierRows(userId, pending) }); return; }
    if (customId.startsWith(`gws_remove_multiplier:${userId}:`)) { const index = Number(customId.split(':').pop()); if (Number.isInteger(index) && index >= 0) pending.extraEntryRoles.splice(index, 1); await interaction.update({ embeds: [selectorEmbed('✨ Entry Multipliers', 'Multiplier updated.')], components: multiplierRows(userId, pending) }); return; }
    if (customId === `gws_ping_everyone:${userId}`) { pending.pingRoleId = 'everyone'; await renderConfig(interaction, userId, pending); return; }
    if (customId === `gws_clear_ping:${userId}`) { pending.pingRoleId = undefined; await renderConfig(interaction, userId, pending); return; }
    if (customId === `gws_clear_donor:${userId}`) { pending.donorId = undefined; await renderConfig(interaction, userId, pending); return; }
  }

  if (interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0]; if (!roleId) return;
    if (roleId === interaction.guild.id) { await interaction.reply({ content: '❌ @everyone cannot be used for this setting.', flags: 64 }); return; }
    if (customId === `gws_pick_required:${userId}`) { pending.requiredRoleId = roleId; await interaction.update({ embeds: [selectorEmbed('✅ Required Role Set', `<@&${roleId}> is now required to enter.`)], components: limiterRows(userId, pending) }); return; }
    if (customId === `gws_pick_bypass:${userId}`) { pending.bypassRoleId = roleId; await interaction.update({ embeds: [selectorEmbed('✅ Bypass Role Set', `<@&${roleId}> can bypass the required-role restriction.`)], components: limiterRows(userId, pending) }); return; }
    if (customId === `gws_pick_blacklist:${userId}`) { pending.blacklistRoleId = roleId; await interaction.update({ embeds: [selectorEmbed('✅ Blacklist Role Set', `<@&${roleId}> is excluded from this giveaway.`)], components: limiterRows(userId, pending) }); return; }
    if (customId === `gws_pick_pingrole:${userId}`) { pending.pingRoleId = roleId; await renderConfig(interaction, userId, pending); return; }
    if (customId === `gws_pick_multiplier:${userId}`) { await interaction.showModal(multiplierBonusModal(userId, roleId)); return; }
  }

  if (interaction.isChannelSelectMenu() && customId === `gws_pick_channel:${userId}`) { const channelId = interaction.values[0]; if (!channelId) return; pending.channelId = channelId; await renderConfig(interaction, userId, pending); return; }
  if (interaction.isUserSelectMenu() && customId === `gws_pick_donor:${userId}`) { const donorId = interaction.values[0]; if (!donorId) return; pending.donorId = donorId; await renderConfig(interaction, userId, pending); return; }
  if (interaction.isModalSubmit() && customId.startsWith(`gws_multiplier_bonus:${userId}:`)) {
    const roleId = customId.split(':')[2]; const value = Number(interaction.fields.getTextInputValue('multiplier')); if (!Number.isFinite(value) || value < 1 || value > 100 || !Number.isInteger(value)) { await interaction.reply({ content: '❌ Multiplier must be a whole number from 1 to 100.', flags: 64 }); return; }
    const existingIndex = pending.extraEntryRoles.findIndex((r: ExtraEntryRole) => r.roleId === roleId); if (existingIndex >= 0) pending.extraEntryRoles[existingIndex] = { roleId, entries: value }; else pending.extraEntryRoles.push({ roleId, entries: value }); await renderConfig(interaction, userId, pending); return;
  }
}
