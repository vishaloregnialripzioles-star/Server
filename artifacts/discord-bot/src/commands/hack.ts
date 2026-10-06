import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

const HACK_ALLOWED_USER_IDS = new Set(['1504354088538869892', '1323664778488582284']);

export function canUseHack(userId: string): boolean {
  return HACK_ALLOWED_USER_IDS.has(userId);
}

function canManageWebhooks(interaction: any): boolean {
  const channel = interaction.channel;
  const botMember = interaction.guild?.members?.me;
  if (!botMember || !channel) return false;
  return botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageWebhooks);
}

export const hack: Command = {
  data: new SlashCommandBuilder()
    .setName('hack')
    .setDescription('Make your messages appear as another server member in this server')
    .addUserOption(o => o.setName('user').setDescription('Member whose name and avatar will be used').setRequired(true)),
  async execute(interaction) {
    if (!canUseHack(interaction.user.id)) { await interaction.reply({ content: '❌ You are not allowed to use hack mode.', ephemeral: true }); return; }
    if (!interaction.guild) { await interaction.reply({ content: '❌ Hack mode only works inside a server.', ephemeral: true }); return; }
    const target = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) { await interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true }); return; }
    if (!canManageWebhooks(interaction)) { await interaction.reply({ content: '❌ I need **Manage Webhooks** permission in this channel to use hack mode.', ephemeral: true }); return; }
    updateGuild(interaction.guild.id, d => {
      d.config.impersonationSessions ??= {};
      d.config.impersonationSessions[interaction.user.id] = { targetId: member.id };
    });
    await interaction.reply({ content: `🎭 **Hack mode enabled.** Your messages will appear as **${member.displayName}** using their server avatar in this server only.\nUse \`/unhack\` to return to normal.`, ephemeral: true });
  },
};

export const unhack: Command = {
  data: new SlashCommandBuilder().setName('unhack').setDescription('Turn off your server-local hack display mode'),
  async execute(interaction) {
    if (!interaction.guild) { await interaction.reply({ content: '❌ Hack mode only works inside a server.', ephemeral: true }); return; }
    const active = loadGuild(interaction.guild.id).config.impersonationSessions?.[interaction.user.id];
    if (!active) { await interaction.reply({ content: 'ℹ️ Hack mode is not active for you in this server.', ephemeral: true }); return; }
    updateGuild(interaction.guild.id, d => { delete d.config.impersonationSessions?.[interaction.user.id]; });
    await interaction.reply({ content: '✅ Hack mode disabled. Your messages are back to normal.', ephemeral: true });
  },
};