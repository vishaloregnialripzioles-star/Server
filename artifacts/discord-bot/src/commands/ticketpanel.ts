import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
} from 'discord.js';
import type { Command } from '../types.js';

export const ticketpanel: Command = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send a ticket panel with an Open Ticket button to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Channel to post the panel in')
        .setRequired(true),
    )
    .addStringOption(o =>
      o.setName('title')
        .setDescription('Panel title (default: Support Tickets)'),
    )
    .addStringOption(o =>
      o.setName('description')
        .setDescription('Panel description'),
    )
    .addStringOption(o =>
      o.setName('color')
        .setDescription('Embed color hex (e.g. #5865F2)'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.options.getChannel('channel', true);
    const title = interaction.options.getString('title') ?? '🎫 Support Tickets';
    const description =
      interaction.options.getString('description') ??
      'Need help or have a question?\nClick the button below to open a private ticket — our staff will be with you shortly.';
    const colorInput = interaction.options.getString('color');

    let color = 0x5865F2;
    if (colorInput) {
      const parsed = parseInt(colorInput.replace('#', ''), 16);
      if (!isNaN(parsed)) color = parsed;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫'),
    );

    try {
      await (channel as unknown as TextChannel).send({ embeds: [embed], components: [row] });
      await interaction.editReply(`✅ Ticket panel sent to <#${channel.id}>.`);
    } catch {
      await interaction.editReply(
        '❌ Failed to send panel. Make sure I have permission to send messages in that channel.',
      );
    }
  },
};
