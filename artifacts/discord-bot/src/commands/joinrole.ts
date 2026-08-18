import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const joinrole: Command = {
  data: new SlashCommandBuilder()
    .setName('joinrole')
    .setDescription('Configure the role automatically given to new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('set').setDescription('Set the automatic join role').addRoleOption(o => o.setName('role').setDescription('Role to give on join').setRequired(true)))
    .addSubcommand(s => s.setName('enable').setDescription('Enable the join role'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the join role'))
    .addSubcommand(s => s.setName('view').setDescription('View the current join role')),
  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const role = interaction.options.getRole('role', true);
      updateGuild(interaction.guild.id, d => { d.config.joinRole = { enabled: true, roleId: role.id }; });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Join Role Updated').setDescription(`New members will receive ${role}.`).setTimestamp()] });
      return;
    }
    if (sub === 'enable' || sub === 'disable') {
      updateGuild(interaction.guild.id, d => { d.config.joinRole ??= { enabled: false }; d.config.joinRole.enabled = sub === 'enable'; });
      await interaction.reply({ content: sub === 'enable' ? 'Join Role enabled.' : 'Join Role disabled.', ephemeral: true });
      return;
    }
    const x = loadGuild(interaction.guild.id).config.joinRole;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Join Role').setDescription(x?.roleId ? `${x.enabled ? 'Enabled' : 'Disabled'} — <@&${x.roleId}>` : 'No join role is configured.').setTimestamp()] });
  },
};
