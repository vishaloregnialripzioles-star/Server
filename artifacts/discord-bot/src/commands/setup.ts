import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild, loadGuild } from '../storage.js';
import { addColourSetup, setupShopRole, setupShopColour } from './shop.js';

export const setup: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Set the log channel for moderation actions')
        .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('muterole')
        .setDescription('Set the Muted role')
        .addRoleOption(o => o.setName('role').setDescription('Muted role').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('jailrole')
        .setDescription('Set the Jail role')
        .addRoleOption(o => o.setName('role').setDescription('Jail role').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('chatbanrole')
        .setDescription('Set the Chat Ban role')
        .addRoleOption(o => o.setName('role').setDescription('Chat Ban role').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('ticketcategory')
        .setDescription('Set the category where ticket channels are created')
        .addStringOption(o => o.setName('category_id').setDescription('Category channel ID').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('starboard')
        .setDescription('Configure the starboard channel')
        .addChannelOption(o => o.setName('channel').setDescription('Starboard channel').setRequired(true))
        .addIntegerOption(o => o.setName('threshold').setDescription('Star threshold (default 3)').setMinValue(1).setMaxValue(50)),
    )
    .addSubcommand(sub =>
      sub.setName('levelchannel')
        .setDescription('Set where level-up announcements are sent')
        .addChannelOption(o => o.setName('channel').setDescription('Level-up channel').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('levelrole')
        .setDescription('Assign a role when a member reaches a specific level')
        .addIntegerOption(o => o.setName('level').setDescription('Level required').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('ticketrole')
        .setDescription('Set the role that can see and respond to all tickets')
        .addRoleOption(o => o.setName('role').setDescription('Support/staff role').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('snipe')
        .setDescription('Enable or disable the snipe system')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable snipe').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('shoprole')
        .setDescription('Add a purchasable role to the sparks shop (server owner only)')
        .addStringOption(o => o.setName('name').setDescription('Role/shop item name').setRequired(true))
        .addIntegerOption(o => o.setName('position').setDescription('Display position in the shop').setRequired(true).setMinValue(1).setMaxValue(1000))
        .addIntegerOption(o => o.setName('coins').setDescription('Price in ⚡ sparks').setRequired(true).setMinValue(0)),
    )
    .addSubcommandGroup(group =>
      group.setName('shop')
        .setDescription('Configure the sparks shop (server owner only)')
        .addSubcommand(sub =>
          addColourSetup(
            sub.setName('colour').setDescription('Add a purchasable colour to the sparks shop'),
          ),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current configuration'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    if (group === 'shop' && sub === 'colour') {
      await setupShopColour(interaction);
      return;
    }
    if (sub === 'shoprole') {
      await setupShopRole(interaction);
      return;
    }

    if (sub === 'view') {
      const data = loadGuild(interaction.guild.id);
      const cfg = data.config;
      const levelRolesText = cfg.levelRoles && Object.keys(cfg.levelRoles).length > 0
        ? Object.entries(cfg.levelRoles)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([lvl, roleId]) => `Level ${lvl} → <@&${roleId}>`)
            .join('\n')
        : 'None set';
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Server Configuration')
        .addFields(
          { name: '📋 Log Channel', value: cfg.logChannel ? `<#${cfg.logChannel}>` : 'Not set', inline: true },
          { name: '🔇 Mute Role', value: cfg.muteRole ? `<@&${cfg.muteRole}>` : 'Not set', inline: true },
          { name: '🔒 Jail Role', value: cfg.jailRole ? `<@&${cfg.jailRole}>` : 'Not set', inline: true },
          { name: '💬 Chat Ban Role', value: cfg.chatBanRole ? `<@&${cfg.chatBanRole}>` : 'Not set', inline: true },
          { name: '🎫 Ticket Category', value: cfg.ticketCategory ? `<#${cfg.ticketCategory}>` : 'Not set', inline: true },
          { name: '🎫 Ticket Support Role', value: cfg.ticketSupportRole ? `<@&${cfg.ticketSupportRole}>` : 'Not set', inline: true },
          { name: '⭐ Starboard Channel', value: cfg.starboardChannel ? `<#${cfg.starboardChannel}>` : 'Not set', inline: true },
          { name: '⭐ Starboard Threshold', value: `${cfg.starboardThreshold} stars`, inline: true },
          { name: '📈 Level Channel', value: cfg.levelChannel ? `<#${cfg.levelChannel}>` : 'Current channel', inline: true },
          { name: '🔍 Snipe', value: cfg.snipeEnabled ? 'Enabled' : 'Disabled', inline: true },
          { name: '🏅 Level Roles', value: levelRolesText },
          { name: '🛍️ Sparks Shop', value: `${data.shop.roles.length} role(s) · ${data.shop.colours.length} colour(s)` },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    await interaction.deferReply();

    updateGuild(interaction.guild.id, data => {
      switch (sub) {
        case 'logs': {
          const ch = interaction.options.getChannel('channel', true);
          data.config.logChannel = ch.id;
          break;
        }
        case 'muterole': {
          const role = interaction.options.getRole('role', true);
          data.config.muteRole = role.id;
          break;
        }
        case 'jailrole': {
          const role = interaction.options.getRole('role', true);
          data.config.jailRole = role.id;
          break;
        }
        case 'chatbanrole': {
          const role = interaction.options.getRole('role', true);
          data.config.chatBanRole = role.id;
          break;
        }
        case 'ticketcategory': {
          const catId = interaction.options.getString('category_id', true);
          data.config.ticketCategory = catId;
          break;
        }
        case 'ticketrole': {
          const role = interaction.options.getRole('role', true);
          data.config.ticketSupportRole = role.id;
          break;
        }
        case 'starboard': {
          const ch = interaction.options.getChannel('channel', true);
          const threshold = interaction.options.getInteger('threshold');
          data.config.starboardChannel = ch.id;
          if (threshold !== null) data.config.starboardThreshold = threshold;
          break;
        }
        case 'levelchannel': {
          const ch = interaction.options.getChannel('channel', true);
          data.config.levelChannel = ch.id;
          break;
        }
        case 'levelrole': {
          const level = interaction.options.getInteger('level', true);
          const role = interaction.options.getRole('role', true);
          if (!data.config.levelRoles) data.config.levelRoles = {};
          data.config.levelRoles[String(level)] = role.id;
          break;
        }
        case 'snipe': {
          data.config.snipeEnabled = interaction.options.getBoolean('enabled', true);
          break;
        }
      }
    });

    if (sub === 'levelrole') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      await interaction.editReply({ content: `✅ Members who reach **Level ${level}** will now receive <@&${role.id}>.` });
    } else {
      await interaction.editReply({ content: `✅ Configuration updated for **${sub}**.` });
    }
  },
};
