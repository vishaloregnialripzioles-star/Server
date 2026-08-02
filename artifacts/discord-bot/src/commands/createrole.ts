import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const createrole: Command = {
  data: new SlashCommandBuilder()
    .setName('createrole')
    .setDescription('Create a new role in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o =>
      o.setName('name').setDescription('Name of the role').setRequired(true).setMaxLength(100),
    )
    .addStringOption(o =>
      o.setName('color')
        .setDescription('Hex color code (e.g. #FF5733 or FF5733)'),
    )
    .addBooleanOption(o =>
      o.setName('hoist').setDescription('Display role members separately in the member list'),
    )
    .addBooleanOption(o =>
      o.setName('mentionable').setDescription('Allow anyone to mention this role'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const name = interaction.options.getString('name', true);
    const colorInput = interaction.options.getString('color');
    const hoist = interaction.options.getBoolean('hoist') ?? false;
    const mentionable = interaction.options.getBoolean('mentionable') ?? false;

    let color: number | undefined;
    if (colorInput) {
      const hex = colorInput.replace('#', '');
      const parsed = parseInt(hex, 16);
      if (isNaN(parsed) || hex.length !== 6) {
        await interaction.editReply('❌ Invalid color. Use a 6-character hex code like `#FF5733`.');
        return;
      }
      color = parsed;
    }

    try {
      const role = await interaction.guild.roles.create({
        name,
        color,
        hoist,
        mentionable,
        reason: `Created by ${interaction.user.tag} via /createrole`,
      });

      const embed = new EmbedBuilder()
        .setColor(role.color || 0x5865F2)
        .setTitle('✅ Role Created')
        .addFields(
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'Name', value: role.name, inline: true },
          { name: 'Color', value: colorInput ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` : 'Default', inline: true },
          { name: 'Hoisted', value: hoist ? 'Yes' : 'No', inline: true },
          { name: 'Mentionable', value: mentionable ? 'Yes' : 'No', inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Failed to create the role. Make sure I have the **Manage Roles** permission and my role is above where you want the new role.');
    }
  },
};
