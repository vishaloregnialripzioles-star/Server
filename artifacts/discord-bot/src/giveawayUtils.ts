import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Giveaway } from './types.js';
import { loadGuild, updateGuild } from './storage.js';
import { preselectedGiveawayWinners } from './giveawaySetup.js';

function formatDurationStr(durationStr: string | undefined, endsAt: number): string {
  if (durationStr) return durationStr;
  const ms = Math.max(0, endsAt - Date.now());
  const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return d === 1 ? '1 day' : `${d} days`; if (h > 0) return h === 1 ? '1 hour' : `${h} hours`; if (m > 0) return m === 1 ? '1 minute' : `${m} minutes`; return 'less than a minute';
}
function formatEndDateTime(endsAt: number): string {
  const now = Date.now(); const date = new Date(endsAt); const msUntil = endsAt - now;
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
  const todayUtc = new Date(now); todayUtc.setUTCHours(0, 0, 0, 0); const tomorrowUtc = new Date(todayUtc.getTime() + 86400000); const dayAfterUtc = new Date(tomorrowUtc.getTime() + 86400000);
  if (date >= tomorrowUtc && date < dayAfterUtc) return `Tomorrow at ${timeStr} UTC`; if (date >= todayUtc && date < tomorrowUtc) return `Today at ${timeStr} UTC`;
  const days = Math.floor(msUntil / 86400000); if (days > 1 && days <= 6) return `${date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })} at ${timeStr} UTC`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + ` at ${timeStr} UTC`;
}

export function buildGiveawayEmbed(giveaway: Giveaway): EmbedBuilder {
  const winnerCount = giveaway.winnerCount ?? 1; const unixTs = Math.floor(giveaway.endsAt / 1000); const durationLabel = formatDurationStr(giveaway.durationStr, giveaway.endsAt); const entryCount = giveaway.entries.length;
  let desc = `Click 🎉 to enter!\n**Duration:** ${durationLabel} (Ends <t:${unixTs}:R>)\nHosted by: <@${giveaway.hostId}>`;
  if (giveaway.donorId) desc += `\nDonor: <@${giveaway.donorId}>`;
  desc += `\n👥 **${entryCount}** participant${entryCount !== 1 ? 's' : ''} entered`;
  const selectedWinnerIds = [...new Set(giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []))];
  if (!giveaway.ended && selectedWinnerIds.length > 0) desc += `\n🎯 **Selected winner${selectedWinnerIds.length !== 1 ? 's' : ''}:** ${selectedWinnerIds.map(id => `<@${id}>`).join(', ')} (locked in)`;
  if (giveaway.requiredRoleId) desc += `\n\n**Required:** <@&${giveaway.requiredRoleId}>`; if (giveaway.blacklistRoleId) desc += `\n**Excluded:** <@&${giveaway.blacklistRoleId}>`;
  if (giveaway.extraEntryRoles && giveaway.extraEntryRoles.length > 0) { desc += '\n\nMultipliers'; for (const er of giveaway.extraEntryRoles) desc += `\n<@&${er.roleId}>: +${er.entries} entries`; }
  if (giveaway.customMessage) desc += `\n\n${giveaway.customMessage}`;
  const embed = new EmbedBuilder().setColor(0xFAA61A).setTitle(giveaway.prize).setDescription(desc).setFooter({ text: `${winnerCount} winner${winnerCount !== 1 ? 's' : ''} • ID: ${giveaway.id} • Ends | ${formatEndDateTime(giveaway.endsAt)}` });
  if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl); return embed;
}

export function buildGiveawayRow(giveawayId: string, entryCount = 0, hideCount = false): ActionRowBuilder<ButtonBuilder> {
  const label = hideCount ? '🎉' : `🎉 ${entryCount}`;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_enter:${giveawayId}`).setLabel(label).setStyle(ButtonStyle.Success),
  );
}

export function buildGiveawayEndedEmbed(giveaway: Giveaway): EmbedBuilder {
  const winnerCount = giveaway.winnerCount ?? 1; const winnerIds = giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []); const winnerMentions = winnerIds.length > 0 ? winnerIds.map(id => `<@${id}>`).join(', ') : '*(No eligible entries)*';
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle(`🎉 ${giveaway.prize} — ENDED`).setDescription(`**Winner${winnerIds.length !== 1 ? 's' : ''}:** ${winnerMentions}\n\n**Total Entries:** ${giveaway.entries.length}\nHosted by: <@${giveaway.hostId}>${giveaway.donorId ? `\nDonor: <@${giveaway.donorId}>` : ''}`).setFooter({ text: `${winnerCount} winner${winnerCount !== 1 ? 's' : ''} • ID: ${giveaway.id}` }).setTimestamp();
  if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl); return embed;
}

async function buildWeightedPool(guild: Guild, giveaway: Giveaway): Promise<string[]> {
  const pool: string[] = [];
  for (const userId of giveaway.entries) { let weight = 1; if (giveaway.extraEntryRoles && giveaway.extraEntryRoles.length > 0) { const member = await guild.members.fetch(userId).catch(() => null); if (member) for (const extra of giveaway.extraEntryRoles) if (member.roles.cache.has(extra.roleId)) weight = Math.max(weight, extra.entries); } for (let i = 0; i < weight; i++) pool.push(userId); }
  return pool;
}
export async function pickWinners(guild: Guild, giveaway: Giveaway, count = 1, excludeIds: string[] = []): Promise<string[]> {
  const entries = giveaway.entries.filter(id => !excludeIds.includes(id)); if (entries.length === 0) return []; const pool = await buildWeightedPool(guild, { ...giveaway, entries }); if (pool.length === 0) return [];
  const winners: string[] = []; const remaining = [...pool];
  for (let i = 0; i < Math.min(count, new Set(entries).size); i++) { if (remaining.length === 0) break; const idx = Math.floor(Math.random() * remaining.length); const winner = remaining[idx]!; winners.push(winner); for (let j = remaining.length - 1; j >= 0; j--) if (remaining[j] === winner) remaining.splice(j, 1); }
  return winners;
}

export function buildAdminPanelEmbed(giveaway: Giveaway): EmbedBuilder {
  const unixTs = Math.floor(giveaway.endsAt / 1000); const status = giveaway.ended ? '🔴 Ended' : `🟢 Active — ends <t:${unixTs}:R>`; const winnerCount = giveaway.winnerCount ?? 1; const selectedWinnerIds = [...new Set(giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []))]; const selected = selectedWinnerIds.length > 0 ? `\n**Selected winners:** ${selectedWinnerIds.map(id => `<@${id}>`).join(', ')}` : '';
  return new EmbedBuilder().setColor(0x5865F2).setTitle(`⚙️ Managing: ${giveaway.prize}`).setDescription(`**Status:** ${status}\n**Participants:** ${giveaway.entries.length}\n**Winners:** ${winnerCount}${selected}\n**Hosted by:** <@${giveaway.hostId}>\n**ID:** \`${giveaway.id}\``);
}
export function buildAdminPanelRows(giveawayId: string, ended: boolean, viewerUserId?: string): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gwadmin_participants:${giveawayId}`).setLabel('👥 Participants').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gwadmin_edit:${giveawayId}`).setLabel('✏️ Edit').setStyle(ButtonStyle.Primary).setDisabled(ended),
    new ButtonBuilder().setCustomId(`gwadmin_end:${giveawayId}`).setLabel('🔴 End Giveaway').setStyle(ButtonStyle.Danger).setDisabled(ended),
  );
  const ownerId = (process.env.OWNER_USER_ID ?? '').trim();
  if (!ended && ownerId && viewerUserId === ownerId) {
    row.addComponents(new ButtonBuilder().setCustomId(`gwadmin_selectwinner:${giveawayId}`).setLabel('🏆 Select Winner').setStyle(ButtonStyle.Success));
  }
  return [row];
}
export async function rerollWinner(guild: Guild, giveaway: Giveaway): Promise<string | null> { const winners = await pickWinners(guild, giveaway, 1, giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : [])); return winners[0] ?? null; }
export async function pickWinner(guild: Guild, giveaway: Giveaway): Promise<string | null> { const winners = await pickWinners(guild, giveaway, 1); return winners[0] ?? null; }

export async function endGiveaway(guild: Guild, giveaway: Giveaway): Promise<void> {
  const count = giveaway.winnerCount ?? 1;
  const preselectedId = preselectedGiveawayWinners.get(giveaway.hostId);
  const lockedPreselected = preselectedId && giveaway.entries.includes(preselectedId) ? preselectedId : undefined;
  const lockedWinnerIds = lockedPreselected ? [lockedPreselected] : [...new Set(giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []))].filter(id => giveaway.entries.includes(id));
  const remainingCount = lockedPreselected ? 0 : Math.max(0, count - lockedWinnerIds.length);
  const additionalWinnerIds = remainingCount > 0 ? await pickWinners(guild, giveaway, remainingCount, lockedWinnerIds) : [];
  const winnerIds = [...lockedWinnerIds, ...additionalWinnerIds];
  updateGuild(guild.id, data => { const g = data.giveaways.find(g => g.id === giveaway.id); if (g) { g.ended = true; g.winnerIds = winnerIds; g.winnerId = winnerIds[0]; } });
  preselectedGiveawayWinners.delete(giveaway.hostId);
  try {
    const ch = await guild.channels.fetch(giveaway.channelId); if (!ch?.isTextBased()) return; const channel = ch as BaseGuildTextChannel;
    const endedEmbed = buildGiveawayEndedEmbed({ ...giveaway, winnerIds, winnerId: winnerIds[0] }); const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [endedEmbed], components: [] }).catch(() => undefined);
    if (winnerIds.length > 0) { const mentions = winnerIds.map(id => `<@${id}>`).join(', '); const rerollInfo = loadGuild(guild.id).config.prefix ?? '.'; await channel.send({ content: `🎉 Congratulations ${mentions}! You won **${giveaway.prize}**!\n-# To reroll: \`${rerollInfo}reroll ${giveaway.id}\` or \`/giveaway reroll\``, allowedMentions: { users: winnerIds } }); }
    else await channel.send({ content: `❌ The giveaway **${giveaway.prize}** ended with no eligible entries.` });
  } catch { /* channel inaccessible */ }
}
