import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Message,
} from 'discord.js';
import type { Command } from '../types.js';

const pending = new Map<string, { guildId: string; userId: string; expiresAt: number }>();

function makeKey(guildId: string, userId: string) {
  return `clear-channels:${guildId}:${userId}`;
}

function confirmationRow(guildId: string, userId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`clearchannels:confirm:${guildId}:${userId}`).setLabel('Yes, clear all').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`clearchannels:cancel:${guildId}:${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
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
    pending.set(key, { guildId: interaction.guild.id, userId: interaction.user.id, expiresAt: Date.now() + 60_000 });

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Clear All Channels?')
        .setDescription('This will permanently delete **all channels and categories that the bot is allowed to delete**. This cannot be undone.\n\nPress **Yes, clear all** within 60 seconds to continue.')],
      components: [confirmationRow(interaction.guild.id, interaction.user.id)],
      flags: 64,
    });
  },
};

// Prefix equivalent: .clearchannels (or the server's configured prefix).
export async function handleClearChannelsPrefix(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply('❌ You need **Manage Channels** permission to use this command.').catch(() => undefined);
    return true;
  }
  const me = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply('❌ I need the **Manage Channels** permission to do this.').catch(() => undefined);
    return true;
  }

  const key = makeKey(message.guild.id, message.author.id);
  pending.set(key, { guildId: message.guild.id, userId: message.author.id, expiresAt: Date.now() + 60_000 });
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('⚠️ Clear All Channels?')
      .setDescription('This will permanently delete **all channels and categories that the bot is allowed to delete**. This cannot be undone.\n\nPress **Yes, clear all** within 60 seconds to continue.')],
    components: [confirmationRow(message.guild.id, message.author.id)],
  }).catch(() => undefined);
  return true;
}

export async function handleClearChannelsButton(interaction: any): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('clearchannels:')) return false;

  const [, action, guildId, userId] = interaction.customId.split(':');
  const key = makeKey(guildId, userId);
  const request = pending.get(key);

  if (!request || request.expiresAt < Date.now()) {
    pending.delete(key);
    await interaction.reply({ content: '❌ This confirmation expired. Run `/clearchannels` or `.clearchannels` again.', flags: 64 });
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
  if (action !== 'confirm' || !interaction.guild) return true;

  const guild = interaction.guild;
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.update({ content: '❌ I no longer have the **Manage Channels** permission.', embeds: [], components: [] });
    return true;
  }

  await interaction.update({ content: '⏳ Clearing deletable channels and categories...', embeds: [], components: [] });
  await guild.channels.fetch();
  const channels = [...guild.channels.cache.values()]
    .filter(channel => channel && channel.type !== ChannelType.GuildDirectory)
    .sort((a, b) => {
      const aCategory = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bCategory = b.type === ChannelType.GuildCategory ? 1 : 0;
      return aCategory - bCategory;
    });

  let deleted = 0;
  let failed = 0;
  for (const channel of channels) {
    if (!channel.deletable) { failed++; continue; }
    try {
      await channel.delete(`Cleared by ${interaction.user.tag} using clear channels`);
      deleted++;
    } catch {
      failed++;
    }
  }

  await interaction.editReply(`✅ **Channel clear complete.** Deleted **${deleted}** channel(s)/category(s).${failed ? ` Could not delete **${failed}** protected or unavailable item(s).` : ''}`);
  return true;
}
