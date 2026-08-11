import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isOwnerOrExtraOwner } from '../security.js';

export const antinuke: Command = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Protect the server from unauthorized bot invites and role changes')
    .addSubcommand(sub => sub.setName('enable').setDescription('Enable anti-nuke protection'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable anti-nuke protection'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show anti-nuke status and whitelist'))
    .addSubcommandGroup(group => group
      .setName('whitelist')
      .setDescription('Manage anti-nuke trusted members')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Whitelist a member from anti-nuke punishment')
        .addUserOption(o => o.setName('user').setDescription('Member to whitelist').setRequired(true)))
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Remove a member from the anti-nuke whitelist')
        .addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true)))),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the server owner or an extra owner can manage anti-nuke.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guildId = interaction.guild.id;

    if (sub === 'enable') {
      const current = loadGuild(guildId);
      if (current.antiNuke.enabled) {
        await interaction.reply({
          content: 'ℹ️ Anti-nuke is already **enabled**. Use `/antinuke disable` first if you want to turn it off.',
          ephemeral: true,
        });
        return;
      }

      const me = interaction.guild.members.me;
      const requiredPermissions = [
        [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
        [PermissionFlagsBits.BanMembers, 'Ban Members'],
        [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
      ] as const;
      const missingPermissions = me
        ? requiredPermissions.filter(([permission]) => !me.permissions.has(permission))
        : requiredPermissions;

      if (missingPermissions.length) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🛡️ Anti-Nuke Configuration')
          .setDescription('I cannot enable anti-nuke yet because I am missing the permissions required to protect the server.')
          .addFields(
            { name: 'Status', value: '🔴 Disabled', inline: true },
            { name: 'Missing Permissions', value: missingPermissions.map(([, name]) => `• ${name}`).join('\n') },
            { name: 'What to do', value: 'Give my bot the permissions above, then run `/antinuke enable` again.' },
          );
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🛡️ Anti-Nuke Configuration')
        .setDescription('Anti-nuke is currently disabled. Do you want to enable protection for this server?')
        .addFields(
          { name: 'Status', value: '🔴 Disabled', inline: true },
          { name: 'Protection', value: 'Unauthorized bot invites and protected role changes will be punished.' },
          { name: 'Trusted', value: 'Server owner, extra owners and anti-nuke whitelist members are excluded.' },
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`antinuke_enable_confirm:${interaction.user.id}`)
          .setLabel('Enable Anti-Nuke')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`antinuke_enable_cancel:${interaction.user.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      try {
        const confirmation = await interaction.awaitMessageComponent({
          filter: component => component.user.id === interaction.user.id,
          time: 30_000,
        });

        if (confirmation.customId === `antinuke_enable_confirm:${interaction.user.id}`) {
          updateGuild(guildId, data => { data.antiNuke.enabled = true; });
          const enabledEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('🛡️ Anti-Nuke Configuration')
            .addFields(
              { name: 'Status', value: '🟢 Enabled', inline: true },
              { name: 'Requested by', value: `${interaction.user}` },
            );
          await confirmation.update({ embeds: [enabledEmbed], components: [] });
        } else {
          await confirmation.update({
            content: '❌ Anti-nuke was not enabled.',
            embeds: [],
            components: [],
          });
        }
      } catch {
        await interaction.editReply({
          content: '⌛ Confirmation timed out. Anti-nuke was **not enabled**.',
          embeds: [],
          components: [],
        });
      }
      return;
    }

    if (sub === 'disable') {
      updateGuild(guildId, data => { data.antiNuke.enabled = false; });
      await interaction.reply(`🛡️ Anti-nuke is now **disabled**.`);
      return;
    }

    if (group === 'whitelist' && (sub === 'add' || sub === 'remove')) {
      const user = interaction.options.getUser('user', true);
      if (user.id === interaction.guild.ownerId || user.id === interaction.client.user.id) {
        await interaction.reply({ content: '❌ The server owner and bot are always trusted.', ephemeral: true });
        return;
      }
      const adding = sub === 'add';
      let changed = false;
      updateGuild(guildId, data => {
        const has = data.antiNuke.whitelist.includes(user.id);
        if (adding && !has) { data.antiNuke.whitelist.push(user.id); changed = true; }
        if (!adding && has) { data.antiNuke.whitelist = data.antiNuke.whitelist.filter(id => id !== user.id); changed = true; }
      });
      await interaction.reply(changed
        ? `${adding ? '✅ Added' : '✅ Removed'} ${user} ${adding ? 'to' : 'from'} the anti-nuke whitelist.`
        : `ℹ️ ${user} is already ${adding ? 'whitelisted' : 'not whitelisted'}.`);
      return;
    }

    const data = loadGuild(guildId);
    const whitelist = data.antiNuke.whitelist.length
      ? data.antiNuke.whitelist.map(id => `<@${id}>`).join(', ')
      : 'Nobody';
    const embed = new EmbedBuilder()
      .setColor(data.antiNuke.enabled ? 0x2ecc71 : 0xe74c3c)
      .setTitle('🛡️ Anti-Nuke Status')
      .addFields(
        { name: 'Status', value: data.antiNuke.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { name: 'Whitelist', value: whitelist },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
