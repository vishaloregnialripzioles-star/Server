import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const autoresponder: Command = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Manage automatic responses to trigger words')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new autoresponder')
        .addStringOption(o => o.setName('trigger').setDescription('Word or phrase that triggers the response').setRequired(true))
        .addStringOption(o => o.setName('response').setDescription('What the bot should reply').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove an autoresponder by trigger')
        .addStringOption(o => o.setName('trigger').setDescription('The trigger to remove').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all autoresponders in this server'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const data = loadGuild(interaction.guild.id);
      if (data.autoResponders.length === 0) {
        await interaction.reply({ content: '📋 No autoresponders set up yet.', flags: 64 });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Autoresponders')
        .setDescription(
          data.autoResponders.map((ar, i) =>
            `**${i + 1}.** Trigger: \`${ar.trigger}\`\n> Response: ${ar.response}`,
          ).join('\n\n'),
        )
        .setFooter({ text: `${data.autoResponders.length} autoresponder(s)` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger', true).toLowerCase().trim();
      const response = interaction.options.getString('response', true).trim();

      if (trigger.length > 100) {
        await interaction.reply({ content: '❌ Trigger must be 100 characters or fewer.', flags: 64 });
        return;
      }
      if (response.length > 500) {
        await interaction.reply({ content: '❌ Response must be 500 characters or fewer.', flags: 64 });
        return;
      }

      let alreadyExists = false;
      updateGuild(interaction.guild.id, data => {
        const existing = data.autoResponders.find(ar => ar.trigger === trigger);
        if (existing) { existing.response = response; alreadyExists = true; }
        else data.autoResponders.push({ trigger, response });
      });

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x00CC44)
          .setTitle(alreadyExists ? '✏️ Autoresponder Updated' : '✅ Autoresponder Added')
          .addFields(
            { name: 'Trigger', value: `\`${trigger}\``, inline: true },
            { name: 'Response', value: response },
          )
          .setTimestamp()],
      });
      return;
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true).toLowerCase().trim();
      let found = false;
      updateGuild(interaction.guild.id, data => {
        const before = data.autoResponders.length;
        data.autoResponders = data.autoResponders.filter(ar => ar.trigger !== trigger);
        found = data.autoResponders.length < before;
      });

      if (!found) {
        await interaction.reply({ content: `❌ No autoresponder found with trigger \`${trigger}\`.`, flags: 64 });
        return;
      }
      await interaction.reply({ content: `✅ Autoresponder for \`${trigger}\` removed.` });
    }
  },
};
