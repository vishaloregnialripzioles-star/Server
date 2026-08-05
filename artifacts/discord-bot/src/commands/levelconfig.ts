import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

export const levelconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('Customise the level-up announcement embed (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the level-up embed title, description, and/or image')
        .addStringOption(o =>
          o.setName('title')
            .setDescription('Embed title — use {user} and {level} as placeholders')
            .setRequired(false),
        )
        .addStringOption(o =>
          o.setName('description')
            .setDescription('Embed body — use {user}, {level}, {xp} as placeholders')
            .setRequired(false),
        )
        .addStringOption(o =>
          o.setName('image')
            .setDescription('Image or GIF URL shown at the bottom of the embed')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset the level-up embed to the default message'),
    )
    .addSubcommand(sub =>
      sub
        .setName('preview')
        .setDescription('Preview what the current level-up embed looks like'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'reset') {
      updateGuild(interaction.guild.id, d => {
        delete d.config.levelUpMessage;
      });
      await interaction.editReply('✅ Level-up message reset to default.');
      return;
    }

    if (sub === 'preview') {
      const data = loadGuild(interaction.guild.id);
      const cfg = data.config.levelUpMessage;
      const embed = buildLevelUpEmbed(
        interaction.user.toString(),
        7,
        1200,
        interaction.user.displayAvatarURL(),
        cfg?.title,
        cfg?.description,
        cfg?.imageUrl,
      );
      await interaction.editReply({ content: '**Preview** (level 7, 1200 XP):', embeds: [embed] });
      return;
    }

    // sub === 'set'
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const image = interaction.options.getString('image');

    if (!title && !description && !image) {
      await interaction.editReply('❌ Provide at least one of: `title`, `description`, or `image`.');
      return;
    }

    // Validate image URL if provided
    if (image) {
      try {
        const url = new URL(image);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
      } catch {
        await interaction.editReply('❌ `image` must be a valid HTTP/HTTPS URL.');
        return;
      }
    }

    updateGuild(interaction.guild.id, d => {
      if (!d.config.levelUpMessage) d.config.levelUpMessage = {};
      if (title !== null) d.config.levelUpMessage.title = title;
      if (description !== null) d.config.levelUpMessage.description = description;
      if (image !== null) d.config.levelUpMessage.imageUrl = image;
    });

    const updated = loadGuild(interaction.guild.id).config.levelUpMessage;
    const lines: string[] = ['✅ Level-up message updated!'];
    if (updated?.title) lines.push(`**Title:** ${updated.title}`);
    if (updated?.description) lines.push(`**Description:** ${updated.description}`);
    if (updated?.imageUrl) lines.push(`**Image:** ${updated.imageUrl}`);
    lines.push('\nUse `/levelconfig preview` to see how it looks.');

    await interaction.editReply(lines.join('\n'));
  },
};

/** Build the level-up embed, applying custom fields if provided */
export function buildLevelUpEmbed(
  userMention: string,
  level: number,
  xp: number,
  avatarUrl: string,
  customTitle?: string,
  customDescription?: string,
  customImageUrl?: string,
): EmbedBuilder {
  const replacements: Record<string, string> = {
    '{user}': userMention,
    '{level}': String(level),
    '{xp}': xp.toLocaleString(),
  };

  const applyPlaceholders = (str: string) =>
    Object.entries(replacements).reduce((s, [k, v]) => s.replaceAll(k, v), str);

  const title = customTitle
    ? applyPlaceholders(customTitle)
    : `🎉 Level Up!`;

  const description = customDescription
    ? applyPlaceholders(customDescription)
    : `Congratulations ${userMention}!\nYou reached **level ${level}**.`;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(avatarUrl)
    .setTimestamp();

  if (customImageUrl) embed.setImage(customImageUrl);

  return embed;
}
