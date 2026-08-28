import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../types.js';

type ChannelBlock = { name: string; channels: string[] };

function cleanName(value: string): string {
  return value.trim().replace(/^[-•*]+\s*/, '').slice(0, 100);
}

function parseChannelLayout(input: string): ChannelBlock[] {
  const blocks: ChannelBlock[] = [];
  let current: ChannelBlock | null = null;

  for (const rawLine of input.replace(/\r/g, '').split('\n')) {
    const line = cleanName(rawLine);
    if (!line) continue;

    // Supports both the correct spelling and the user's "catogery" spelling.
    const categoryMatch = line.match(/^(.+?)\s*-\s*(?:category|catogery)\s*$/i);

    if (categoryMatch) {
      const name = cleanName(categoryMatch[1]);
      if (!name) throw new Error('A category name is empty.');
      current = { name, channels: [] };
      blocks.push(current);
      continue;
    }

    if (!current) {
      throw new Error(`\`${line}\` is not under a category. Add a line such as \`Hybrid - category\` first.`);
    }

    current.channels.push(line);
  }

  if (!blocks.length) throw new Error('No categories were found. End each category line with `- category`.');
  return blocks;
}

function parseRoleNames(input: string): string[] {
  const roles: string[] = [];
  for (const rawLine of input.replace(/\r/g, '').split('\n')) {
    const name = cleanName(rawLine);
    if (name) roles.push(name);
  }
  if (!roles.length) throw new Error('Enter at least one role name.');
  return roles;
}

export const autosetup: Command = {
  data: new SlashCommandBuilder()
    .setName('autosetup')
    .setDescription('Create multiple channels/categories or roles in one setup')
    .addSubcommand(sub =>
      sub
        .setName('channels')
        .setDescription('Create categories and channels from a multi-line layout')
        .addStringOption(option =>
          option
            .setName('layout')
            .setDescription('Example: Hybrid - category, then Chill chat and Yelling area on new lines')
            .setRequired(true)
            .setMaxLength(6000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('roles')
        .setDescription('Create multiple roles from a multi-line list')
        .addStringOption(option =>
          option
            .setName('roles')
            .setDescription('One role name per line; the first name is placed highest')
            .setRequired(true)
            .setMaxLength(6000),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', flags: 64 });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const neededPermission = subcommand === 'channels'
      ? PermissionFlagsBits.ManageChannels
      : PermissionFlagsBits.ManageRoles;

    if (!interaction.memberPermissions?.has(neededPermission)) {
      await interaction.reply({
        content: `❌ You need the **${subcommand === 'channels' ? 'Manage Channels' : 'Manage Roles'}** permission to use this command.`,
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      if (subcommand === 'channels') {
        const layout = interaction.options.getString('layout', true);
        const blocks = parseChannelLayout(layout);
        const requestedChannels = blocks.reduce((total, block) => total + block.channels.length, 0);

        if (blocks.length > 100 || requestedChannels > 400) {
          throw new Error('That setup is too large for one run. Use fewer than 100 categories and 400 channels.');
        }

        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
          throw new Error('I need the **Manage Channels** permission.');
        }

        const created: { id: string; position: number }[] = [];
        let offset = 0;
        const startingPosition = interaction.guild.channels.cache.size;

        for (const block of blocks) {
          const category = await interaction.guild.channels.create({
            name: block.name,
            type: ChannelType.GuildCategory,
            reason: `Auto setup by ${interaction.user.tag}`,
          });
          created.push({ id: category.id, position: startingPosition + offset++ });

          for (const channelName of block.channels) {
            const channel = await interaction.guild.channels.create({
              name: channelName,
              type: ChannelType.GuildText,
              parent: category.id,
              reason: `Auto setup by ${interaction.user.tag}`,
            });
            created.push({ id: channel.id, position: startingPosition + offset++ });
          }
        }

        // Apply the exact order from the supplied layout after every item exists.
        for (const item of created) {
          const channel = await interaction.guild.channels.fetch(item.id).catch(() => null);
          if (channel) await channel.setPosition(item.position).catch(() => undefined);
        }

        const summary = blocks.map(block =>
          `**${block.name}**\n${block.channels.length ? block.channels.map(name => `└ #${name}`).join('\n') : '└ *(empty category)*'}`,
        ).join('\n\n');

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Auto Channel Setup Complete')
            .setDescription(summary.slice(0, 3900))
            .setFooter({ text: `${blocks.length} categories • ${requestedChannels} channels created in the order you entered` }),
          ],
        });
        return;
      }

      const input = interaction.options.getString('roles', true);
      const roleNames = parseRoleNames(input);
      if (roleNames.length > 100) throw new Error('Use 100 or fewer roles in one setup.');

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error('I need the **Manage Roles** permission.');
      }

      const botTopPosition = botMember.roles.highest.position;
      if (botTopPosition <= 1) {
        throw new Error('My highest role is too low to place new roles. Move my bot role above the roles I should manage.');
      }

      const createdRoles = [];
      for (const name of roleNames) {
        const role = await interaction.guild.roles.create({
          name,
          permissions: 0n,
          reason: `Auto setup by ${interaction.user.tag}`,
        });
        createdRoles.push(role);
      }

      // First entered role = highest created role, then each next role appears below it.
      for (let index = 0; index < createdRoles.length; index++) {
        const targetPosition = Math.max(1, botTopPosition - 1 - index);
        await createdRoles[index].setPosition(targetPosition).catch(() => undefined);
      }

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Auto Role Setup Complete')
          .setDescription(createdRoles.map((role, index) => `${index + 1}. <@&${role.id}>`).join('\n').slice(0, 3900))
          .setFooter({ text: 'The first name you entered was placed highest.' }),
        ],
        allowedMentions: { roles: [] },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown setup error.';
      await interaction.editReply(`❌ **Auto setup failed:** ${message}`).catch(() => undefined);
    }
  },
};
