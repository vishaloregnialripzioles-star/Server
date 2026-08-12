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

const REQUIRED_PERMISSIONS = [
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
] as const;

const REQUIRED_PERMISSION_VALUE = REQUIRED_PERMISSIONS.reduce((value, [permission]) => value | BigInt(permission), 0n);

function permissionsInviteUrl(guildId: string): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${REQUIRED_PERMISSION_VALUE.toString()}&scope=bot%20applications.commands&guild_id=${encodeURIComponent(guildId)}`;
}

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
      await interaction.reply({ content: '🔒 Only the **server owner** or an **extra owner** can manage anti-nuke.', ephemeral: true });
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

      const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
      const missingPermissions = me
        ? REQUIRED_PERMISSIONS.filter(([permission]) => !me.permissions.has(permission))
        : REQUIRED_PERMISSIONS;

      const tosEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('🚨 Important Note')
        .setDescription(
          '**Anti-Nuke Protection**\n\n' +
          '➤ Sparxie cannot guarantee full protection if a person or bot has the **same or higher role** than the bot.\n\n' +
          '➤ Whitelisted users are trusted and will not be punished by anti-nuke.\n\n' +
          '➤ For strongest protection, keep the bot role **above all normal member/moderation roles** and only whitelist people you trust.\n\n' +
          '➤ When you press **Agree TOS**, the bot automatically checks its required permissions. It can only use permissions Discord has already granted to the bot; it cannot grant itself Administrator or bypass Discord role hierarchy.'
        )
        .addFields({
          name: 'Required permissions',
          value: REQUIRED_PERMISSIONS.map(([, name]) => `• ${name}`).join('\n'),
        })
        .setFooter({ text: `Requested by ${interaction.user.tag}` });

      const tosRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`antinuke_tos_agree:${interaction.user.id}`)
          .setLabel('Agree TOS')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`antinuke_tos_decline:${interaction.user.id}`)
          .setLabel("Don't Agree")
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.reply({ embeds: [tosEmbed], components: [tosRow], ephemeral: true });

      try {
        const replyMessage = await interaction.fetchReply();
        const confirmation = await replyMessage.awaitMessageComponent({
          filter: component => component.user.id === interaction.user.id,
          time: 60_000,
        });

        if (confirmation.customId === `antinuke_tos_decline:${interaction.user.id}`) {
          await confirmation.update({ content: '❌ Anti-nuke was not enabled.', embeds: [], components: [] });
          return;
        }

        const latestMe = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
        const latestMissing = latestMe
          ? REQUIRED_PERMISSIONS.filter(([permission]) => !latestMe.permissions.has(permission))
          : REQUIRED_PERMISSIONS;

        if (latestMissing.length) {
          const missingEmbed = new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('🛡️ Permission Setup Required')
            .setDescription(
              'I cannot safely enable anti-nuke until Discord gives my bot the required permissions. **I cannot grant these permissions to myself.**\n\n' +
              'Click **Grant Permissions** below to reopen the bot authorization with the required anti-nuke permissions, then run `/antinuke enable` again.'
            )
            .addFields({
              name: 'Missing',
              value: latestMissing.map(([, name]) => `• ${name}`).join('\n'),
            });

          const permissionUrl = permissionsInviteUrl(guildId);
          const rows: ActionRowBuilder<ButtonBuilder>[] = [];
          if (permissionUrl) {
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setLabel('Grant Permissions').setStyle(ButtonStyle.Link).setURL(permissionUrl),
            ));
          }
          await confirmation.update({ embeds: [missingEmbed], components: rows });
          return;
        }

        updateGuild(guildId, data => { data.antiNuke.enabled = true; });
        const enabledEmbed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('🛡️ Anti-Nuke Enabled')
          .setDescription('Anti-nuke protection is now active.')
          .addFields(
            { name: 'Status', value: '🟢 Enabled', inline: true },
            { name: 'Protection', value: 'Unauthorized bot invites and protected role changes are monitored.' },
            { name: 'Trusted', value: 'Server owner, extra owners and whitelist members are excluded.' },
            { name: 'Requested by', value: `${interaction.user}` },
          );
        await confirmation.update({ embeds: [enabledEmbed], components: [] });
      } catch {
        await interaction.editReply({
          content: '⌛ Confirmation timed out. Anti-nuke was **not enabled**.',
          embeds: [],
          components: [],
        }).catch(() => undefined);
      }
      return;
    }

    if (sub === 'disable') {
      updateGuild(guildId, data => { data.antiNuke.enabled = false; });
      await interaction.reply({ content: '🛡️ Anti-nuke is now **disabled**.', ephemeral: true });
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
      await interaction.reply({
        content: changed
          ? `${adding ? '✅ Added' : '✅ Removed'} ${user} ${adding ? 'to' : 'from'} the anti-nuke whitelist.`
          : `ℹ️ ${user} is already ${adding ? 'whitelisted' : 'not whitelisted'}.`,
        ephemeral: true,
      });
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
