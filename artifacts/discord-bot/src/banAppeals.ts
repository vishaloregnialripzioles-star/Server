import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, type ButtonInteraction, type Guild, type ModalSubmitInteraction } from 'discord.js';
import { loadGuild, loadGuildFresh, updateGuild } from './storage.js';
import type { BanCase } from './types.js';

export const BAN_EMBED_COLOR = 0xD30000;

async function getLogChannel(guild: Guild): Promise<any> {
  const data = loadGuild(guild.id);
  const id = data.config.logging?.channelId || data.config.logChannel;
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

export function buildBanDm(guild: Guild, reason: string, caseId: string) {
  const embed = new EmbedBuilder().setColor(BAN_EMBED_COLOR).setTitle('🔨 You have been banned')
    .setDescription('You have been permanently banned from **' + guild.name + '**.')
    .addFields({ name: 'Reason', value: reason.slice(0, 1024) }, { name: 'Appeal', value: 'If you believe this ban was incorrect, use the button below to submit an appeal.' }, { name: 'Case ID', value: '`' + caseId + '`', inline: true }).setTimestamp();
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('banappeal:open:' + guild.id + ':' + caseId).setLabel('📝 Appeal Ban').setStyle(ButtonStyle.Danger));
  return { embeds: [embed], components: [row] };
}

export async function sendBanDm(user: any, guild: Guild, reason: string, caseId: string): Promise<boolean> {
  try { await user.send(buildBanDm(guild, reason, caseId)); return true; } catch { return false; }
}

export function createBanCase(guild: Guild, user: any, reason: string, moderatorId: string): string {
  const caseId = 'BAN-' + Date.now().toString(36).toUpperCase();
  updateGuild(guild.id, data => {
    const old = data.banCases[user.id];
    data.banCases[user.id] = { mainUserId: user.id, mainTag: user.tag, reason, moderatorId, bannedAt: Date.now(), altIds: old?.altIds ?? [], appealStatus: 'none' };
  });
  return caseId;
}

export function linkAlt(guild: Guild, mainId: string, altId: string): boolean {
  let linked = false;
  updateGuild(guild.id, data => { const record = data.banCases[mainId]; if (!record) return; if (!record.altIds.includes(altId)) record.altIds.push(altId); linked = true; });
  return linked;
}

export async function handleBanEvasion(member: any): Promise<boolean> {
  const data = loadGuild(member.guild.id);
  const match = Object.values(data.banCases).find((entry: BanCase) => entry.altIds.includes(member.id));
  if (!match) return false;
  const reason = 'Ban evasion — linked to banned account ' + match.mainTag + ' (' + match.mainUserId + ')';
  const embed = new EmbedBuilder().setColor(BAN_EMBED_COLOR).setTitle('🚨 Ban Evasion Detected')
    .setDescription('A linked alternate account joined and was banned automatically.')
    .addFields({ name: 'Main Account', value: '<@' + match.mainUserId + '>\n`' + match.mainUserId + '`', inline: true }, { name: 'Alternate Account', value: '<@' + member.id + '>\n`' + member.id + '`', inline: true }, { name: 'Original Ban Reason', value: match.reason.slice(0, 1024) }, { name: 'Action', value: '🔨 Alternate account banned instantly.' }).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp();
  try { await member.guild.members.ban(member.user, { reason }); } catch (error) { console.error('[BanEvasion] Failed to ban linked alt:', error); return false; }
  const channel = await getLogChannel(member.guild); if (channel) await channel.send({ embeds: [embed] }).catch(() => undefined);
  return true;
}

export async function handleBanAppealButton(interaction: ButtonInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':'); if (parts[0] !== 'banappeal') return false;
  const action = parts[1]; const guildId = parts[2];
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) { await interaction.reply({ content: '❌ This server is no longer available.', ephemeral: true }); return true; }
  const data = await loadGuildFresh(guild.id); const banCase = data.banCases[interaction.user.id];
  if (!banCase) { await interaction.reply({ content: '❌ No active ban case was found for you.', ephemeral: true }); return true; }
  if (action === 'open') {
    if (banCase.appealStatus === 'pending') { await interaction.reply({ content: '⏳ Your appeal is already pending review.', ephemeral: true }); return true; }
    const modal = new ModalBuilder().setCustomId('banappeal:submit:' + guild.id).setTitle('Ban Appeal');
    const input = new TextInputBuilder().setCustomId('appeal').setLabel('Why should this ban be removed?').setStyle(TextInputStyle.Paragraph).setPlaceholder('Explain what happened and why you are appealing...').setMinLength(10).setMaxLength(1500).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)); await interaction.showModal(modal); return true;
  }
  if (action !== 'accept' && action !== 'deny') return false;
  const allowed = Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.Administrator));
  if (!allowed) { await interaction.reply({ content: '❌ Only server administrators can review ban appeals.', ephemeral: true }); return true; }
  if (banCase.appealStatus !== 'pending') { await interaction.reply({ content: 'ℹ️ This appeal has already been reviewed.', ephemeral: true }); return true; }
  if (action === 'accept') {
    await guild.bans.remove(banCase.mainUserId, 'Ban appeal accepted by ' + interaction.user.tag).catch(() => null);
    updateGuild(guild.id, d => { const item = d.banCases[banCase.mainUserId]; if (item) { item.appealStatus = 'accepted'; item.appealReviewerId = interaction.user.id; } });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x22C55E).setFooter({ text: 'Appeal accepted by ' + interaction.user.tag })], components: [] });
    const user = await interaction.client.users.fetch(banCase.mainUserId).catch(() => null);
    await user?.send({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Ban Appeal Accepted').setDescription('Your appeal for **' + guild.name + '** was accepted. You are now unbanned.').setTimestamp()] }).catch(() => undefined);
  } else {
    updateGuild(guild.id, d => { const item = d.banCases[banCase.mainUserId]; if (item) { item.appealStatus = 'denied'; item.appealReviewerId = interaction.user.id; } });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(BAN_EMBED_COLOR).setFooter({ text: 'Appeal denied by ' + interaction.user.tag })], components: [] });
    const user = await interaction.client.users.fetch(banCase.mainUserId).catch(() => null);
    await user?.send({ embeds: [new EmbedBuilder().setColor(BAN_EMBED_COLOR).setTitle('❌ Ban Appeal Denied').setDescription('Your appeal for **' + guild.name + '** was denied. The ban remains active.').setTimestamp()] }).catch(() => undefined);
  }
  return true;
}

export async function handleBanAppealModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':'); if (parts[0] !== 'banappeal' || parts[1] !== 'submit') return false;
  const guild = await interaction.client.guilds.fetch(parts[2]).catch(() => null);
  if (!guild) { await interaction.reply({ content: '❌ This server is no longer available.', ephemeral: true }); return true; }
  const data = await loadGuildFresh(guild.id); const banCase = data.banCases[interaction.user.id];
  if (!banCase) { await interaction.reply({ content: '❌ No active ban case was found.', ephemeral: true }); return true; }
  const appealText = interaction.fields.getTextInputValue('appeal').trim();
  updateGuild(guild.id, d => { const item = d.banCases[interaction.user.id]; if (item) { item.appealStatus = 'pending'; item.appealText = appealText; item.appealAt = Date.now(); } });
  const channel = await getLogChannel(guild);
  if (!channel) { await interaction.reply({ content: '⚠️ Your appeal was saved, but this server has no logging channel configured.', ephemeral: true }); return true; }
  const embed = new EmbedBuilder().setColor(BAN_EMBED_COLOR).setTitle('📨 Ban Appeal Received').setDescription('A banned member submitted an appeal.')
    .addFields({ name: 'Member', value: '<@' + interaction.user.id + '>\n`' + interaction.user.id + '`', inline: true }, { name: 'Original Reason', value: banCase.reason.slice(0, 1024) }, { name: 'Appeal Message', value: appealText.slice(0, 1024) }).setThumbnail(interaction.user.displayAvatarURL({ size: 256 })).setTimestamp();
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('banappeal:accept:' + guild.id).setLabel('Accept').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('banappeal:deny:' + guild.id).setLabel('Deny').setStyle(ButtonStyle.Danger));
  const sent = await channel.send({ embeds: [embed], components: [row] });
  updateGuild(guild.id, d => { const item = d.banCases[interaction.user.id]; if (item) item.appealLogMessageId = sent.id; });
  await interaction.reply({ content: '✅ Your appeal has been submitted to the server moderation team.', ephemeral: true }); return true;
}