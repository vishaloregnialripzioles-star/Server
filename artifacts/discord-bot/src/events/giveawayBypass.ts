import { type Interaction, type BaseGuildTextChannel } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';

function hasRole(member: any, roleId: string): boolean {
  return Array.isArray(member?.roles) ? member.roles.includes(roleId) : Boolean(member?.roles?.cache?.has(roleId));
}

/** Compatibility bridge for the existing giveaway-enter handler. */
export async function handleGiveawayBypass(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild || !interaction.customId.startsWith('giveaway_enter:')) return;
  const giveawayId = interaction.customId.slice('giveaway_enter:'.length);
  const data = loadGuild(interaction.guild.id);
  const giveaway = data.giveaways.find(g => g.id === giveawayId);
  if (!giveaway?.requiredRoleId || !giveaway.bypassRoleId) return;

  // Read the member already attached to the interaction so this runs before
  // the normal entry handler reaches its required-role check.
  const member = (interaction as any).member;
  if (hasRole(member, giveaway.requiredRoleId) || !hasRole(member, giveaway.bypassRoleId)) return;

  const requiredRoleId = giveaway.requiredRoleId;
  updateGuild(interaction.guild.id, d => {
    const g = d.giveaways.find(g => g.id === giveawayId);
    if (g && g.requiredRoleId === requiredRoleId) g.requiredRoleId = undefined;
  });

  setTimeout(() => {
    updateGuild(interaction.guild!.id, d => {
      const g = d.giveaways.find(g => g.id === giveawayId);
      if (g && !g.ended && !g.requiredRoleId) g.requiredRoleId = requiredRoleId;
    });
  }, 1500);

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
