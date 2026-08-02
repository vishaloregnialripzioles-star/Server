import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild } from '../storage.js';
import { resolveWelcomeSend } from '../welcomeUtils.js';

export const greet: Command = {
  data: new SlashCommandBuilder()
    .setName('greet')
    .setDescription('Test the welcome message as if a member just joined')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Member to greet (defaults to you)'),
    ),

  async execute(interaction) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });

    const data = loadGuild(interaction.guild.id);
    const w    = data.welcome;

    if (!w?.enabled) {
      await interaction.editReply(
        '❌ Welcome system is disabled. Enable it with `/welcome enable` first.',
      );
      return;
    }
    if (!w.channelId) {
      await interaction.editReply(
        '❌ No welcome channel set. Use `/welcome channel` first.',
      );
      return;
    }

    const channel = interaction.guild.channels.cache.get(w.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      await interaction.editReply('❌ Welcome channel not found or is not a text channel.');
      return;
    }

    // Resolve the target member — fallback to command invoker
    const targetUser = interaction.options.getUser('user');
    let member: GuildMember;
    if (targetUser) {
      const fetched = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!fetched) {
        await interaction.editReply('❌ Could not fetch that member from this server.');
        return;
      }
      member = fetched;
    } else {
      member = interaction.member as GuildMember;
    }

    const { content, embeds } = resolveWelcomeSend(w, member, data.savedEmbeds ?? {});

    try {
      await channel.send({ content, embeds });
      await interaction.editReply(
        `✅ Welcome message sent to <#${w.channelId}> for ${member}.`,
      );
    } catch {
      await interaction.editReply(
        '❌ Failed to send — check I have permission to send messages in that channel.',
      );
    }
  },
};
