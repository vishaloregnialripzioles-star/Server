import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const hack: Command = {
  data: new SlashCommandBuilder()
    .setName('hack')
    .setDescription('Make your messages appear as another server member')
    .addUserOption(o => o.setName('user').setDescription('Member to display as').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
      return;
    }
    const botMember = interaction.guild!.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
      await interaction.reply({ content: '❌ I need **Manage Webhooks** permission to use hack mode.', ephemeral: true });
      return;
    }
    updateGuild(interaction.guild!.id, d => {
      (d as any).__impersonationSessions ??= {};
      (d as any).__impersonationSessions[interaction.user.id] = { targetId: target.id };
    });
    await interaction.reply({
      content: `🎭 **Hack mode enabled.** Your messages will appear as **${member.displayName}** in this server only.\nUse \`/unhack\` to return to normal.`,
      ephemeral: true,
    });
  },
};

export const unhack: Command = {
  data: new SlashCommandBuilder()
    .setName('unhack')
    .setDescription('Turn off hack display mode'),
  async execute(interaction) {
    const data = loadGuild(interaction.guild!.id) as any;
    if (!data.__impersonationSessions?.[interaction.user.id]) {
      await interaction.reply({ content: 'ℹ️ Hack mode is not active for you in this server.', ephemeral: true });
      return;
    }
    updateGuild(interaction.guild!.id, d => {
      delete (d as any).__impersonationSessions?.[interaction.user.id];
    });
    await interaction.reply({ content: '✅ Hack mode disabled. You are back to normal.', ephemeral: true });
  },
};
