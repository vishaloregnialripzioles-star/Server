import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

const medals = ['🥇', '🥈', '🥉'];

export const invites: Command = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Manage and view server invites')
    .addSubcommand(s => s.setName('check').setDescription('Check invite count').addUserOption(o => o.setName('user').setDescription('Member').setRequired(false)))
    .addSubcommand(s => s.setName('add').setDescription('Add invites').addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove invites').addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('leaderboard').setDescription('Show invite leaderboard').addIntegerOption(o => o.setName('top').setDescription('Members to show').setMinValue(3).setMaxValue(25))),
  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const data = loadGuild(interaction.guild.id);
    const counts = data.invites ?? {};
    const actor = interaction.member;
    const canManage = actor && 'permissions' in actor && actor.permissions.has(PermissionFlagsBits.ManageGuild);

    if ((sub === 'add' || sub === 'remove') && !canManage) {
      await interaction.reply({ content: '❌ You need Manage Server permission to change invite counts.', ephemeral: true }); return;
    }
    if (sub === 'check') {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const count = counts[user.id] ?? 0;
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📨 Invite Count').setDescription(`${user} has **${count}** invite${count === 1 ? '' : 's'} in **${interaction.guild.name}**.`).setThumbnail(user.displayAvatarURL()).setTimestamp()] }); return;
    }
    if (sub === 'add' || sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      updateGuild(interaction.guild.id, d => { d.invites ??= {}; d.invites[user.id] = Math.max(0, (d.invites[user.id] ?? 0) + (sub === 'add' ? amount : -amount)); });
      const count = loadGuild(interaction.guild.id).invites?.[user.id] ?? 0;
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Invites Updated').setDescription(`${user}'s invite count is now **${count}**.`).setTimestamp()] }); return;
    }
    const top = interaction.options.getInteger('top') ?? 10;
    const rows = Object.entries(counts).filter(([, n]) => n > 0).sort((a,b) => b[1]-a[1]).slice(0, top);
    if (!rows.length) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📨 Invite Leaderboard').setDescription('No invites have been recorded yet.').setTimestamp()] }); return; }
    const text = rows.map(([id,n],i) => `${medals[i] ?? `**#${i+1}**`} <@${id}> — **${n}** invite${n === 1 ? '' : 's'}`).join('\n');
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📨 ${interaction.guild.name} — Invite Leaderboard`).setDescription(text).setTimestamp().setFooter({ text: 'Ranked by invites' })] });
  },
};
