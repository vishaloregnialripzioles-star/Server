import {
  ActionRowBuilder,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import { pendingGiveaways, preselectedGiveawayWinners } from '../giveawaySetup.js';

function isOwner(interaction: ButtonInteraction | UserSelectMenuInteraction): boolean {
  const ownerId = (process.env.OWNER_USER_ID ?? '').trim();
  return Boolean(ownerId) && interaction.user.id === ownerId;
}

export async function handleGiveawayPreselectButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith('gwcfg_selectwinner:') || !interaction.guild) return;
  if (!isOwner(interaction)) {
    await interaction.reply({ content: '❌ Only the bot owner can select a giveaway winner.', ephemeral: true });
    return;
  }
  const userId = interaction.customId.slice('gwcfg_selectwinner:'.length);
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '❌ This is not your giveaway setup panel.', ephemeral: true });
    return;
  }
  if (!pendingGiveaways.has(userId)) {
    await interaction.reply({ content: '❌ Setup session expired. Run `/giveaway create` again.', ephemeral: true });
    return;
  }
  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`gwcfg_selectwinner_user:${userId}`)
      .setPlaceholder('👤 Select the member to guarantee if they enter')
      .setMinValues(1)
      .setMaxValues(1),
  );
  await interaction.reply({ content: '🎯 **Pre-select a winner**\nIf this member enters the giveaway, they will be the winner. If they do not enter, the winner will be random.', components: [row], ephemeral: true });
}

export async function handleGiveawayPreselectUser(interaction: UserSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith('gwcfg_selectwinner_user:') || !interaction.guild) return;
  if (!isOwner(interaction)) {
    await interaction.reply({ content: '❌ Only the bot owner can select a giveaway winner.', ephemeral: true });
    return;
  }
  const userId = interaction.customId.slice('gwcfg_selectwinner_user:'.length);
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '❌ This is not your giveaway setup panel.', ephemeral: true });
    return;
  }
  const pending = pendingGiveaways.get(userId);
  if (!pending) {
    await interaction.update({ content: '❌ Setup session expired. Run `/giveaway create` again.', components: [] });
    return;
  }
  const selectedId = interaction.values[0];
  const member = await interaction.guild.members.fetch(selectedId).catch(() => null);
  if (!member) {
    await interaction.update({ content: '❌ That member could not be found in this server.', components: [] });
    return;
  }
  preselectedGiveawayWinners.set(userId, selectedId);
  await interaction.update({ content: `✅ Pre-selected **${member.user.tag}**.\nIf they enter, they will win. If they do not enter, the giveaway will choose a random winner.`, components: [] });
}
