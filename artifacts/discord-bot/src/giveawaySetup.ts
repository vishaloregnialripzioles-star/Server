/**
 * Pending giveaway state management and config panel builder.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { ExtraEntryRole } from './types.js';

export interface PendingGiveaway {
  type: 'standard' | 'drop' | 'lottery'; prize: string; durationStr: string; channelId?: string; winnerCount: number; donorId?: string; customMessage?: string; pingRoleId?: string; imageUrl?: string; extraEntryRoles: ExtraEntryRole[]; requiredRoleId?: string; blacklistRoleId?: string; guildId: string; hostId: string; hideEntryCount: boolean;
}
export const pendingGiveaways = new Map<string, PendingGiveaway>();
export const preselectedGiveawayWinners = new Map<string, string>();
export const preselectAllowedUsers = new Set<string>();

export function buildConfigEmbed(pending: PendingGiveaway): EmbedBuilder {
  const typeLabel = pending.type === 'drop' ? '⚡ Drop Giveaway' : pending.type === 'lottery' ? '🎰 Lottery' : '🎉 New Giveaway';
  const lines: string[] = [`**Prize:** ${pending.prize}`, `**Channel:** ${pending.channelId ? `<#${pending.channelId}>` : '⚠️ *Not set — click Channel*'}`, `**Host:** <@${pending.hostId}>`, `**Winners:** ${pending.winnerCount}`, `**Duration:** ${pending.durationStr}`];
  const selected = preselectedGiveawayWinners.get(pending.hostId); if (selected) lines.push(`**🎯 Selected Winner:** <@${selected}>`);
  if (pending.donorId) lines.push(`**Donor:** <@${pending.donorId}>`); if (pending.customMessage) lines.push(`**Message:** ${pending.customMessage}`); if (pending.pingRoleId) lines.push(`**Ping:** ${pending.pingRoleId === 'everyone' ? '@everyone' : `<@&${pending.pingRoleId}>`}`); if (pending.requiredRoleId) lines.push(`**Required Role:** <@&${pending.requiredRoleId}>`); if (pending.blacklistRoleId) lines.push(`**Blacklisted Role:** <@&${pending.blacklistRoleId}>`); if (pending.extraEntryRoles.length > 0) lines.push(`**Multipliers:** ${pending.extraEntryRoles.map(r => `<@&${r.roleId}>: +${r.entries}`).join(', ')}`); if (pending.imageUrl) lines.push('**Image:** ✅ set'); if (pending.hideEntryCount) lines.push('**Hide Entry Count:** Yes');
  return new EmbedBuilder().setColor(0x57F287).setTitle(typeLabel).setDescription(lines.join('\n')).setFooter({ text: 'Click ✅ Done when you are ready to start the giveaway.' });
}

export function buildConfigRows(userId: string, canSelectWinner = isOwner(userId)): ActionRowBuilder<ButtonBuilder>[] {
  const btn = (id: string, label: string, style: ButtonStyle = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`gwcfg_${id}:${userId}`).setLabel(label).setStyle(style);
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(btn('done', '✅ Done', ButtonStyle.Success), btn('limiters', 'Limiters & Requirements', ButtonStyle.Primary), btn('multipliers', 'Multipliers', ButtonStyle.Primary), btn('prize', 'Prize', ButtonStyle.Primary));
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(btn('winners', 'Winners'), btn('donor', 'Donor'), btn('message', 'Message'), btn('pingrole', 'Ping Role'), btn('channel', 'Channel'));
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(btn('image', 'Image'), btn('duration', 'Duration'), btn('hide', 'Hide Entry Count'));
  const rows = [row1, row2, row3]; if (canSelectWinner) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn('selectwinner', '🎯 Select Winner', ButtonStyle.Danger))); return rows;
}

function isOwner(userId: string): boolean {
  const ownerId = (process.env.OWNER_USER_ID ?? '').trim();
  return Boolean(ownerId) && userId === ownerId;
}
