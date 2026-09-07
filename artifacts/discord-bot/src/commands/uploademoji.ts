import { SlashCommandBuilder, PermissionFlagsBits, type CommandInteraction } from 'discord.js';
import type { Command } from '../types.js';

const MAX_BYTES = 256 * 1024;
const CUSTOM_EMOJI = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{5,25})>$/;

function cleanName(input: string) {
  return input.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
}

function parseCustomEmoji(raw: string) {
  const match = raw.trim().match(CUSTOM_EMOJI);
  if (!match) return null;
  return { animated: match[1] === 'a', sourceName: match[2], id: match[3] };
}

function cdnUrl(id: string, animated: boolean) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=256&quality=lossless`;
}

export const uploademoji: Command = {
  data: new SlashCommandBuilder()
    .setName('uploademoji')
    .setDescription('Copy a Discord emoji into the bot application emojis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(o => o.setName('emoji').setDescription('Choose/paste a custom Discord emoji from the emoji picker').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('name').setDescription('Application emoji name (defaults to the selected emoji name)').setRequired(false).setMaxLength(32)),

  async execute(interaction: CommandInteraction & any) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: '❌ Server only.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ You need **Manage Expressions**.', ephemeral: true });
      return;
    }

    const raw = interaction.options.getString('emoji', true).trim();
    const selected = parseCustomEmoji(raw);
    if (!selected) {
      await interaction.reply({ content: '❌ Please choose a **custom Discord emoji** from the emoji picker (or paste it like `<:name:123456789012345678>`). Unicode emojis cannot be uploaded as application emojis.', ephemeral: true });
      return;
    }

    const name = cleanName(interaction.options.getString('name') ?? selected.sourceName);
    if (name.length < 2) {
      await interaction.reply({ content: '❌ Emoji name must contain at least 2 letters/numbers/underscores.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const application = await interaction.client.application.fetch();
      const existing = await application.emojis.fetch();
      const sameName = existing.find(e => e.name?.toLowerCase() === name.toLowerCase());
      if (sameName) {
        await interaction.editReply(`ℹ️ Application emoji **${sameName.name}** already exists: ${sameName}\n\nI didn't create a duplicate.`);
        return;
      }

      const sourceUrl = cdnUrl(selected.id, selected.animated);
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`Couldn't read the selected Discord emoji (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) throw new Error('The selected emoji is larger than Discord’s 256 KB emoji limit.');

      const emoji = await application.emojis.create({ name, attachment: bytes });
      await interaction.editReply(`✅ **Application emoji created!**\n\nSource: ${raw}\nApplication emoji: ${emoji}\nName: **${emoji.name}**\nID: **${emoji.id}**\nAnimated: **${selected.animated ? 'Yes' : 'No'}**\n\nThis emoji belongs to the **bot application**, not this server.`);
    } catch (error) {
      console.error('[UploadEmoji]', error);
      await interaction.editReply(`❌ ${error instanceof Error ? error.message : 'Discord rejected the application emoji.'}`);
    }
  }
};
