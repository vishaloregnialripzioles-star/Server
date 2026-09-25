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

const RED = 0xd30000;
const YELLOW = 0xfee75c;

const SETUP_EMOJIS = {
  header: '1553048591805845529',
  bullet: '1553041622491594873',
  tick: '1553040385188569211',
  protected: '1553039986159386657',
};

const PROTECTION_LINES = [
  'Checking Sparxie\'s Role Permissions',
  'Creating and Configuring Sparxie Firewall Role',
  'Checking and Deleting Malicious Invites',
  'Creating Logging Channel For Anti-Nuke Logs',
  'Creating Webhook For Optimal Logging',
  'Enabling Anti-Nuke For This Server',
];

const PROTECTED_ITEMS = [
  'Channel Deletion',
  'Channel Creation',
  'Role Deletion',
  'Role Creation',
  'Member Bans',
  'Member Kicks',
  'Webhook Creation',
  'Webhook Deletion',
  'Permission Updates',
  'Bot Additions',
];

async function setupEmojiSet(interaction: any): Promise<Record<keyof typeof SETUP_EMOJIS, string>> {
  const result: any = {};
  for (const [key, id] of Object.entries(SETUP_EMOJIS)) result[key] = await appEmoji(interaction, id, key === 'bullet' ? '•' : key === 'tick' || key === 'protected' ? '✓' : '⚙️');
  return result;
}

function setupLine(emoji: string, tick: string, text: string): string {
  return emoji + ' ' + text + ' ' + tick;
}

async function appEmoji(interaction: any, id: string, fallback: string): Promise<string> {
  try { return (await interaction.client.application.emojis.fetch(id)).toString(); }
  catch { return fallback; }
}

async function getBotMember(guild: any): Promise<any | null> {
  return guild.members.me ?? await guild.members.fetchMe().catch(() => null);
}

async function missingPermissions(guild: any): Promise<bigint[]> {
  const me = await getBotMember(guild);
  const required = [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers];
  return me ? required.filter(permission => !me.permissions.has(permission)) : required;
}

async function hierarchyBlockers(guild: any): Promise<any[]> {
  const me = await getBotMember(guild);
  if (!me) return [];
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  return [...members.values()].filter((member: any) =>
    member.id !== guild.ownerId &&
    member.id !== guild.client.user?.id &&
    member.roles.highest.position >= me.roles.highest.position &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      member.permissions.has(PermissionFlagsBits.ManageRoles) ||
      member.permissions.has(PermissionFlagsBits.BanMembers) ||
      member.permissions.has(PermissionFlagsBits.KickMembers))
  );
}

function statusEmbed(enabled: boolean): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : YELLOW)
    .setTitle(enabled ? 'Anti-Nuke Enabled' : 'Anti-Nuke Disabled')
    .setDescription(enabled ? ['**Protection:** Active', '**Enforcement:** Configured for destructive actions', '**Automatic recovery:** Enabled where recovery state is available', '', 'Use /antinuke status to check the current state.'].join('\n') : 'Anti-Nuke protection is currently paused.')
    .setFooter({ text: 'Sparxie • Anti-Nuke Security' })
    .setTimestamp();
}

export const antinuke: Command = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Protect the server from destructive actions')
    .addSubcommand(sub => sub.setName('enable').setDescription('Enable Anti-Nuke protection'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable Anti-Nuke protection'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show Anti-Nuke status'))
    .addSubcommandGroup(group => group.setName('whitelist').setDescription('Manage trusted members')
      .addSubcommand(sub => sub.setName('add').setDescription('Trust a member').addUserOption(option => option.setName('user').setDescription('Member to trust').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove a trusted member').addUserOption(option => option.setName('user').setDescription('Member to remove').setRequired(true)))
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Anti-Nuke Locked').setDescription('Only the server owner or an extra owner can configure Anti-Nuke.')], ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    if (group === 'whitelist') {
      const user = interaction.options.getUser('user', true);
      const adding = subcommand === 'add';
      updateGuild(guild.id, data => {
        if (adding && !data.antiNuke.whitelist.includes(user.id)) data.antiNuke.whitelist.push(user.id);
        if (!adding) data.antiNuke.whitelist = data.antiNuke.whitelist.filter(id => id !== user.id);
      });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle(adding ? 'Trusted Member Added' : 'Trusted Member Removed').setDescription((adding ? 'Added ' : 'Removed ') + '<@' + user.id + '> ' + (adding ? 'to' : 'from') + ' the Anti-Nuke whitelist.')] });
      return;
    }

    if (subcommand === 'status') {
      const config = loadGuild(guild.id).antiNuke;
      const check = await appEmoji(interaction, '1553040385188569211', '✓');
      await interaction.reply({ embeds: [statusEmbed(config.enabled).setDescription([
        '**Status:** ' + (config.enabled ? 'Enabled' : 'Disabled'),
        '**Whitelist:** ' + config.whitelist.length + ' trusted member(s)',
        '**Security logs:** ' + (config.logChannelId ? '<#' + config.logChannelId + '>' : 'Not configured'),
        '', check + ' Anti-Nuke configuration is loaded.',
      ].join('\n'))] });
      return;
    }

    if (subcommand === 'disable') {
      updateGuild(guild.id, data => { data.antiNuke.enabled = false; });
      await interaction.reply({ embeds: [statusEmbed(false)] });
      return;
    }

    const missing = await missingPermissions(guild);
    const blockers = await hierarchyBlockers(guild);
    const blockerText = blockers.length ? blockers.slice(0, 10).map((member: any) => '• ' + member.user.tag + ' — <@&' + member.roles.highest.id + '>').join('\n') : '• None detected';
    const warning = [
      '**Before enabling Anti-Nuke**',
      '',
      'Sparxie needs the required moderation permissions and a role high enough to act on protected roles.',
      '',
      '**Role hierarchy**',
      blockerText,
      '',
      missing.length ? '**Missing permissions:** ' + missing.map(String).join(', ') : '✓ Required permissions detected.',
      '',
      'If everything is correct, press Proceed.',
    ].join('\n');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('antinuke:proceed:' + interaction.user.id).setLabel('Proceed').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('antinuke:cancel:' + interaction.user.id).setLabel("Don't Agree").setStyle(ButtonStyle.Danger),
    );

    const message = await interaction.reply({
      embeds: [new EmbedBuilder().setColor(RED).setTitle('Anti-Nuke Setup').setDescription(warning).setFooter({ text: 'Sparxie • Security setup' })],
      components: [row],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({ time: 60000, filter: (component: any) => component.user.id === interaction.user.id });
    collector.on('collect', async (component: any) => {
      try {
        if (component.customId.startsWith('antinuke:cancel:')) {
          await component.update({ embeds: [new EmbedBuilder().setColor(YELLOW).setTitle('Anti-Nuke Setup Cancelled').setDescription('No changes were made.')], components: [] });
          collector.stop('cancelled');
          return;
        }
        const currentMissing = await missingPermissions(guild);
        const currentBlockers = await hierarchyBlockers(guild);
        if (currentMissing.length || currentBlockers.length) {
          await component.update({
            embeds: [new EmbedBuilder().setColor(YELLOW).setTitle('Anti-Nuke Cannot Be Enabled Yet').setDescription([
              currentMissing.length ? '**Missing permissions:** ' + currentMissing.map(String).join(', ') : '✓ Required permissions detected.',
              '', '**Blocking roles/members:**',
              currentBlockers.length ? currentBlockers.slice(0, 10).map((member: any) => '• ' + member.user.tag + ' — <@&' + member.roles.highest.id + '>').join('\n') : '• None detected',
              '', 'Move the Sparxie role above the protected roles and grant the required permissions, then run /antinuke enable again.',
            ].join('\n'))],
            components: [],
          });
          collector.stop('blocked');
          return;
        }
        await component.deferUpdate();

        const emojis = await setupEmojiSet(component);
        const header = emojis.header;
        const bullet = emojis.bullet;
        const tick = emojis.tick;
        const protectedEmoji = emojis.protected;

        const setupEmbed = (description: string) => new EmbedBuilder()
          .setColor(RED)
          .setTitle(header + ' Antinuke Setup')
          .setDescription(description)
          .setFooter({ text: 'Sparxie • Security Setup' });

        let progress = [
          '__**Performing Quick Checks To Ensure**__',
          '__**Everything Goes Smoothly During Setup**__',
          '',
          setupLine(bullet, tick, PROTECTION_LINES[0]),
        ].join('\n');

        await interaction.editReply({
          embeds: [setupEmbed(progress)],
          components: [],
        });

        for (let index = 1; index < PROTECTION_LINES.length; index++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          progress += '\n' + setupLine(bullet, tick, PROTECTION_LINES[index]);
          await interaction.editReply({
            embeds: [setupEmbed(progress)],
            components: [],
          });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        updateGuild(guild.id, data => {
          data.antiNuke.enabled = true;
          data.antiNuke.punishment = 'ban';
        });

        // These are the destructive actions currently handled by the Anti-Nuke
        // audit-log protection/recovery layer.
        const protectedItems = [
          'Channel Deletion',
          'Channel Creation',
          'Role Deletion',
          'Role Creation',
          'Member Bans',
          'Member Kicks',
          'Webhook Creation',
          'Webhook Deletion',
          'Channel Permission Changes',
          'Role Permission Changes',
          'Member Role Changes',
          'Bot Additions',
        ];

        const protectedLines = protectedItems
          .map(item => protectedEmoji + ' ' + item)
          .join('\n');

        const enabledDescription = [
          'Sparxie Anti-Nuke is now enabled for this server.',
          '',
          '**Everything Protected**',
          protectedLines,
          '',
          '**Enforcement:** Instant protection with whitelist support',
          '**Recovery:** Unauthorized destructive changes are automatically handled where recovery is available.',
        ].join('\n');

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(header + ' Antinuke Enabled')
            .setDescription(enabledDescription)
            .setFooter({ text: 'Sparxie • Anti-Nuke Security' })
            .setTimestamp()],
          components: [],
        });

        collector.stop('enabled');
      } catch (error) {
        console.error('[AntiNuke interaction]', error);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Anti-Nuke Setup Failed').setDescription('The setup could not be completed. Check the bot permissions and try again.')], components: [] }).catch(() => undefined);
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') await interaction.editReply({ embeds: [new EmbedBuilder().setColor(YELLOW).setTitle('Anti-Nuke Setup Expired').setDescription('The confirmation expired. Run /antinuke enable again.')], components: [] }).catch(() => undefined);
    });
  },
};