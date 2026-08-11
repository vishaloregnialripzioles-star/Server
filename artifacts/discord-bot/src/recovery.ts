import { ChannelType, type Guild, type GuildChannel, type OverwriteData } from 'discord.js';
import type { RecoveryBackup, RecoveryChannel, RecoveryEmoji, RecoveryRole } from './types.js';

function serializeOverwrites(channel: GuildChannel): RecoveryChannel['permissionOverwrites'] {
  return channel.permissionOverwrites.cache.map(overwrite => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  }));
}

function serializeChannel(channel: GuildChannel): RecoveryChannel {
  const c = channel as any;
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition,
    parentId: channel.parentId,
    topic: typeof c.topic === 'string' ? c.topic : undefined,
    nsfw: typeof c.nsfw === 'boolean' ? c.nsfw : undefined,
    rateLimitPerUser: typeof c.rateLimitPerUser === 'number' ? c.rateLimitPerUser : undefined,
    bitrate: typeof c.bitrate === 'number' ? c.bitrate : undefined,
    userLimit: typeof c.userLimit === 'number' ? c.userLimit : undefined,
    rtcRegion: c.rtcRegion ?? undefined,
    videoQualityMode: c.videoQualityMode ?? undefined,
    defaultAutoArchiveDuration: c.defaultAutoArchiveDuration ?? undefined,
    defaultThreadRateLimitPerUser: c.defaultThreadRateLimitPerUser ?? undefined,
    defaultForumLayout: c.defaultForumLayout ?? undefined,
    defaultSortOrder: c.defaultSortOrder ?? undefined,
    permissionOverwrites: serializeOverwrites(channel),
  };
}

function serializeRole(role: any): RecoveryRole {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
  };
}

function serializeEmoji(emoji: any): RecoveryEmoji {
  return {
    id: emoji.id,
    name: emoji.name ?? 'emoji',
    url: emoji.url,
    animated: Boolean(emoji.animated),
    roles: emoji.roles?.cache?.map((r: any) => r.id) ?? [],
  };
}

export async function createRecoveryBackup(guild: Guild): Promise<RecoveryBackup> {
  await guild.channels.fetch();
  await guild.roles.fetch();
  await guild.emojis.fetch().catch(() => undefined);

  const channels = [...guild.channels.cache.values()]
    .filter(channel => channel.type !== ChannelType.GuildDirectory)
    .map(serializeChannel)
    .sort((a, b) => a.position - b.position);

  const roles = [...guild.roles.cache.values()]
    .filter(role => !role.managed && role.id !== guild.id)
    .map(serializeRole)
    .sort((a, b) => a.position - b.position);

  const emojis = [...guild.emojis.cache.values()]
    .filter(emoji => Boolean(emoji.url))
    .map(serializeEmoji);

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${guild.name} • ${new Date().toLocaleString('en-IN')}`,
    createdAt: Date.now(),
    guild: {
      name: guild.name,
      iconUrl: guild.iconURL({ extension: 'png', size: 1024 }) ?? undefined,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      afkTimeout: guild.afkTimeout,
      systemChannelId: guild.systemChannelId ?? undefined,
      rulesChannelId: guild.rulesChannelId ?? undefined,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ?? undefined,
      safetyAlertsChannelId: (guild as any).safetyAlertsChannelId ?? undefined,
      afkChannelId: guild.afkChannelId ?? undefined,
    },
    roles,
    channels,
    emojis,
  };
}

function channelCreateOptions(snapshot: RecoveryChannel, parentId?: string): any {
  const options: any = {
    name: snapshot.name,
    type: snapshot.type,
    parent: parentId,
    topic: snapshot.topic,
    nsfw: snapshot.nsfw,
    rateLimitPerUser: snapshot.rateLimitPerUser,
    bitrate: snapshot.bitrate,
    userLimit: snapshot.userLimit,
    rtcRegion: snapshot.rtcRegion,
    videoQualityMode: snapshot.videoQualityMode,
    defaultAutoArchiveDuration: snapshot.defaultAutoArchiveDuration,
    defaultThreadRateLimitPerUser: snapshot.defaultThreadRateLimitPerUser,
    defaultForumLayout: snapshot.defaultForumLayout,
    defaultSortOrder: snapshot.defaultSortOrder,
  };
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

export async function restoreRecoveryBackup(guild: Guild, backup: RecoveryBackup): Promise<{ roles: number; channels: number; emojis: number; skipped: string[] }> {
  const skipped: string[] = [];
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) throw new Error('I could not fetch my bot member.');
  await guild.members.fetch().catch(() => undefined);

  if (!botMember.permissions.has('ManageChannels') || !botMember.permissions.has('ManageRoles')) {
    throw new Error('I need **Manage Channels** and **Manage Roles** to restore a recovery save.');
  }

  const progress = await guild.channels.create({
    name: 'recovery-in-progress',
    type: ChannelType.GuildText,
    topic: 'Temporary recovery channel — it will be removed automatically.',
    reason: 'Server recovery in progress',
  });

  try {
    for (const channel of [...guild.channels.cache.values()]) {
      if (channel.id === progress.id) continue;
      await channel.delete('Server recovery: restoring saved structure')
        .catch(() => skipped.push(`Could not delete #${channel.name}`));
    }

    const roleMap = new Map<string, string>();
    const roles = [...backup.roles].sort((a, b) => a.position - b.position);
    for (const snapshot of roles) {
      try {
        const role = await guild.roles.create({
          name: snapshot.name,
          color: snapshot.color,
          hoist: snapshot.hoist,
          mentionable: snapshot.mentionable,
          permissions: BigInt(snapshot.permissions),
          reason: 'Server recovery: restoring saved role',
        });
        roleMap.set(snapshot.id, role.id);
      } catch {
        skipped.push(`Could not recreate role ${snapshot.name}`);
      }
    }

    for (const snapshot of roles) {
      const newId = roleMap.get(snapshot.id);
      if (!newId) continue;
      const role = guild.roles.cache.get(newId);
      if (!role || !role.editable) continue;
      const maxPosition = Math.max(1, botMember.roles.highest.position - 1);
      await role.setPosition(Math.max(1, Math.min(snapshot.position, maxPosition)), 'Server recovery: restoring role position').catch(() => undefined);
    }

    const channelMap = new Map<string, string>();
    const categories = backup.channels.filter(channel => channel.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
    const children = backup.channels.filter(channel => channel.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);

    const makeOverwrites = (snapshot: RecoveryChannel): OverwriteData[] => snapshot.permissionOverwrites
      .map(overwrite => ({
        id: overwrite.type === 0 ? (roleMap.get(overwrite.id) ?? overwrite.id) : overwrite.id,
        type: overwrite.type as 0 | 1,
        allow: BigInt(overwrite.allow),
        deny: BigInt(overwrite.deny),
      }));

    for (const snapshot of [...categories, ...children]) {
      try {
        const parentId = snapshot.parentId ? channelMap.get(snapshot.parentId) : undefined;
        const options = channelCreateOptions(snapshot, parentId);
        const overwrites = makeOverwrites(snapshot);
        if (overwrites.length) options.permissionOverwrites = overwrites;
        const channel = await guild.channels.create(options);
        channelMap.set(snapshot.id, channel.id);
      } catch {
        skipped.push(`Could not recreate channel ${snapshot.name}`);
      }
    }

    for (const snapshot of backup.channels) {
      const newId = channelMap.get(snapshot.id);
      if (!newId) continue;
      const channel = guild.channels.cache.get(newId);
      if (channel) await channel.setPosition(snapshot.position).catch(() => undefined);
    }

    const settings: any = backup.guild;
    const guildEdit: any = {
      name: settings.name,
      verificationLevel: settings.verificationLevel,
      explicitContentFilter: settings.explicitContentFilter,
      defaultMessageNotifications: settings.defaultMessageNotifications,
      afkTimeout: settings.afkTimeout,
    };
    await guild.edit(guildEdit).catch(() => undefined);

    const channelSettings: any = {};
    for (const [field, oldId] of Object.entries({
      systemChannelId: settings.systemChannelId,
      rulesChannelId: settings.rulesChannelId,
      publicUpdatesChannelId: settings.publicUpdatesChannelId,
      safetyAlertsChannelId: settings.safetyAlertsChannelId,
      afkChannelId: settings.afkChannelId,
    })) {
      if (oldId && channelMap.has(oldId as string)) channelSettings[field] = channelMap.get(oldId as string);
    }
    if (Object.keys(channelSettings).length) await guild.edit(channelSettings).catch(() => undefined);

    let emojiCount = 0;
    for (const emojiSnapshot of backup.emojis) {
      try {
        const emoji = await guild.emojis.create({
          attachment: emojiSnapshot.url,
          name: emojiSnapshot.name,
          reason: 'Server recovery: restoring saved emoji',
        });
        const restoredRoles = emojiSnapshot.roles.map(id => roleMap.get(id)).filter(Boolean) as string[];
        if (restoredRoles.length) await emoji.roles.set(restoredRoles).catch(() => undefined);
        emojiCount++;
      } catch {
        skipped.push(`Could not recreate emoji ${emojiSnapshot.name}`);
      }
    }

    await progress.send(`✅ Recovery completed. Restored **${roleMap.size} roles**, **${channelMap.size} channels** and **${emojiCount} emojis**.${skipped.length ? `\n⚠️ ${skipped.length} item(s) could not be restored.` : ''}`).catch(() => undefined);
    setTimeout(() => { void progress.delete('Server recovery complete').catch(() => undefined); }, 5000);
    return { roles: roleMap.size, channels: channelMap.size, emojis: emojiCount, skipped };
  } catch (error) {
    await progress.send(`⚠️ Recovery stopped: ${error instanceof Error ? error.message : 'unknown error'}`).catch(() => undefined);
    throw error;
  }
}
