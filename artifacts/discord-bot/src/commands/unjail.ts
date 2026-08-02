import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { sendLog } from '../utils.js';
import { loadGuild } from '../storage.js';

export const unjail: Command = {
  data: new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Release a member from Jail')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('User to unjail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const data = loadGuild(interaction.guild.id);
    if (!data.config.jailRole) {
      await interaction.editReply('❌ No jail role configured. Use `/setup jailrole` first.');
      return;
    }

    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.editReply('❌ User not found in this server.');
      return;
    }

    try {
      await member.roles.remove(data.config.jailRole, `${reason} | Mod: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0x00CC44)
        .setTitle('🔓 Member Released from Jail')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendLog(interaction.guild, embed);
    } catch {
      await interaction.editReply('❌ Failed to unjail this user.');
    }
  },
};
