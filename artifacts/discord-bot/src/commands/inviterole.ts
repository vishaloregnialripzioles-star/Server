import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const inviterole: Command = {
  data: new SlashCommandBuilder().setName('inviterole').setDescription('Manage automatic roles for valid invite milestones')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addSubcommand(s => s.setName('add').setDescription('Set a role for an invite milestone')
      .addIntegerOption(o => o.setName('invites').setDescription('Required valid invites').setMinValue(1).setMaxValue(100000).setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to give at this milestone').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove an invite milestone')
      .addIntegerOption(o => o.setName('invites').setDescription('Invite milestone').setMinValue(1).setMaxValue(100000).setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show configured invite roles')),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply({ content: '❌ Server only.', ephemeral: true }); return; }
    if (interaction.guild?.ownerId !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ Only the server owner or an Administrator can manage invite roles.', ephemeral: true }); return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const invites = interaction.options.getInteger('invites', true);
      const role = interaction.options.getRole('role', true);
      if (role.managed) { await interaction.reply({ content: '❌ A managed/integration role cannot be assigned by the bot.', ephemeral: true }); return; }
      updateGuild(interaction.guildId, d => { d.config.inviteRoles ??= {}; d.config.inviteRoles[String(invites)] = role.id; });
      await interaction.reply(`✅ **${invites} valid invites** → ${role}.\nThe bot will automatically give this role when the member reaches the milestone.`);
      return;
    }
    if (sub === 'remove') {
      const invites = interaction.options.getInteger('invites', true);
      updateGuild(interaction.guildId, d => { if (d.config.inviteRoles) delete d.config.inviteRoles[String(invites)]; });
      await interaction.reply(`✅ Removed the **${invites}-invite** role milestone.`);
      return;
    }
    const mappings = loadGuild(interaction.guildId).config.inviteRoles ?? {};
    const rows = Object.entries(mappings).sort((a,b) => Number(a[0]) - Number(b[0]));
    await interaction.reply(rows.length ? `📈 **Auto Invite Roles**\n${rows.map(([n,id]) => `• **${n} valid invites** → <@&${id}>`).join('\n')}` : '📈 No auto invite roles are configured. Use `/inviterole add`.');
  },
};
