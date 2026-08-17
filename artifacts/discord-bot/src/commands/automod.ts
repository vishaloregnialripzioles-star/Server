import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

function actionText(action: string): string {
  return action === 'delete_timeout' ? 'Delete + Timeout' : action.charAt(0).toUpperCase() + action.slice(1);
}

export const automod: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod and banned words')
    .addSubcommand(s => s.setName('enable').setDescription('Enable AutoMod'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable AutoMod'))
    .addSubcommand(s => s.setName('status').setDescription('Show AutoMod settings'))
    .addSubcommand(s => s.setName('action').setDescription('Set the action for banned words')
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
        .addChoices(
          { name: 'Delete', value: 'delete' },
          { name: 'Warn', value: 'warn' },
          { name: 'Timeout', value: 'timeout' },
          { name: 'Delete + Timeout', value: 'delete_timeout' },
        )))
    .addSubcommandGroup(g => g.setName('words').setDescription('Manage banned words')
      .addSubcommand(s => s.setName('add').setDescription('Add a banned word').addStringOption(o => o.setName('word').setDescription('Word or phrase').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a banned word').addStringOption(o => o.setName('word').setDescription('Word or phrase').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List banned words'))),
  async execute(interaction) {
    if (!interaction.guild) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Server** permission.', flags: 64 });
      return;
    }
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(true);
    if (group === 'words') {
      const word = interaction.options.getString('word')?.trim().toLocaleLowerCase();
      if (sub === 'list') {
        const words = loadGuild(interaction.guild.id).config.automod?.bannedWords ?? [];
        await interaction.reply({ content: words.length ? `🚫 Banned words:\n${words.map(w => `• \`${w}\``).join('\n')}` : '✅ No banned words configured.', flags: 64 });
        return;
      }
      if (!word) return;
      if (sub === 'add') {
        updateGuild(interaction.guild.id, d => {
          const a = d.config.automod ?? { enabled: true, bannedWords: [], action: 'delete_timeout' as const };
          if (!a.bannedWords.includes(word)) a.bannedWords.push(word);
          d.config.automod = a;
        });
        await interaction.reply(`✅ Added **${word}** to banned words.`);
        return;
      }
      updateGuild(interaction.guild.id, d => {
        if (d.config.automod) d.config.automod.bannedWords = d.config.automod.bannedWords.filter(w => w !== word);
      });
      await interaction.reply(`✅ Removed **${word}** from banned words.`);
      return;
    }

    updateGuild(interaction.guild.id, d => {
      const a = d.config.automod ?? { enabled: false, bannedWords: [], action: 'delete_timeout' as const };
      if (sub === 'enable') a.enabled = true;
      if (sub === 'disable') a.enabled = false;
      if (sub === 'action') a.action = interaction.options.getString('action', true) as any;
      d.config.automod = a;
    });

    const data = loadGuild(interaction.guild.id).config.automod!;
    if (sub === 'status') {
      await interaction.reply({ content: `🛡️ **AutoMod**\nEnabled: **${data.enabled ? 'Yes' : 'No'}**\nAction: **${actionText(data.action)}**\nBanned words: **${data.bannedWords.length}**`, flags: 64 });
      return;
    }
    if (sub === 'action') await interaction.reply(`✅ AutoMod action set to **${actionText(data.action)}**.`);
    else await interaction.reply(`✅ AutoMod is now **${data.enabled ? 'enabled' : 'disabled'}**.`);
  },
};
