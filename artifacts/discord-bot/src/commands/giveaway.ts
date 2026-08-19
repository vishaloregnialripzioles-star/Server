import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import {
  buildGiveawayEmbed,
  buildGiveawayRow,
  buildGiveawayEndedEmbed,
  buildAdminPanelEmbed,
  buildAdminPanelRows,
  rerollWinner,
  endGiveaway,
} from '../giveawayUtils.js';
import { pendingGiveaways, buildConfigEmbed, buildConfigRows } from '../giveawaySetup.js';

export const giveaway: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway management')
    .addSubcommand(sub => sub.setName('create').setDescription('Open the giveaway setup panel'))
    .addSubcommand(sub => sub.setName('reroll').setDescription('Pick a new random winner for an ended giveaway (Admin)').addStringOption(o => o.setName('id').setDescription('The giveaway ID shown in the ended panel footer').setRequired(true)))
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave a giveaway you have entered').addStringOption(o => o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true)))
    .addSubcommand(sub => sub.setName('participants').setDescription('View all participants of a giveaway').addStringOption(o => o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a participant from a giveaway (Admin)').addStringOption(o => o.setName('id').setDescription('Giveaway ID (shown in the panel footer)').setRequired(true)).addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('end').setDescription('Force-end an active giveaway and pick a winner immediately (Admin)').addStringOption(o => o.setName('id').setDescription('Giveaway ID (panel footer) OR the Discord message ID of the giveaway panel').setRequired(true)))
    .addSubcommand(sub => sub.setName('manage').setDescription('Open admin control panel for a giveaway (Admin)').addStringOption(o => o.setName('id').setDescription('Giveaway ID (panel footer) OR Discord message ID of the giveaway panel').setRequired(true))),

  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
        return;
      }
      pendingGiveaways.set(interaction.user.id, {
        type: 'standard', prize: 'Not set', durationStr: '1h', channelId: undefined, winnerCount: 1,
        donorId: undefined, customMessage: undefined, pingRoleId: undefined, imageUrl: undefined,
        extraEntryRoles: [], requiredRoleId: undefined, blacklistRoleId: undefined,
        guildId: interaction.guild.id, hostId: interaction.user.id, hideEntryCount: false,
      });
      const pending = pendingGiveaways.get(interaction.user.id)!;
      const canSelectWinner = interaction.guild.ownerId === interaction.user.id || !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      await interaction.reply({ embeds: [buildConfigEmbed(pending)], components: buildConfigRows(interaction.user.id, canSelectWinner), flags: 64 });
      return;
    }

    if (sub === 'end') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 }); return; }
      await interaction.deferReply({ flags: 64 });
      const input = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const gv = data.giveaways.find(g => g.id === input || g.messageId === input);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID or message ID \`${input}\`.`); return; }
      if (gv.ended) { await interaction.editReply('❌ That giveaway has already ended.'); return; }
      await endGiveaway(interaction.guild, gv);
      await interaction.editReply(`✅ Giveaway **${gv.prize}** has been ended and winner(s) picked!`);
      return;
    }

    if (sub === 'reroll') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 }); return; }
      await interaction.deferReply({ flags: 64 });
      const gvId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const gv = data.giveaways.find(g => g.id === gvId || g.messageId === gvId);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID or message ID \`${gvId}\`.\nRight-click the giveaway panel → Copy Message ID, or use the ID shown in the panel footer.`); return; }
      if (!gv.ended) { await interaction.editReply('❌ That giveaway has not ended yet.'); return; }
      if (gv.entries.length === 0) { await interaction.editReply('❌ That giveaway has no entries.'); return; }
      const newWinnerId = await rerollWinner(interaction.guild, gv);
      if (!newWinnerId) { await interaction.editReply('❌ Could not pick a new winner — no eligible entries.'); return; }
      updateGuild(interaction.guild.id, d => { const g = d.giveaways.find(g => g.id === gvId); if (g) { g.winnerId = newWinnerId; g.winnerIds = [newWinnerId]; } });
      try {
        const ch = await interaction.guild.channels.fetch(gv.channelId);
        if (ch?.isTextBased()) {
          const channel = ch as BaseGuildTextChannel;
          const updatedGv = { ...gv, winnerId: newWinnerId, winnerIds: [newWinnerId] };
          const embed = buildGiveawayEndedEmbed(updatedGv);
          const msg = await channel.messages.fetch(gv.messageId).catch(() => null);
          if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => undefined);
          await channel.send({ content: `🔄 Giveaway rerolled! New winner: <@${newWinnerId}>! Congratulations on winning **${gv.prize}**!`, allowedMentions: { users: [newWinnerId] } });
        }
      } catch { /* channel inaccessible */ }
      await interaction.editReply(`✅ Rerolled! New winner: <@${newWinnerId}>`);
      return;
    }

    if (sub === 'leave') {
      await interaction.deferReply({ flags: 64 });
      const gvId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id);
      const gv = data.giveaways.find(g => g.id === gvId);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID \`${gvId}\`.`); return; }
      if (gv.ended || gv.endsAt <= Date.now()) { await interaction.editReply('❌ That giveaway has already ended.'); return; }
      if (!gv.entries.includes(interaction.user.id)) { await interaction.editReply("❌ You haven't entered that giveaway."); return; }
      updateGuild(interaction.guild.id, d => { const g = d.giveaways.find(g => g.id === gvId); if (g) g.entries = g.entries.filter(id => id !== interaction.user.id); });
      try {
        const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === gvId);
        if (updated) {
          const ch = await interaction.guild.channels.fetch(updated.channelId);
          if (ch?.isTextBased()) { const msg = await (ch as BaseGuildTextChannel).messages.fetch(updated.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(updated)], components: [buildGiveawayRow(gvId, updated.entries.length, updated.hideEntryCount)] }).catch(() => undefined); }
        }
      } catch { /* channel inaccessible */ }
      await interaction.editReply('✅ You have left the giveaway.');
      return;
    }

    if (sub === 'participants') {
      await interaction.deferReply({ flags: 64 });
      const gvId = interaction.options.getString('id', true).trim();
      const data = loadGuild(interaction.guild.id); const gv = data.giveaways.find(g => g.id === gvId);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID \`${gvId}\`.`); return; }
      const entries = gv.entries;
      const list = entries.length === 0 ? '*No participants yet.*' : entries.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') + (entries.length > 50 ? `\n*… and ${entries.length - 50} more*` : '');
      const wc = gv.winnerCount ?? 1;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`👥 Participants — ${gv.prize}`).setDescription(list).setFooter({ text: `Total: ${entries.length} • Winners: ${wc} • ID: ${gvId}` })] });
      return;
    }

    if (sub === 'remove') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 }); return; }
      await interaction.deferReply({ flags: 64 });
      const gvId = interaction.options.getString('id', true).trim(); const targetUser = interaction.options.getUser('user', true);
      const data = loadGuild(interaction.guild.id); const gv = data.giveaways.find(g => g.id === gvId);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID \`${gvId}\`.`); return; }
      if (gv.ended) { await interaction.editReply('❌ That giveaway has already ended.'); return; }
      if (!gv.entries.includes(targetUser.id)) { await interaction.editReply(`❌ <@${targetUser.id}> is not in that giveaway.`); return; }
      updateGuild(interaction.guild.id, d => { const g = d.giveaways.find(g => g.id === gvId); if (g) g.entries = g.entries.filter(id => id !== targetUser.id); });
      try {
        const updated = loadGuild(interaction.guild.id).giveaways.find(g => g.id === gvId);
        if (updated) { const ch = await interaction.guild.channels.fetch(updated.channelId); if (ch?.isTextBased()) { const msg = await (ch as BaseGuildTextChannel).messages.fetch(updated.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(updated)], components: [buildGiveawayRow(gvId, updated.entries.length, updated.hideEntryCount)] }).catch(() => undefined); } }
      } catch { /* channel inaccessible */ }
      await interaction.editReply(`✅ Removed <@${targetUser.id}> from **${gv.prize}**.`);
      return;
    }

    if (sub === 'manage') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 }); return; }
      await interaction.deferReply({ flags: 64 });
      const input = interaction.options.getString('id', true).trim(); const data = loadGuild(interaction.guild.id); const gv = data.giveaways.find(g => g.id === input || g.messageId === input);
      if (!gv) { await interaction.editReply(`❌ No giveaway found with ID or message ID \`${input}\`.\nRight-click the giveaway panel → Copy Message ID, or use the ID shown in the footer.`); return; }
      await interaction.editReply({ embeds: [buildAdminPanelEmbed(gv)], components: buildAdminPanelRows(gv.id, gv.ended) });
      return;
    }
  },
};
