import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../types.js';

const pending = new Map<string, { guildId: string; userId: string; expiresAt: number }>();

function makeKey(guildId: string, userId: string) {
  return `clear-channels:${guildId}:${userId}`;
}

export const clearchannels: Command = {
  data: new SlashCommandBuilder()
    .setName('clearchannels')
    .setDescription('Delete all deletable channels and categories in this server'),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', flags: 64 });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: '❌ You need the **Manage Channels** permission to use this command.', flags: 64 });
      return;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: '❌ I need the **Manage Channels** permission to do this.', flags: 64 });
      return;
    }

    const key = makeKey(interaction.guild.id, interaction.user.id);
    pending.set(key, {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      expiresAt: Date.now() + 60_000,
    });

    const confirmId = `clearchannels:confirm:${interaction.guild.id}:${interaction.user.id}`;
    const cancelId = `clearchannels:cancel:${interaction.guild.id}:${interaction.user.id}`;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('Yes, clear all').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Clear All Channels?')
        .setDescription('This will permanently delete **all channels and categories that the bot is allowed to delete**. This cannot be undone.\n\nPress **Yes, clear all** within 60 seconds to continue.')],
      components: [row],
      flags: 64,
    });
  },
};

export async function handleClearChannelsButton(interaction: any): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('clearchannels:')) return false;

  const [, action, guildId, userId] = interaction.customId.split(':');
  const key = makeKey(guildId, userId);
  const request = pending.get(key);

  if (!request || request.expiresAt < Date.now()) {
    pending.delete(key);
    await interaction.reply({ content: '❌ This confirmation expired. Run `/clearchannels` again.', flags: 64 });
    return true;
  }

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '❌ Only the person who started this command can use these buttons.', flags: 64 });
    return true;
  }

  if (interaction.guildId !== guildId) {
    await interaction.reply({ content: '❌ Invalid server.', flags: 64 });
    return true;
  }

  pending.delete(key);

  if (action === 'cancel') {
    await interaction.update({ content: '✅ Channel clearing cancelled.', embeds: [], components: [] });
    return true;
  }

  if (action !== 'confirm' || !interaction.guild) {
    return true;
  }

  const guild = interaction.guild;
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.update({ content: '❌ I no longer have the **Manage Channels** permission.', embeds: [], components: [] });
    return true;
  }

  await interaction.update({
    content: '⏳ Clearing deletable channels and categories...',
    embeds: [],
    components: [],
  });

  await guild.channels.fetch();
  const channels = [...guild.channels.cache.values()]
    .filter((channel) => channel && channel.type !== ChannelType.GuildDirectory)
    .sort((a, b) => {
      // Delete normal channels first, categories last.
      const aCategory = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bCategory = b.type === ChannelType.GuildCategory ? 1 : 0;
      return aCategory - bCategory;
    });

  let deleted = 0;
  let failed = 0;
  for (const channel of channels) {
    if (!channel.deletable) {
      failed++;
      continue;
    }
    try {
      await channel.delete(`Cleared by ${interaction.user.tag} using /clearchannels`);
      deleted++;
    } catch {
      failed++;
    }
  }

  await interaction.editReply(`✅ **Channel clear complete.** Deleted **${deleted}** channel(s)/category(s).${failed ? ` Could not delete **${failed}** protected or unavailable item(s).` : ''}`);
  return true;
}
