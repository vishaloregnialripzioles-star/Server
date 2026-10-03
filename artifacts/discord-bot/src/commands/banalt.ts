import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { linkAlt, BAN_EMBED_COLOR } from '../banAppeals.js';

export const banalt: Command = {
  data: new SlashCommandBuilder().setName('banalt').setDescription('Link a known alternate account to a banned main account').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('main_id').setDescription('Banned main account ID').setRequired(true))
    .addStringOption(o => o.setName('alt_id').setDescription('Alternate account ID').setRequired(true)),
  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });
    const mainId = interaction.options.getString('main_id', true).replace(/\D/g, '');
    const altId = interaction.options.getString('alt_id', true).replace(/\D/g, '');
    if (!mainId || !altId || mainId === altId) { await interaction.editReply('❌ Provide two different valid Discord user IDs.'); return; }
    const linked = linkAlt(interaction.guild, mainId, altId);
    if (!linked) { await interaction.editReply('❌ No ban case was found for that main account. Ban the main account with Sparxie first.'); return; }
    const main = await interaction.client.users.fetch(mainId).catch(() => null);
    const alt = await interaction.client.users.fetch(altId).catch(() => null);
    const embed = new EmbedBuilder().setColor(BAN_EMBED_COLOR).setTitle('🔗 Alternate Account Linked')
      .addFields({ name: 'Main Account', value: (main ? main.tag : 'Unknown') + '
' + mainId, inline: true }, { name: 'Alternate Account', value: (alt ? alt.tag : 'Unknown') + '
' + altId, inline: true })
      .setFooter({ text: 'Linked alts are banned automatically when they join.' }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};