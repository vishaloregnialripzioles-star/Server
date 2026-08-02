import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Command } from '../types.js';
import type { Giveaway, ExtraEntryRole } from '../types.js';
import { parseDuration, generateId } from '../utils.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildGiveawayEmbed, buildGiveawayRow, buildGiveawayEndedEmbed, rerollWinner, endGiveaway } from '../giveawayUtils.js';

export const giveaway: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway management')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new giveaway with a panel and Enter button (Admin)')
        // ── Required ────────────────────────────────────────────────────────────
        .addStringOption(o =>
          o.setName('name').setDescription('Title/name of the giveaway').setRequired(true),
        )
        .addStringOption(o =>
          o.setName('prize').setDescription('What are you giving away?').setRequired(true),
        )
        .addStringOption(o =>
          o.setName('duration').setDescription('How long does it run? (e.g. 1h, 2d, 30m)').setRequired(true),
        )
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription('Channel to post the giveaway panel in')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        // ── Optional ────────────────────────────────────────────────────────────
        .addRoleOption(o =>
          o.setName('required_role').setDescription('Role required to enter'),
        )
        .addRoleOption(o =>
          o.setName('blacklist_role').setDescription('Role that is NOT allowed to enter'),
        )
        .addRoleOption(o =>
          o.setName('extra_role_1').setDescription('Role with bonus entries (slot 1)'),
        )
        .addIntegerOption(o =>
          o
            .setName('extra_entries_1')
            .setDescription('Bonus entry count for role 1 (1-100)')
            .setMinValue(1)
            .setMaxValue(100),
        )
        .addRoleOption(o =>
          o.setName('extra_role_2').setDescription('Role with bonus entries (slot 2)'),
        )
        .addIntegerOption(o =>
          o
            .setName('extra_entries_2')
            .setDescription('Bonus entry count for role 2 (1-100)')
            .setMinValue(1)
            .setMaxValue(100),
        )
        .addRoleOption(o =>
          o.setName('extra_role_3').setDescription('Role with bonus entries (slot 3)'),
        )
        .addIntegerOption(o =>
          o
            .setName('extra_entries_3')
            .setDescription('Bonus entry count for role 3 (1-100)')
            .setMinValue(1)
            .setMaxValue(100),
        )
        .addAttachmentOption(o =>
          o.setName('image').setDescription('Optional image shown on the giveaway panel'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Pick a new random winner for an ended giveaway')
        .addStringOption(o =>
          o
            .setName('id')
            .setDescription('The giveaway ID (shown in the footer of the ended panel)')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('leave')
        .setDescription('Leave a giveaway you have entered')
        .addStringOption(o =>
          o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('participants')
        .setDescription('View all participants of a giveaway')
        .addStringOption(o =>
          o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a participant from a giveaway (Admin)')
        .addStringOption(o =>
          o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true),
        )
        .addUserOption(o =>
          o.setName('user').setDescription('Member to remove').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('Force-end an active giveaway immediately and pick a winner (Admin)')
        .addStringOption(o =>
          o
            .setName('id')
            .setDescription('Giveaway ID (panel footer) OR the Discord message ID of the giveaway panel')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;

    const sub = interaction.options.getSubcommand();

    // ── /giveaway end ─────────────────────────────────────────────────────────
    if (sub === 'end') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      const input = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      // Accept both the internal giveaway ID and the Discord message ID of the panel
      const giveaway = data.giveaways.find(g => g.id === input || g.messageId === input);
      if (!giveaway) {
        await interaction.editReply(
          `❌ No giveaway found with ID or message ID \`${input}\`.\n` +
          `You can right-click the giveaway panel → Copy Message ID, or check the panel footer for the giveaway ID.`,
        );
        return;
      }
      if (giveaway.ended) {
        await interaction.editReply('❌ That giveaway has already ended.');
        return;
      }
      await endGiveaway(interaction.guild, giveaway);
      await interaction.editReply(`✅ Giveaway **${giveaway.name}** has been ended and a winner has been picked!`);
      return;
    }

    // ── /giveaway reroll ──────────────────────────────────────────────────────
    if (sub === 'reroll') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      await interaction.deferReply({ flags: 64 });

      const giveawayId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);

      if (!giveaway) {
        await interaction.editReply(`❌ No giveaway found with ID \`${giveawayId}\`. Check the footer of the ended giveaway panel.`);
        return;
      }
      if (!giveaway.ended) {
        await interaction.editReply('❌ That giveaway has not ended yet.');
        return;
      }
      if (giveaway.entries.length === 0) {
        await interaction.editReply('❌ That giveaway has no entries to pick from.');
        return;
      }

      const newWinnerId = await rerollWinner(interaction.guild, giveaway);
      if (!newWinnerId) {
        await interaction.editReply('❌ Could not pick a new winner — no eligible entries.');
        return;
      }

      // Persist new winner
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.winnerId = newWinnerId;
      });

      // Update the ended panel embed
      try {
        const ch = await interaction.guild.channels.fetch(giveaway.channelId);
        if (ch?.isTextBased()) {
          const channel = ch as BaseGuildTextChannel;
          const prefix = data.config.prefix ?? '.';
          const updatedGiveaway = { ...giveaway, winnerId: newWinnerId };
          const embed = buildGiveawayEndedEmbed(updatedGiveaway, prefix);
          const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
          if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => undefined);

          await channel.send({
            content: `🔄 Giveaway rerolled! New winner: <@${newWinnerId}>! Congratulations on winning **${giveaway.prize}**!`,
            allowedMentions: { users: [newWinnerId] },
          });
        }
      } catch {
        // channel inaccessible — still reply success
      }

      await interaction.editReply(`✅ Rerolled! New winner: <@${newWinnerId}>`);
      return;
    }

    // ── /giveaway leave ───────────────────────────────────────────────────────
    if (sub === 'leave') {
      await interaction.deferReply({ flags: 64 });
      const giveawayId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.editReply(`❌ No giveaway found with ID \`${giveawayId}\`.`);
        return;
      }
      if (giveaway.ended || giveaway.endsAt <= Date.now()) {
        await interaction.editReply('❌ That giveaway has already ended.');
        return;
      }
      if (!giveaway.entries.includes(interaction.user.id)) {
        await interaction.editReply("❌ You haven't entered that giveaway.");
        return;
      }
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== interaction.user.id);
      });
      try {
        const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
        if (updated) {
          const ch = await interaction.guild.channels.fetch(updated.channelId);
          if (ch?.isTextBased()) {
            const msg = await (ch as BaseGuildTextChannel).messages.fetch(updated.messageId).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(updated)], components: [buildGiveawayRow(giveawayId, updated.entries.length)] }).catch(() => undefined);
          }
        }
      } catch { /* channel inaccessible */ }
      await interaction.editReply('✅ You have left the giveaway.');
      return;
    }

    // ── /giveaway participants ─────────────────────────────────────────────────
    if (sub === 'participants') {
      await interaction.deferReply({ flags: 64 });
      const giveawayId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.editReply(`❌ No giveaway found with ID \`${giveawayId}\`.`);
        return;
      }
      const entries = giveaway.entries;
      const list = entries.length === 0
        ? '*No participants yet.*'
        : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') +
          (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 Participants — ${giveaway.name}`)
        .setDescription(list)
        .setFooter({ text: `Total: ${entries.length} participant(s) • ID: ${giveawayId}` })] });
      return;
    }

    // ── /giveaway remove ──────────────────────────────────────────────────────
    if (sub === 'remove') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      const giveawayId = interaction.options.getString('id', true).trim();
      const targetUser = interaction.options.getUser('user', true);
      const data = loadGuild(interaction.guild.id);
      const giveaway = data.giveaways.find(g => g.id === giveawayId);
      if (!giveaway) {
        await interaction.editReply(`❌ No giveaway found with ID \`${giveawayId}\`.`);
        return;
      }
      if (giveaway.ended) {
        await interaction.editReply('❌ That giveaway has already ended.');
        return;
      }
      if (!giveaway.entries.includes(targetUser.id)) {
        await interaction.editReply(`❌ <@${targetUser.id}> is not in that giveaway.`);
        return;
      }
      updateGuild(interaction.guild.id, d => {
        const g = d.giveaways.find(g => g.id === giveawayId);
        if (g) g.entries = g.entries.filter(id => id !== targetUser.id);
      });
      try {
        const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === giveawayId);
        if (updated) {
          const ch = await interaction.guild.channels.fetch(updated.channelId);
          if (ch?.isTextBased()) {
            const msg = await (ch as BaseGuildTextChannel).messages.fetch(updated.messageId).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(updated)], components: [buildGiveawayRow(giveawayId, updated.entries.length)] }).catch(() => undefined);
          }
        }
      } catch { /* channel inaccessible */ }
      await interaction.editReply(`✅ Removed <@${targetUser.id}> from **${giveaway.name}**.`);
      return;
    }

    if (sub !== 'create') return;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    const name = interaction.options.getString('name', true);
    const prize = interaction.options.getString('prize', true);
    const durationStr = interaction.options.getString('duration', true);
    const channelOption = interaction.options.getChannel('channel', true);
    const requiredRole = interaction.options.getRole('required_role');
    const blacklistRole = interaction.options.getRole('blacklist_role');
    const imageAttachment = interaction.options.getAttachment('image');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      await interaction.editReply('❌ Invalid duration. Examples: `30m`, `1h`, `2d`');
      return;
    }
    if (durationMs < 10_000) {
      await interaction.editReply('❌ Duration must be at least 10 seconds.');
      return;
    }
    if (durationMs > 30 * 24 * 60 * 60 * 1000) {
      await interaction.editReply('❌ Duration cannot exceed 30 days.');
      return;
    }

    // Build extra entry roles
    const extraEntryRoles: ExtraEntryRole[] = [];
    for (let i = 1; i <= 3; i++) {
      const role = interaction.options.getRole(`extra_role_${i}`);
      const entries = interaction.options.getInteger(`extra_entries_${i}`);
      if (role && entries) {
        extraEntryRoles.push({ roleId: role.id, entries });
      }
    }

    const endsAt = Date.now() + durationMs;
    const giveawayId = generateId();

    const newGiveaway: Giveaway = {
      id: giveawayId,
      guildId: interaction.guild.id,
      channelId: channelOption.id,
      messageId: '',
      name,
      prize,
      endsAt,
      hostId: interaction.user.id,
      entries: [],
      requiredRoleId: requiredRole?.id,
      blacklistRoleId: blacklistRole?.id,
      extraEntryRoles: extraEntryRoles.length > 0 ? extraEntryRoles : undefined,
      imageUrl: imageAttachment?.url,
      ended: false,
    };

    const targetChannel = interaction.guild.channels.cache.get(channelOption.id);
    if (!targetChannel?.isTextBased()) {
      await interaction.editReply('❌ That channel is not a text channel.');
      return;
    }

    try {
      const embed = buildGiveawayEmbed(newGiveaway);
      const row = buildGiveawayRow(giveawayId);

      const sent = await (targetChannel as BaseGuildTextChannel).send({
        embeds: [embed],
        components: [row],
      });

      newGiveaway.messageId = sent.id;
      updateGuild(interaction.guild.id, data => {
        data.giveaways.push(newGiveaway);
      });

      await interaction.editReply(`✅ Giveaway **${name}** started in <#${channelOption.id}>!`);
    } catch {
      await interaction.editReply(
        '❌ Failed to post the giveaway panel. Check that I have **Send Messages** and **Embed Links** permissions in that channel.',
      );
    }
  },
};
