import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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
    .addSubcommand(sub => sub
      .setName('whitelist-add')
      .setDescription('Whitelist a member from anti-nuke punishment')
      .addUserOption(o => o.setName('user').setDescription('Member to whitelist').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('whitelist-remove')
      .setDescription('Remove a member from the anti-nuke whitelist')
      .addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true))),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the server owner or an extra owner can manage anti-nuke.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'enable' || sub === 'disable') {
      const enabled = sub === 'enable';
      updateGuild(guildId, data => { data.antiNuke.enabled = enabled; });
      await interaction.reply(`🛡️ Anti-nuke is now **${enabled ? 'enabled' : 'disabled'}**.`);
      return;
    }

    if (sub === 'whitelist-add' || sub === 'whitelist-remove') {
      const user = interaction.options.getUser('user', true);
      if (user.id === interaction.guild.ownerId || user.id === interaction.client.user.id) {
        await interaction.reply({ content: '❌ The server owner and bot are always trusted.', ephemeral: true });
        return;
      }
      const adding = sub === 'whitelist-add';
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
