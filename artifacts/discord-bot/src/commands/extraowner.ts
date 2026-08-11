import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { canManageExtraOwner } from '../security.js';

export const extraowner: Command = {
  data: new SlashCommandBuilder()
    .setName('extraowner')
    .setDescription('Manage trusted extra owners for this server')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Give a member extra-owner access')
      .addUserOption(o => o.setName('user').setDescription('Member to trust').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove extra-owner access')
      .addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('List extra owners')),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!canManageExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the actual server owner can add or remove extra owners.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const owners = loadGuild(interaction.guild.id).extraOwners;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👑 Extra Owners')
        .setDescription(owners.length ? owners.map(id => `<@${id}>`).join('\n') : 'No extra owners configured.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('user', true);
    if (user.id === interaction.guild.ownerId || user.id === interaction.client.user.id) {
      await interaction.reply({ content: '❌ The server owner and bot do not need extra-owner status.', ephemeral: true });
      return;
    }

    const adding = sub === 'add';
    let changed = false;
    updateGuild(interaction.guild.id, data => {
      const has = data.extraOwners.includes(user.id);
      if (adding && !has) { data.extraOwners.push(user.id); changed = true; }
      if (!adding && has) { data.extraOwners = data.extraOwners.filter(id => id !== user.id); changed = true; }
    });

    await interaction.reply(changed
      ? `${adding ? '✅ Added' : '✅ Removed'} ${user} ${adding ? 'as an extra owner.' : 'from extra owners.'}`
      : `ℹ️ ${user} is already ${adding ? 'an extra owner' : 'not an extra owner'}.`);
  },
};
