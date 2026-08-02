import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type BaseGuildTextChannel,
} from 'discord.js';
import type { Giveaway } from './types.js';
import { loadGuild, updateGuild } from './storage.js';

export function buildGiveawayEmbed(giveaway: Giveaway): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎉 GIVEAWAY 🎉')
    .addFields(
      { name: '🏆 Prize', value: giveaway.prize, inline: true },
      { name: '📋 Name', value: giveaway.name, inline: true },
      { name: '⏰ Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`, inline: true },
      { name: '🎟️ Entries', value: `${giveaway.entries.length}`, inline: true },
      { name: '👑 Hosted By', value: `<@${giveaway.hostId}>`, inline: true },
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.id}` })
    .setTimestamp(giveaway.endsAt);

  if (giveaway.requiredRoleId) {
    embed.addFields({ name: '✅ Required Role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
  }
  if (giveaway.blacklistRoleId) {
    embed.addFields({ name: '🚫 Blacklisted Role', value: `<@&${giveaway.blacklistRoleId}>`, inline: true });
  }
  if (giveaway.extraEntryRoles && giveaway.extraEntryRoles.length > 0) {
    const extraText = giveaway.extraEntryRoles
      .map(e => `<@&${e.roleId}>: **${e.entries}x** entries`)
      .join('\n');
    embed.addFields({ name: '⭐ Bonus Entries', value: extraText, inline: false });
  }
  if (giveaway.imageUrl) {
    embed.setImage(giveaway.imageUrl);
  }

  return embed;
}

export function buildGiveawayRow(giveawayId: string, entryCount = 0): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${giveawayId}`)
      .setLabel('🎉 Enter Giveaway')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`giveaway_leave:${giveawayId}`)
      .setLabel('🚪 Leave Giveaway')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`giveaway_participants:${giveawayId}`)
      .setLabel(`👥 Participants (${entryCount})`)
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildGiveawayEndedEmbed(giveaway: Giveaway, rerollPrefix = '.'): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🎉 GIVEAWAY ENDED')
    .addFields(
      { name: '🏆 Prize', value: giveaway.prize, inline: true },
      { name: '📋 Name', value: giveaway.name, inline: true },
      { name: '🎟️ Total Entries', value: `${giveaway.entries.length}`, inline: true },
      {
        name: '🏅 Winner',
        value: giveaway.winnerId ? `<@${giveaway.winnerId}>` : '*(No eligible entries)*',
        inline: false,
      },
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.id} • To reroll: ${rerollPrefix}random ${giveaway.id}` })
    .setTimestamp();
  if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl);
  return embed;
}

/**
 * Pick a new winner for a reroll, excluding the previous winner if enough
 * entries remain. Returns the new winner's user ID, or null if impossible.
 */
export async function rerollWinner(
  guild: Guild,
  giveaway: Giveaway,
): Promise<string | null> {
  const eligibleEntries = giveaway.entries.filter(id => id !== giveaway.winnerId);
  const pool = eligibleEntries.length > 0 ? eligibleEntries : giveaway.entries;
  if (pool.length === 0) return null;

  const weightedPool: string[] = [];
  for (const userId of pool) {
    let weight = 1;
    if (giveaway.extraEntryRoles && giveaway.extraEntryRoles.length > 0) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        for (const extra of giveaway.extraEntryRoles) {
          if (member.roles.cache.has(extra.roleId)) {
            weight = Math.max(weight, extra.entries);
          }
        }
      }
    }
    for (let i = 0; i < weight; i++) weightedPool.push(userId);
  }

  if (weightedPool.length === 0) return null;
  return weightedPool[Math.floor(Math.random() * weightedPool.length)] ?? null;
}

/**
 * Build a weighted entry pool for winner selection.
 * Each user gets 1 entry by default, plus bonus entries from extraEntryRoles
 * if the guild member holds that role (checked at draw time).
 */
export async function pickWinner(
  guild: Guild,
  giveaway: Giveaway,
): Promise<string | null> {
  if (giveaway.entries.length === 0) return null;

  const pool: string[] = [];

  for (const userId of giveaway.entries) {
    let weight = 1;
    if (giveaway.extraEntryRoles && giveaway.extraEntryRoles.length > 0) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        for (const extra of giveaway.extraEntryRoles) {
          if (member.roles.cache.has(extra.roleId)) {
            weight = Math.max(weight, extra.entries);
          }
        }
      }
    }
    for (let i = 0; i < weight; i++) pool.push(userId);
  }

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** End a giveaway: pick winner, update message, announce. Called from the loop. */
export async function endGiveaway(guild: Guild, giveaway: Giveaway): Promise<void> {
  const winnerId = await pickWinner(guild, giveaway);

  updateGuild(guild.id, data => {
    const g = data.giveaways.find(g => g.id === giveaway.id);
    if (g) {
      g.ended = true;
      g.winnerId = winnerId ?? undefined;
    }
  });

  try {
    const ch = await guild.channels.fetch(giveaway.channelId);
    if (!ch?.isTextBased()) return;
    const channel = ch as BaseGuildTextChannel;

    const rerollPrefix = loadGuild(guild.id).config.prefix ?? '.';
    const endedEmbed = buildGiveawayEndedEmbed({ ...giveaway, winnerId: winnerId ?? undefined }, rerollPrefix);

    const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [endedEmbed], components: [] }).catch(() => undefined);
    }

    if (winnerId) {
      await channel.send({
        content: `🎉 Congratulations <@${winnerId}>! You won **${giveaway.prize}** in **${giveaway.name}**!\n-# To pick a new winner: \`${rerollPrefix}random ${giveaway.id}\``,
        allowedMentions: { users: [winnerId] },
      });
    } else {
      await channel.send({
        content: `❌ The giveaway **${giveaway.name}** ended with no eligible entries.\n-# To retry: \`${rerollPrefix}random ${giveaway.id}\``,
      });
    }
  } catch {
    // channel inaccessible
  }
}
