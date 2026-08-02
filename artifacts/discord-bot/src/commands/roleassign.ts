import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const roleassign: Command = {
  data: new SlashCommandBuilder()
    .setName('roleassign')
    .setDescription('Assign or remove a role from a server member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('member').setDescription('The member to assign the role to').setRequired(true),
    )
    .addRoleOption(o =>
      o.setName('role').setDescription('The role to assign or remove').setRequired(true),
    )
    .addStringOption(o =>
      o.setName('action')
        .setDescription('Add or remove the role (default: add)')
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('member', true);
    const role = interaction.options.getRole('role', true);
    const action = interaction.options.getString('action') ?? 'add';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ That user is not in this server.');
      return;
    }

    // Hierarchy check
    const botMember = interaction.guild.members.me;
    if (botMember && botMember.roles.highest.position <= role.position) {
      await interaction.editReply('❌ I cannot manage that role — it is higher than or equal to my highest role.');
      return;
    }

    const issuerMember = interaction.guild.members.cache.get(interaction.user.id);
    if (issuerMember && issuerMember.roles.highest.position <= role.position && interaction.guild.ownerId !== interaction.user.id) {
      await interaction.editReply('❌ You cannot assign a role that is higher than or equal to your highest role.');
      return;
    }

    try {
      if (action === 'add') {
        if (member.roles.cache.has(role.id)) {
          await interaction.editReply(`ℹ️ <@${target.id}> already has <@&${role.id}>.`);
          return;
        }
        await member.roles.add(role.id, `Role assigned by ${interaction.user.tag}`);
      } else {
        if (!member.roles.cache.has(role.id)) {
          await interaction.editReply(`ℹ️ <@${target.id}> does not have <@&${role.id}>.`);
          return;
        }
        await member.roles.remove(role.id, `Role removed by ${interaction.user.tag}`);
      }

      const embed = new EmbedBuilder()
        .setColor(action === 'add' ? 0x00CC44 : 0xFF3333)
        .setTitle(action === 'add' ? '✅ Role Assigned' : '❌ Role Removed')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Member', value: `<@${target.id}>`, inline: true },
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'Action', value: action === 'add' ? 'Added' : 'Removed', inline: true },
          { name: 'By', value: interaction.user.tag, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Failed to modify the role. Check my permissions.');
    }
  },
};
