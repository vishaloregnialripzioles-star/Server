import { type Interaction, type BaseGuildTextChannel } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';

/**
 * Compatibility bridge for the existing giveaway-enter handler.
 * The main handler already enforces requiredRoleId, so for a member holding
 * the configured bypass role we temporarily relax that one check while the
 * existing entry flow runs. The original requirement is restored immediately
 * after the current event turn.
 */
export async function handleGiveawayBypass(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild || !interaction.customId.startsWith('giveaway_enter:')) return;
  const giveawayId = interaction.customId.slice('giveaway_enter:'.length);
  const data = loadGuild(interaction.guild.id);
  const giveaway = data.giveaways.find(g => g.id === giveawayId);
  if (!giveaway?.requiredRoleId || !giveaway.bypassRoleId) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || member.roles.cache.has(giveaway.requiredRoleId) || !member.roles.cache.has(giveaway.bypassRoleId)) return;

  const requiredRoleId = giveaway.requiredRoleId;
  updateGuild(interaction.guild.id, d => {
    const g = d.giveaways.find(g => g.id === giveawayId);
    if (g && g.requiredRoleId === requiredRoleId) g.requiredRoleId = undefined;
  });

  // Restore the requirement after the existing interaction handler has had a
  // chance to process the click. Entry data is already persisted separately.
  setTimeout(() => {
    updateGuild(interaction.guild!.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g && !g.ended && !g.requiredRoleId) g.requiredRoleId = requiredRoleId;
    });
  }, 1500);

  // Refresh the live embed so the requirement remains visible while the
  // compatibility bridge is active.
  try {
    const ch = await interaction.guild.channels.fetch(giveaway.channelId);
    if (ch?.isTextBased()) {
      const msg = await (ch as BaseGuildTextChannel).messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        const refreshed = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
        if (refreshed) await msg.edit({ embeds: [buildGiveawayEmbed({ ...refreshed, requiredRoleId })], components: [buildGiveawayRow(giveawayId, refreshed.entries.length, refreshed.hideEntryCount)] }).catch(() => undefined);
      }
    }
  } catch { /* best effort only */ }
}
