import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Collection,
} from 'discord.js';

export interface Command { data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>; execute(interaction: ChatInputCommandInteraction): Promise<void>; }
declare module 'discord.js' { interface Client { commands: Collection<string, Command>; } }
export type AutoModAction = 'delete' | 'warn' | 'timeout' | 'delete_timeout' | 'dm_warn';
export interface AutoModRule { enabled?: boolean; windowSeconds?: number; maxCount?: number; action?: AutoModAction; templateId?: string; }
export interface AutoModConfig { enabled: boolean; antiSpam?: boolean; antiScam?: boolean; massMentions?: boolean; suspiciousLinks?: boolean; spaceSpam?: boolean; bannedWords: string[]; antiScamWords?: string[]; action: AutoModAction; spam?: AutoModRule; mentions?: AutoModRule; space?: AutoModRule; bannedWordsRule?: AutoModRule; antiScamRule?: AutoModRule; suspiciousLinksRule?: AutoModRule; }
export interface ModerationTemplate { id: string; name: string; message: string; }
export type LoggingCategorySetting = boolean | string;
export interface LoggingConfig { enabled?: boolean; channelId?: string; categories?: Record<string, LoggingCategorySetting>; }
export interface GiveawayDailyConfig { enabled: boolean; channelId?: string; message?: string; }
export interface Config { logChannel?: string; muteRole?: string; jailRole?: string; chatBanRole?: string; ticketCategory?: string; ticketSupportRole?: string; starboardChannel?: string; starboardThreshold: number; levelChannel?: string; snipeEnabled: boolean; prefix?: string; levelRoles?: Record<string, string>; inviteRoles?: Record<string, string>; levelUpMessage?: { title?: string; description?: string; imageUrl?: string; }; automod?: AutoModConfig; moderationTemplates?: ModerationTemplate[]; logging?: LoggingConfig; giveawayDaily?: GiveawayDailyConfig; }
export interface AntiNukeConfig { enabled: boolean; whitelist: string[]; }
export interface AfkEntry { reason: string; timestamp: number; }
export interface LevelEntry { xp: number; level: number; lastMessage: number; }
export interface Warning { id: string; moderatorId: string; reason: string; timestamp: number; }
export interface Reminder { id: string; userId: string; channelId: string; guildId: string; message: string; due: number; }
export interface StarboardEntry { starboardMessageId: string; count: number; }
export interface SnipedMessage { content: string; authorId: string; authorName: string; authorAvatar: string | null; timestamp: number; imageUrl?: string; }
export interface TempRole { id: string; guildId: string; userId: string; roleId: string; expiresAt: number; }
export interface Ticket { id: string; channelId: string; creatorId: string; createdAt: number; closed: boolean; }
export interface AutoResponder { trigger: string; response: string; }
export interface EmbedField { name: string; value: string; inline?: boolean; }
export interface SavedEmbed { name: string; title?: string; description?: string; color?: number; thumbnailUrl?: string; imageUrl?: string; footerText?: string; footerIconUrl?: string; authorName?: string; authorIconUrl?: string; fields?: EmbedField[]; }
export interface WelcomeEmbed { enabled: boolean; title?: string; description?: string; color?: number; thumbnailUrl?: string; imageUrl?: string; footerText?: string; }
export interface WelcomeConfig { enabled: boolean; channelId?: string; message?: string; embed?: WelcomeEmbed; }
export interface ExtraEntryRole { roleId: string; entries: number; }
export interface Giveaway { id: string; guildId: string; channelId: string; messageId: string; name: string; prize: string; endsAt: number; hostId: string; donorId?: string; winnerCount?: number; winnerIds?: string[]; type?: string; pingRoleId?: string; customMessage?: string; hideEntryCount?: boolean; durationStr?: string; entries: string[]; requiredRoleId?: string; blacklistRoleId?: string; extraEntryRoles?: ExtraEntryRole[]; imageUrl?: string; ended: boolean; winnerId?: string; }
export interface ShopRoleItem { id: string; name: string; roleId: string; position: number; price: number; }
export interface ShopColourItem { id: string; name: string; color?: number; price: number; roleId?: string; }
export interface ShopCustomRole { id: string; userId: string; shopRoleId: string; roleId: string; }
export interface ShopConfig { roles: ShopRoleItem[]; colours: ShopColourItem[]; customRoles: ShopCustomRole[]; }
export interface RecoveryRole { id: string; name: string; color: number; hoist: boolean; mentionable: boolean; permissions: string; position: number; }
export interface RecoveryOverwrite { id: string; type: number; allow: string; deny: string; }
export interface RecoveryChannel { id: string; name: string; type: number; position: number; parentId?: string; topic?: string; nsfw?: boolean; permissionOverwrites: RecoveryOverwrite[]; }
export interface RecoveryEmoji { id: string; name: string; url: string; animated: boolean; roles: string[]; }
export interface RecoveryGuildSettings { name: string; iconUrl?: string; verificationLevel: number; explicitContentFilter: number; defaultMessageNotifications: number; afkTimeout: number; systemChannelId?: string; rulesChannelId?: string; publicUpdatesChannelId?: string; safetyAlertsChannelId?: string; afkChannelId?: string; }
export interface RecoveryBackup { id: string; name: string; createdAt: number; guild: RecoveryGuildSettings; roles: RecoveryRole[]; channels: RecoveryChannel[]; emojis: RecoveryEmoji[]; }
export interface GuildData { config: Config; antiNuke: AntiNukeConfig; extraOwners: string[]; afk: Record<string, AfkEntry>; levels: Record<string, LevelEntry>; sparks: Record<string, number>; invites: Record<string, number>; warnings: Record<string, Warning[]>; reminders: Reminder[]; starboard: Record<string, StarboardEntry>; lastDeleted: Record<string, SnipedMessage[]>; lastEdited: Record<string, SnipedMessage[]>; tempRoles: TempRole[]; tickets: Record<string, Ticket>; autoResponders: AutoResponder[]; giveaways: Giveaway[]; savedEmbeds: Record<string, SavedEmbed>; welcome?: WelcomeConfig; shop: ShopConfig; recoveryBackups: RecoveryBackup[]; }
