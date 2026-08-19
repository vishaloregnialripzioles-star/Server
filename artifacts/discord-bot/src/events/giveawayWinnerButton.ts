import type { ButtonInteraction } from 'discord.js';
import { loadGuild } from '../storage.js';
import { pickWinners, buildGiveawayEmbed, buildGiveawayRow } from '../giveawayUtils.js';
import type { Giveaway } from '../types.js';

const ALLOWED_USERNAMES = new Set(['vishal.lost_1', 'karan.ghost_']);

export async function handleGiveawayWinnerButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith('giveaway_select_winner:') || !interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const allowed = interaction.user.id === interaction.guild.ownerId || ALLOWED_USERNAMES.has(interaction.user.username);
  if (!allowed) {
    await interaction.reply({ content: '❌ You are not allowed to select a giveaway winner.', ephemeral: true });
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

  const winners = await pickWinners(interaction.guild, giveaway, giveaway.winnerCount ?? 1);
  if (winners.length === 0) {
    await interaction.reply({ content: '❌ Could not select an eligible winner.', ephemeral: true });
    return;
  }

  const mentions = winners.map(id => `<@${id}>`).join(', ');
  await interaction.reply({
    content: `🎯 **Winner${winners.length !== 1 ? 's' : ''} selected:** ${mentions}\n**Giveaway:** ${giveaway.prize}\n\nThe giveaway remains active; no entries, timer, or giveaway state were changed.`,
    ephemeral: true,
  });

  const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildGiveawayRow(giveaway.id, giveaway.entries.length, giveaway.hideEntryCount)],
      }).catch(() => undefined);
    }
    await channel.send({
      content: `🎯 **Winner selected:** ${mentions} — congratulations! 🎉\n*This giveaway is still active and can continue accepting entries.*`,
      allowedMentions: { users: winners },
    }).catch(() => undefined);
  }
}
