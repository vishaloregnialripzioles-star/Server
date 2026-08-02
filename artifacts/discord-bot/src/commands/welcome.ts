import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import {
  buildWelcomeEmbed,
  buildWelcomeEmbedPreview,
  parseColor,
  resolveVariables,
  resolveWelcomeSend,
  DEFAULT_WELCOME_MESSAGE,
  VARIABLES_HELP,
} from '../welcomeUtils.js';

export const welcome: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure the welcome message system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── Top-level subcommands ─────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Set the channel where welcome messages are sent')
        .addChannelOption(o =>
          o.setName('channel').setDescription('Welcome channel').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('message')
        .setDescription('Set the plain text shown above the embed (default: "Welcome {user}")')
        .addStringOption(o =>
          o.setName('text')
            .setDescription('Plain text. Use {user}, {server}, {membercount}, etc.')
            .setRequired(true)
            .setMaxLength(2000),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('enable')
        .setDescription('Enable the welcome system'),
    )
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Disable the welcome system (keeps your settings)'),
    )
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Send a test welcome message to the welcome channel as yourself'),
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current welcome configuration'),
    )

    // ── /welcome embed subcommand group ───────────────────────────────────────
    .addSubcommandGroup(group =>
      group
        .setName('embed')
        .setDescription('Configure the welcome embed shown below the plain text')
        .addSubcommand(sub =>
          sub.setName('set')
            .setDescription('Set embed fields (leave blank to keep existing values)')
            .addStringOption(o =>
              o.setName('title')
                .setDescription('Embed title — supports variables like {server}, {user.name}')
                .setMaxLength(256),
            )
            .addStringOption(o =>
              o.setName('description')
                .setDescription('Embed body text — supports variables, channel mentions, emoji')
                .setMaxLength(4000),
            )
            .addStringOption(o =>
              o.setName('color')
                .setDescription('Hex color e.g. #5865F2 or FF0000'),
            )
            .addStringOption(o =>
              o.setName('thumbnail')
                .setDescription('Top-right image URL, or {user.avatar} / {server.icon}'),
            )
            .addStringOption(o =>
              o.setName('image')
                .setDescription('Large banner image URL at the bottom of the embed'),
            )
            .addStringOption(o =>
              o.setName('footer')
                .setDescription('Footer text — supports variables')
                .setMaxLength(2048),
            ),
        )
        .addSubcommand(sub =>
          sub.setName('toggle')
            .setDescription('Enable or disable the embed (keeps all embed settings)'),
        )
        .addSubcommand(sub =>
          sub.setName('clear')
            .setDescription('Remove all embed settings and start fresh'),
        )
        .addSubcommand(sub =>
          sub.setName('preview')
            .setDescription('Preview the current embed with placeholder values'),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

    // ════════════════════════════════════════════════════════════════════════════
    // /welcome embed *
    // ════════════════════════════════════════════════════════════════════════════
    if (group === 'embed') {

      // ── /welcome embed set ─────────────────────────────────────────────────
      if (sub === 'set') {
        const title       = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorStr    = interaction.options.getString('color');
        const thumbnail   = interaction.options.getString('thumbnail');
        const image       = interaction.options.getString('image');
        const footer      = interaction.options.getString('footer');

        if (!title && !description && !colorStr && !thumbnail && !image && !footer) {
          await interaction.editReply(
            '⚠️ No fields provided. Pass at least one option to update the embed.',
          );
          return;
        }

        const color = colorStr ? parseColor(colorStr) : undefined;
        if (colorStr && color === undefined) {
          await interaction.editReply('❌ Invalid color — use hex format like `#5865F2` or `FF0000`.');
          return;
        }

        updateGuild(interaction.guild.id, d => {
          if (!d.welcome)       d.welcome       = { enabled: true };
          if (!d.welcome.embed) d.welcome.embed = { enabled: true };
          if (title       !== null) d.welcome.embed.title       = title ?? undefined;
          if (description !== null) d.welcome.embed.description = description ?? undefined;
          if (color       !== undefined) d.welcome.embed.color  = color;
          if (thumbnail   !== null) d.welcome.embed.thumbnailUrl = thumbnail ?? undefined;
          if (image       !== null) d.welcome.embed.imageUrl    = image ?? undefined;
          if (footer      !== null) d.welcome.embed.footerText  = footer ?? undefined;
          d.welcome.embed.enabled = true;
        });

        const saved = loadGuild(interaction.guild.id).welcome?.embed;
        const preview = saved ? buildWelcomeEmbedPreview(saved) : new EmbedBuilder().setDescription('*(no embed fields set yet)*');
        await interaction.editReply({
          content: '✅ Embed updated! Here\'s a preview with placeholder variables:\n💡 Run `/welcome test` to see it in the welcome channel.',
          embeds: [preview],
        });
        return;
      }

      // ── /welcome embed toggle ──────────────────────────────────────────────
      if (sub === 'toggle') {
        const data = loadGuild(interaction.guild.id);
        const current = data.welcome?.embed?.enabled ?? false;
        updateGuild(interaction.guild.id, d => {
          if (!d.welcome)       d.welcome       = { enabled: true };
          if (!d.welcome.embed) d.welcome.embed = { enabled: !current };
          else d.welcome.embed.enabled = !current;
        });
        await interaction.editReply(
          current ? '✅ Welcome embed **disabled**. Plain text message will still send.' : '✅ Welcome embed **enabled**.',
        );
        return;
      }

      // ── /welcome embed clear ───────────────────────────────────────────────
      if (sub === 'clear') {
        updateGuild(interaction.guild.id, d => {
          if (d.welcome) d.welcome.embed = undefined;
        });
        await interaction.editReply('🗑️ Embed cleared. The welcome message will now be plain text only.');
        return;
      }

      // ── /welcome embed preview ─────────────────────────────────────────────
      if (sub === 'preview') {
        const data = loadGuild(interaction.guild.id);
        const cfg  = data.welcome?.embed;
        if (!cfg) {
          await interaction.editReply('❌ No embed configured yet. Use `/welcome embed set` to build one.');
          return;
        }
        const plainText = data.welcome?.message ?? DEFAULT_WELCOME_MESSAGE;
        await interaction.editReply({
          content:
            `**Preview** *(variables shown as placeholders)*\n` +
            `📝 Plain text: \`${plainText.replace(/\{user\}/g, '@NewMember')}\``,
          embeds: [buildWelcomeEmbedPreview(cfg)],
        });
        return;
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Top-level subcommands
    // ════════════════════════════════════════════════════════════════════════════

    // ── /welcome channel ───────────────────────────────────────────────────────
    if (sub === 'channel') {
      const ch = interaction.options.getChannel('channel', true);
      updateGuild(interaction.guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: true };
        d.welcome.channelId = ch.id;
        d.welcome.enabled   = true;
      });
      await interaction.editReply(
        `✅ Welcome channel set to <#${ch.id}>.\n` +
        `💡 Default message: \`Welcome {user}\` — change with \`/welcome message\`\n` +
        `💡 Add an embed with \`/welcome embed set\``,
      );
      return;
    }

    // ── /welcome message ───────────────────────────────────────────────────────
    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      updateGuild(interaction.guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: true };
        d.welcome.message = text;
        d.welcome.enabled = true;
      });
      await interaction.editReply(
        `✅ Plain text message set!\n\`\`\`\n${text.slice(0, 300)}\n\`\`\`` +
        `\n💡 Run \`/welcome test\` to preview it in the channel.`,
      );
      return;
    }

    // ── /welcome enable ────────────────────────────────────────────────────────
    if (sub === 'enable') {
      updateGuild(interaction.guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: true };
        d.welcome.enabled = true;
      });
      await interaction.editReply('✅ Welcome system enabled.');
      return;
    }

    // ── /welcome disable ───────────────────────────────────────────────────────
    if (sub === 'disable') {
      updateGuild(interaction.guild.id, d => {
        if (!d.welcome) d.welcome = { enabled: false };
        d.welcome.enabled = false;
      });
      await interaction.editReply('✅ Welcome system disabled. Your settings are saved — use `/welcome enable` to turn it back on.');
      return;
    }

    // ── /welcome view ──────────────────────────────────────────────────────────
    if (sub === 'view') {
      const data = loadGuild(interaction.guild.id);
      const w    = data.welcome;
      const emb  = w?.embed;

      const embedLines = emb
        ? [
            `**Status:** ${emb.enabled ? '✅ Enabled' : '❌ Disabled'}`,
            emb.title       ? `**Title:** ${emb.title}` : null,
            emb.description ? `**Description:** ${emb.description.slice(0, 100)}${emb.description.length > 100 ? '…' : ''}` : null,
            emb.thumbnailUrl ? `**Thumbnail:** ${emb.thumbnailUrl}` : null,
            emb.imageUrl    ? `**Image:** ${emb.imageUrl}` : null,
            emb.footerText  ? `**Footer:** ${emb.footerText}` : null,
            emb.color !== undefined ? `**Color:** #${emb.color.toString(16).padStart(6, '0').toUpperCase()}` : null,
          ].filter(Boolean).join('\n')
        : '*(not configured — use `/welcome embed set`)*';

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('👋 Welcome System Configuration')
        .addFields(
          { name: '📊 Status',   value: w?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '📢 Channel',  value: w?.channelId ? `<#${w.channelId}>` : '*(not set)*', inline: true },
          { name: '\u200b',      value: '\u200b', inline: true },
          {
            name:  '💬 Plain Text (above embed)',
            value: `\`${(w?.message ?? DEFAULT_WELCOME_MESSAGE).slice(0, 500)}\``,
          },
          { name: '🖼️ Embed', value: embedLines },
          { name: '🔤 Variables', value: VARIABLES_HELP },
        )
        .setFooter({ text: 'Tip: /welcome embed set → /welcome test to preview' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /welcome test ──────────────────────────────────────────────────────────
    if (sub === 'test') {
      const data = loadGuild(interaction.guild.id);
      const w    = data.welcome;

      if (!w?.channelId) {
        await interaction.editReply('❌ No welcome channel set. Use `/welcome channel` first.');
        return;
      }

      const channel = interaction.guild.channels.cache.get(w.channelId) as TextChannel | undefined;
      if (!channel?.isTextBased()) {
        await interaction.editReply('❌ Welcome channel not found or is not a text channel.');
        return;
      }

      const member = interaction.member as GuildMember;
      const { content, embeds } = resolveWelcomeSend(w, member, data.savedEmbeds ?? {});

      try {
        await channel.send({ content, embeds });
        await interaction.editReply(`✅ Test welcome sent to <#${w.channelId}>!`);
      } catch {
        await interaction.editReply('❌ Failed — check I have permission to send messages in that channel.');
      }
    }
  },
};
