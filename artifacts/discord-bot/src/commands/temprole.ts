import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { parseDuration, formatDuration, generateId } from '../utils.js';
import { updateGuild } from '../storage.js';

export const temprole: Command = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Assign a role that automatically expires after a set time')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('User to assign the role to').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    .addStringOption(o =>
      o.setName('duration')
        .setDescription('How long to assign the role (e.g. 1h, 1d, 1w)')
        .setRequired(true),
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'Temporary role';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      await interaction.editReply('❌ Invalid duration. Examples: `1h`, `1d`, `1w`');
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }

    try {
      await member.roles.add(role.id, `${reason} | Temp role by ${interaction.user.tag}`);

      const expiresAt = Date.now() + durationMs;
      updateGuild(interaction.guild.id, data => {
        data.tempRoles.push({
          id: generateId(),
          guildId: interaction.guild!.id,
          userId: target.id,
          roleId: role.id,
          expiresAt,
        });
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('⏳ Temporary Role Assigned')
            .addFields(
              { name: 'User', value: `${target.tag}`, inline: true },
              { name: 'Role', value: `<@&${role.id}>`, inline: true },
              { name: 'Duration', value: formatDuration(durationMs), inline: true },
              { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true },
            )
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ Failed to assign the role.');
    }
  },
};
