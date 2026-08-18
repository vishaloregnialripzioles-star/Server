import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

function keyForEmoji(value: string): string { const custom = value.match(/^<a?:[^:>]+:(\d+)>$/); return custom?.[1] ?? value; }

export const reactionrole: Command = {
  data: new SlashCommandBuilder()
    .setName('reactionrole').setDescription('Configure reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName('add').setDescription('Map an emoji on a message to a role').addStringOption(o => o.setName('message').setDescription('Message ID').setRequired(true)).addStringOption(o => o.setName('emoji').setDescription('Emoji, e.g. 👍 or <:name:id>').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a reaction-role mapping').addStringOption(o => o.setName('message').setDescription('Message ID').setRequired(true)).addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List configured reaction roles')),
  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const data = loadGuild(interaction.guild.id); data.config.reactionRoles ??= {};
    if (sub === 'list') {
      const rows = Object.entries(data.config.reactionRoles).flatMap(([message, items]) => Object.entries(items).map(([emoji, role]) => `\`${message}\` · ${emoji} → <@&${role}>`));
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Reaction Roles').setDescription(rows.join('\n') || 'No reaction roles configured.').setTimestamp()] }); return;
    }
    const messageId = interaction.options.getString('message', true); const rawEmoji = interaction.options.getString('emoji', true); const emoji = keyForEmoji(rawEmoji);
    if (sub === 'remove') {
      updateGuild(interaction.guild.id, d => { d.config.reactionRoles ??= {}; if (d.config.reactionRoles[messageId]) delete d.config.reactionRoles[messageId][emoji]; if (d.config.reactionRoles[messageId] && !Object.keys(d.config.reactionRoles[messageId]).length) delete d.config.reactionRoles[messageId]; });
      await interaction.reply({ content: 'Reaction role removed.', ephemeral: true }); return;
    }
    const role = interaction.options.getRole('role', true); const channel = interaction.channel;
    if (!channel?.isTextBased()) { await interaction.reply({ content: 'This command must be used in a text channel.', ephemeral: true }); return; }
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) { await interaction.reply({ content: 'I could not find that message in this channel.', ephemeral: true }); return; }
    const me = interaction.guild.members.me;
    if (me && me.roles.highest.position <= role.position) { await interaction.reply({ content: 'My highest role must be above the reaction role.', ephemeral: true }); return; }
    try { await message.react(rawEmoji); } catch { await interaction.reply({ content: 'I could not add that reaction. Check the emoji and my permissions.', ephemeral: true }); return; }
    updateGuild(interaction.guild.id, d => { d.config.reactionRoles ??= {}; d.config.reactionRoles[messageId] ??= {}; d.config.reactionRoles[messageId][emoji] = role.id; });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Reaction Role Added').setDescription(`${rawEmoji} on [the configured message](${message.url}) gives ${role}.`).setTimestamp()] });
  },
};
