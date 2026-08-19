import type { ButtonInteraction } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { pickWinners, buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';
import type { Giveaway } from '../types.js';

export async function handleGiveawayWinnerButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith('giveaway_select_winner:') || !interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const allowed = interaction.user.id === interaction.guild.ownerId ||
    Boolean(member?.permissions.has(PermissionFlagsBits.Administrator));
  if (!allowed) {
    await interaction.reply({ content: '❌ Only the server owner or an Administrator can select a giveaway winner.', ephemeral: true });
    return;
  }
  if (!member) {
    await interaction.reply({ content: '❌ Could not verify your server membership.', ephemeral: true });
    return;
  }

  const giveawayId = interaction.customId.slice('giveaway_select_winner:'.length);
  const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId) as Giveaway | undefined;
  if (!giveaway) {
    await interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
    return;
  }
  if (giveaway.ended || giveaway.endsAt <= Date.now()) {
    await interaction.reply({ content: '❌ This giveaway has already ended.', ephemeral: true });
    return;
  }
  if (giveaway.entries.length === 0) {
    await interaction.reply({ content: '❌ There are no participants yet.', ephemeral: true });
    return;
  }

  const existingWinners = [...new Set(giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []))]
    .filter(id => giveaway.entries.includes(id));
  const winnerCount = giveaway.winnerCount ?? 1;
  const needed = Math.max(0, winnerCount - existingWinners.length);

  if (needed === 0) {
    const mentions = existingWinners.map(id => `<@${id}>`).join(', ');
    await interaction.reply({ content: `🎯 Winner${existingWinners.length !== 1 ? 's' : ''} already selected: ${mentions}\nThese winners are locked in.`, ephemeral: true });
    return;
  }

  const newlySelected = await pickWinners(interaction.guild, giveaway, needed, existingWinners);
  if (newlySelected.length === 0) {
    await interaction.reply({ content: '❌ Could not select an eligible winner.', ephemeral: true });
    return;
  }

  const winnerIds = [...existingWinners, ...newlySelected];
  updateGuild(interaction.guild.id, d => {
    const g = d.giveaways.find(g => g.id === giveawayId);
    if (g) {
      g.winnerIds = winnerIds;
      g.winnerId = winnerIds[0];
    }
  });

  const mentions = winnerIds.map(id => `<@${id}>`).join(', ');
  await interaction.reply({ content: `🎯 **Winner${winnerIds.length !== 1 ? 's' : ''} selected:** ${mentions}\n**Giveaway:** ${giveaway.prize}\n\nThese winner${winnerIds.length !== 1 ? 's are' : ' is'} now locked in.`, ephemeral: true });

  const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    const updatedGiveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId) ?? giveaway;
    if (msg) {
      await msg.edit({ embeds: [buildGiveawayEmbed(updatedGiveaway)], components: [buildGiveawayRow(updatedGiveaway.id, updatedGiveaway.entries.length, updatedGiveaway.hideEntryCount)] }).catch(() => undefined);
    }
    await channel.send({ content: `🎯 **Winner${winnerIds.length !== 1 ? 's' : ''} selected:** ${mentions} — locked in! 🎉`, allowedMentions: { users: winnerIds }}).catch(() => undefined);
  }
}
