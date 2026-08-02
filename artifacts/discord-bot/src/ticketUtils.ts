import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  EmbedBuilder,
  type Guild,
  type User,
  type Client,
  type TextChannel,
  type OverwriteResolvable,
} from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { generateId } from './utils.js';

export type TicketResult =
  | { success: true; channel: TextChannel }
  | { success: false; message: string };

export async function createTicketForUser(
  guild: Guild,
  user: User,
  client: Client,
  reason: string,
): Promise<TicketResult> {
  const data = loadGuild(guild.id);

  // Block duplicate open tickets
  const existing = Object.values(data.tickets).find(
    t => t.creatorId === user.id && !t.closed,
  );
  if (existing) {
    return {
      success: false,
      message: `You already have an open ticket: <#${existing.channelId}>. Please close it first.`,
    };
  }

  const ticketId = generateId();
  const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)}`;

  const overwrites: OverwriteResolvable[] = [
    // @everyone — hidden
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
      type: OverwriteType.Role,
    },
    // Ticket creator
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      type: OverwriteType.Member,
    },
    // Bot itself
    {
      id: client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
      ],
      type: OverwriteType.Member,
    },
  ];

  // Support role (set via /setup ticketrole)
  if (data.config.ticketSupportRole) {
    overwrites.push({
      id: data.config.ticketSupportRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      type: OverwriteType.Role,
    });
  }

  try {
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      ...(data.config.ticketCategory ? { parent: data.config.ticketCategory } : {}),
      permissionOverwrites: overwrites,
    }) as TextChannel;

    updateGuild(guild.id, d => {
      d.tickets[ticketId] = {
        id: ticketId,
        channelId: ticketChannel.id,
        creatorId: user.id,
        createdAt: Date.now(),
        closed: false,
      };
    });

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Ticket Opened')
      .setDescription(
        `Hello <@${user.id}>! Support staff will be with you shortly.\n\n**Your reason:**\n${reason}`,
      )
      .addFields({ name: 'Ticket ID', value: `\`${ticketId}\`` })
      .setFooter({ text: 'Use /closeticket to close this ticket when resolved.' })
      .setTimestamp();

    await ticketChannel.send({ embeds: [welcomeEmbed] });

    return { success: true, channel: ticketChannel };
  } catch (err) {
    console.error('Failed to create ticket:', err);
    return {
      success: false,
      message: 'Failed to create ticket channel. Make sure I have the Manage Channels permission.',
    };
  }
}
