import type { ButtonInteraction } from 'discord.js';
import { loadGuild, updateGuild } from '../storage.js';
import { pickWinners, buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';

export async function handleGiveawayAdminWinnerButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith('gwadmin_selectwinner:') || !interaction.guild) return;

  const ownerId = (process.env.OWNER_USER_ID ?? '').trim();
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({ content: '❌ Only the bot owner can select a giveaway winner.', ephemeral: true });
    return;
  }

  const giveawayId = interaction.customId.slice('gwadmin_selectwinner:'.length);
  const giveaway = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
  if (!giveaway) {
    await interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
    return;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: '❌ This giveaway has already ended.', ephemeral: true });
    return;
  }
  if (giveaway.entries.length === 0) {
    await interaction.reply({ content: '❌ There are no participants yet.', ephemeral: true });
    return;
  }

  const existing = [...new Set(giveaway.winnerIds ?? (giveaway.winnerId ? [giveaway.winnerId] : []))]
    .filter(id => giveaway.entries.includes(id));
  const needed = Math.max(0, (giveaway.winnerCount ?? 1) - existing.length);
  if (needed === 0) {
    await interaction.reply({ content: `🎯 Winner${existing.length !== 1 ? 's' : ''} already selected: ${existing.map(id => `<@${id}>`).join(', ')}`, ephemeral: true });
    return;
  }

  const selected = await pickWinners(interaction.guild, giveaway, needed, existing);
  if (!selected.length) {
    await interaction.reply({ content: '❌ Could not select an eligible winner.', ephemeral: true });
    return;
  }

  const winnerIds = [...existing, ...selected];
  updateGuild(interaction.guild.id, data => {
    const g = data.giveaways.find(g => g.id === giveawayId);
    if (g) {
      g.winnerIds = winnerIds;
      g.winnerId = winnerIds[0];
    }
  });

  const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId) ?? giveaway;
  const mentions = winnerIds.map(id => `<@${id}>`).join(', ');
  await interaction.update({
    embeds: [buildGiveawayEmbed(updated)],
    components: [buildGiveawayRow(updated.id, updated.entries.length, updated.hideEntryCount)],
  });
  await interaction.followUp({
    content: `🏆 Winner${winnerIds.length !== 1 ? 's' : ''} selected: ${mentions}\nThe winner${winnerIds.length !== 1 ? 's are' : ' is'} locked in.`,
    ephemeral: true,
  });
}
