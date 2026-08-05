import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

export const createrole: Command = {
  data: new SlashCommandBuilder()
    .setName('createrole')
    .setDescription('Create a new role with optional color and hierarchy placement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o =>
      o.setName('name').setDescription('Name of the role').setRequired(true).setMaxLength(100),
    )
    .addStringOption(o =>
      o.setName('color').setDescription('Hex color code (e.g. #FF5733 or FF5733)'),
    )
    .addBooleanOption(o =>
      o.setName('high_position')
        .setDescription('Place role high in hierarchy (below my top role) so its color displays'),
    )
    .addUserOption(o =>
      o.setName('give_to').setDescription('Optionally assign the new role to this member right away'),
    )
    .addBooleanOption(o =>
      o.setName('mentionable').setDescription('Allow anyone to mention this role'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const name = interaction.options.getString('name', true);
    const colorInput = interaction.options.getString('color');
    const highPosition = interaction.options.getBoolean('high_position') ?? false;
    const mentionable = interaction.options.getBoolean('mentionable') ?? false;
    const giveToUser = interaction.options.getUser('give_to');

    // Parse and validate hex color
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
      // Create role with no permissions (0n) so it's cosmetic/display only
      const role = await interaction.guild.roles.create({
        name,
        color,
        hoist: false,
        mentionable,
        permissions: 0n,
        reason: `Created by ${interaction.user.tag} via /createrole`,
      });

      // If high_position, move role just below the bot's highest role so colors display
      let positionNote = 'Bottom (default)';
      if (highPosition) {
        const botMember = interaction.guild.members.me;
        if (botMember) {
          const botTop = botMember.roles.highest.position;
          if (botTop > 1) {
            await role.setPosition(botTop - 1).catch(() => null);
            positionNote = `High (below my top role, position ~${botTop - 1})`;
          }
        }
      }

      const displayColor = color !== undefined
        ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`
        : 'Default';

      // Optionally assign the role to a member
      let assignedTo = 'Nobody';
      if (giveToUser) {
        const targetMember = await interaction.guild.members.fetch(giveToUser.id).catch(() => null);
        if (targetMember) {
          await targetMember.roles.add(role.id, `Role assigned by ${interaction.user.tag} via /createrole`).catch(() => null);
          assignedTo = `<@${giveToUser.id}>`;
        } else {
          assignedTo = '⚠️ User not in server';
        }
      }

      const embed = new EmbedBuilder()
        .setColor(role.color || 0x5865F2)
        .setTitle('✅ Role Created')
        .addFields(
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'Name', value: role.name, inline: true },
          { name: 'Color', value: displayColor, inline: true },
          { name: 'Position', value: positionNote, inline: true },
          { name: 'Permissions', value: 'None (cosmetic)', inline: true },
          { name: 'Mentionable', value: mentionable ? 'Yes' : 'No', inline: true },
          { name: 'Given To', value: assignedTo, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Failed to create the role. Make sure I have the **Manage Roles** permission and my top role is above where new roles are created.');
    }
  },
};
