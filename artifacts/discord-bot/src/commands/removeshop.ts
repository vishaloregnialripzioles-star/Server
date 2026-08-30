import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isOwnerOrExtraOwner } from '../security.js';

export const removeshop: Command = {
  data: new SlashCommandBuilder()
    .setName('removeshop')
    .setDescription('Remove a role or colour item from the server shop (Owner/Extra Owner only)')
    .addSubcommand(sub => sub
      .setName('role')
      .setDescription('Remove a shop role item')
      .addStringOption(opt => opt.setName('item').setDescription('Shop role name or ID').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('colour')
      .setDescription('Remove a shop colour item')
      .addStringOption(opt => opt.setName('item').setDescription('Shop colour name or ID').setRequired(true))),

  async execute(interaction) {
    if (!interaction.guild) return;

    if (!isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the server owner or trusted extra owner can use this command.', ephemeral: true });
      return;
    }

    const kind = interaction.options.getSubcommand();
    const query = interaction.options.getString('item', true).trim();
    const data = loadGuild(interaction.guild.id);

    if (kind === 'role') {
      const item = data.shop.roles.find(x => x.id === query || x.name.toLowerCase() === query.toLowerCase());
      if (!item) {
        await interaction.reply({ content: `❌ Shop role **${query}** was not found.`, ephemeral: true });
        return;
      }

      const affectedCustomRoles = data.shop.customRoles.filter(x => x.shopRoleId === item.id);
      updateGuild(interaction.guild.id, d => {
        d.shop.roles = d.shop.roles.filter(x => x.id !== item.id);
        d.shop.customRoles = d.shop.customRoles.filter(x => x.shopRoleId !== item.id);
      });

      await interaction.reply({
        content: `🗑️ Removed shop role **${item.name}** from the shop.\n\nThe configured Discord role was **not deleted**. ${affectedCustomRoles.length ? `Cleaned up ${affectedCustomRoles.length} saved custom-shop assignment(s).` : ''}`,
      });
      return;
    }

    const item = data.shop.colours.find(x => x.id === query || x.name.toLowerCase() === query.toLowerCase());
    if (!item) {
      await interaction.reply({ content: `❌ Shop colour **${query}** was not found.`, ephemeral: true });
      return;
    }

    updateGuild(interaction.guild.id, d => {
      d.shop.colours = d.shop.colours.filter(x => x.id !== item.id);
    });

    await interaction.reply({ content: `🗑️ Removed shop colour **${item.name}** from the shop. The Discord role(s) using that colour were not deleted.` });
  },
};
