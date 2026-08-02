import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { buildEmbedPreview, parseColor, VARIABLES_HELP } from '../welcomeUtils.js';

export const embedCmd: Command = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and manage custom embeds for welcome messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── create ────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new saved embed')
        .addStringOption(o => o.setName('name').setDescription('Embed name — used in /welcome message {embed:name}').setRequired(true).setMaxLength(32))
        .addStringOption(o => o.setName('title').setDescription('Embed title (supports variables)').setMaxLength(256))
        .addStringOption(o => o.setName('description').setDescription('Embed description (supports variables, max 4096 chars)').setMaxLength(4000))
        .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #5865F2 or FF0000'))
        .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL or {user.avatar} / {server.icon}'))
        .addStringOption(o => o.setName('image').setDescription('Large banner image URL'))
        .addStringOption(o => o.setName('footer').setDescription('Footer text (supports variables)').setMaxLength(2048))
        .addStringOption(o => o.setName('author').setDescription('Author name (supports variables)').setMaxLength(256)),
    )

    // ── edit ──────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit an existing embed (leave fields blank to keep them)')
        .addStringOption(o => o.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('title').setDescription('New title').setMaxLength(256))
        .addStringOption(o => o.setName('description').setDescription('New description').setMaxLength(4000))
        .addStringOption(o => o.setName('color').setDescription('New hex color'))
        .addStringOption(o => o.setName('thumbnail').setDescription('New thumbnail URL or {user.avatar}'))
        .addStringOption(o => o.setName('image').setDescription('New image URL'))
        .addStringOption(o => o.setName('footer').setDescription('New footer text').setMaxLength(2048))
        .addStringOption(o => o.setName('author').setDescription('New author name').setMaxLength(256)),
    )

    // ── addfield ──────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('addfield')
        .setDescription('Add a field to a saved embed (max 25 fields)')
        .addStringOption(o => o.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('field_name').setDescription('Field title (supports variables)').setRequired(true).setMaxLength(256))
        .addStringOption(o => o.setName('field_value').setDescription('Field value (supports variables)').setRequired(true).setMaxLength(1024))
        .addBooleanOption(o => o.setName('inline').setDescription('Show field inline (default: false)')),
    )

    // ── removefield ───────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('removefield')
        .setDescription('Remove a field from a saved embed')
        .addStringOption(o => o.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('index').setDescription('Field number (1-based, see /embed preview)').setRequired(true).setMinValue(1).setMaxValue(25)),
    )

    // ── preview ───────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('preview')
        .setDescription('Preview a saved embed with sample variable values')
        .addStringOption(o => o.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true)),
    )

    // ── delete ────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a saved embed')
        .addStringOption(o => o.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true)),
    )

    // ── list ──────────────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all saved embeds for this server'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const data = loadGuild(interaction.guild.id);
      const embeds = data.savedEmbeds ?? {};
      const names = Object.keys(embeds);
      if (!names.length) {
        await interaction.editReply('📭 No saved embeds yet. Use `/embed create` to make one.');
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🖼️ Saved Embeds (${names.length})`)
        .setDescription(
          names.map((n, i) => {
            const e = embeds[n];
            const preview = e.title ?? e.description?.slice(0, 40) ?? '*(no title or description)*';
            return `**${i + 1}.** \`${n}\` — ${preview}`;
          }).join('\n'),
        )
        .setFooter({ text: 'Use /welcome message {embed:name} to set one as your welcome message' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── create ────────────────────────────────────────────────────────────────
    if (sub === 'create') {
      const rawName = interaction.options.getString('name', true).toLowerCase().trim();
      if (!/^[a-z0-9_-]+$/.test(rawName)) {
        await interaction.editReply('❌ Embed name may only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      const data = loadGuild(interaction.guild.id);
      if (data.savedEmbeds?.[rawName]) {
        await interaction.editReply(`❌ An embed named \`${rawName}\` already exists. Use \`/embed edit\` to update it.`);
        return;
      }

      const colorRaw = interaction.options.getString('color');
      const color    = colorRaw ? parseColor(colorRaw) : undefined;
      if (colorRaw && color === undefined) {
        await interaction.editReply('❌ Invalid color. Use hex format like `#5865F2` or `FF0000`.');
        return;
      }

      updateGuild(interaction.guild.id, d => {
        if (!d.savedEmbeds) d.savedEmbeds = {};
        d.savedEmbeds[rawName] = {
          name:         rawName,
          title:        interaction.options.getString('title')       ?? undefined,
          description:  interaction.options.getString('description') ?? undefined,
          color,
          thumbnailUrl: interaction.options.getString('thumbnail')   ?? undefined,
          imageUrl:     interaction.options.getString('image')       ?? undefined,
          footerText:   interaction.options.getString('footer')      ?? undefined,
          authorName:   interaction.options.getString('author')      ?? undefined,
          fields:       [],
        };
      });

      const saved = loadGuild(interaction.guild.id).savedEmbeds![rawName];
      const preview = buildEmbedPreview(saved);
      await interaction.editReply({
        content: `✅ Embed \`${rawName}\` created!\n📎 Use it with: \`/welcome message {embed:${rawName}}\`\n\n**Preview** (variables shown as placeholders):`,
        embeds:  [preview],
      });
      return;
    }

    // ── edit ──────────────────────────────────────────────────────────────────
    if (sub === 'edit') {
      const name = interaction.options.getString('name', true).toLowerCase().trim();
      const data = loadGuild(interaction.guild.id);
      if (!data.savedEmbeds?.[name]) {
        await interaction.editReply(`❌ No embed named \`${name}\` found. Use \`/embed list\` to see all embeds.`);
        return;
      }

      const colorRaw = interaction.options.getString('color');
      const color    = colorRaw ? parseColor(colorRaw) : null;
      if (colorRaw && color === null) {
        await interaction.editReply('❌ Invalid color. Use hex format like `#5865F2`.');
        return;
      }

      updateGuild(interaction.guild.id, d => {
        const e = d.savedEmbeds![name];
        const s = (key: string) => interaction.options.getString(key);
        if (s('title')       !== null) e.title        = s('title')       ?? undefined;
        if (s('description') !== null) e.description  = s('description') ?? undefined;
        if (s('thumbnail')   !== null) e.thumbnailUrl = s('thumbnail')   ?? undefined;
        if (s('image')       !== null) e.imageUrl     = s('image')       ?? undefined;
        if (s('footer')      !== null) e.footerText   = s('footer')      ?? undefined;
        if (s('author')      !== null) e.authorName   = s('author')      ?? undefined;
        if (colorRaw !== null) e.color = color ?? undefined;
      });

      const saved = loadGuild(interaction.guild.id).savedEmbeds![name];
      await interaction.editReply({
        content: `✅ Embed \`${name}\` updated!\n\n**Preview:**`,
        embeds:  [buildEmbedPreview(saved)],
      });
      return;
    }

    // ── addfield ──────────────────────────────────────────────────────────────
    if (sub === 'addfield') {
      const name = interaction.options.getString('name', true).toLowerCase().trim();
      const data = loadGuild(interaction.guild.id);
      if (!data.savedEmbeds?.[name]) {
        await interaction.editReply(`❌ No embed named \`${name}\` found.`);
        return;
      }
      if ((data.savedEmbeds[name].fields?.length ?? 0) >= 25) {
        await interaction.editReply('❌ Embeds can have at most 25 fields.');
        return;
      }
      updateGuild(interaction.guild.id, d => {
        const e = d.savedEmbeds![name];
        if (!e.fields) e.fields = [];
        e.fields.push({
          name:   interaction.options.getString('field_name', true),
          value:  interaction.options.getString('field_value', true),
          inline: interaction.options.getBoolean('inline') ?? false,
        });
      });
      const saved = loadGuild(interaction.guild.id).savedEmbeds![name];
      await interaction.editReply({ content: `✅ Field added to \`${name}\`.\n\n**Preview:**`, embeds: [buildEmbedPreview(saved)] });
      return;
    }

    // ── removefield ───────────────────────────────────────────────────────────
    if (sub === 'removefield') {
      const name  = interaction.options.getString('name', true).toLowerCase().trim();
      const index = interaction.options.getInteger('index', true) - 1; // convert to 0-based
      const data  = loadGuild(interaction.guild.id);
      if (!data.savedEmbeds?.[name]) {
        await interaction.editReply(`❌ No embed named \`${name}\` found.`);
        return;
      }
      const fields = data.savedEmbeds[name].fields ?? [];
      if (index < 0 || index >= fields.length) {
        await interaction.editReply(`❌ Field #${index + 1} doesn't exist. This embed has ${fields.length} field(s).`);
        return;
      }
      updateGuild(interaction.guild.id, d => {
        d.savedEmbeds![name].fields!.splice(index, 1);
      });
      const saved = loadGuild(interaction.guild.id).savedEmbeds![name];
      await interaction.editReply({ content: `✅ Field #${index + 1} removed from \`${name}\`.\n\n**Preview:**`, embeds: [buildEmbedPreview(saved)] });
      return;
    }

    // ── preview ───────────────────────────────────────────────────────────────
    if (sub === 'preview') {
      const name = interaction.options.getString('name', true).toLowerCase().trim();
      const data = loadGuild(interaction.guild.id);
      const saved = data.savedEmbeds?.[name];
      if (!saved) {
        await interaction.editReply(`❌ No embed named \`${name}\` found. Use \`/embed list\` to see all.`);
        return;
      }
      const fieldList = saved.fields?.length
        ? saved.fields.map((f, i) => `**${i + 1}.** ${f.name}${f.inline ? ' *(inline)*' : ''}`).join('\n')
        : 'No fields';
      await interaction.editReply({
        content: `🖼️ **Preview of \`${name}\`** — variables shown as placeholders\n📋 Fields:\n${fieldList}`,
        embeds:  [buildEmbedPreview(saved)],
      });
      return;
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const name = interaction.options.getString('name', true).toLowerCase().trim();
      const data = loadGuild(interaction.guild.id);
      if (!data.savedEmbeds?.[name]) {
        await interaction.editReply(`❌ No embed named \`${name}\` found.`);
        return;
      }
      updateGuild(interaction.guild.id, d => { delete d.savedEmbeds![name]; });
      await interaction.editReply(`🗑️ Embed \`${name}\` deleted.`);
    }
  },
};
