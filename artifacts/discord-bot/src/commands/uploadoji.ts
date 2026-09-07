import { SlashCommandBuilder, type Attachment, type CommandInteraction } from 'discord.js';
import type { Command } from '../types.js';

const MAX_BYTES = 256 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function cleanName(input: string): string {
  const value = input.trim().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return value.slice(0, 32);
}

function ownerIds(): Set<string> {
  return new Set([
    process.env.OWNER_USER_ID ?? '',
    ...(process.env.OWNER_USER_IDS ?? '').split(/[\s,]+/),
    '1405884975860940854',
  ].map(x => x.trim()).filter(Boolean));
}

async function isDeveloper(interaction: any): Promise<boolean> {
  if (ownerIds().has(interaction.user.id)) return true;
  try {
    const app = interaction.client.application;
    const owner = app?.owner ?? (await app?.fetch())?.owner;
    if (owner && 'id' in owner) return owner.id === interaction.user.id;
    if (owner && 'members' in owner) return Boolean(owner.members?.has(interaction.user.id));
  } catch {}
  return false;
}

async function upload(application: any, attachment: Attachment, requestedName?: string) {
  if (!attachment.contentType || !IMAGE_TYPES.has(attachment.contentType)) throw new Error('Only PNG, JPG, WEBP, and GIF images are supported.');
  if (attachment.size > MAX_BYTES) throw new Error('Emoji must be 256 KB or smaller.');
  const name = cleanName(requestedName || attachment.name || 'emoji');
  if (name.length < 2) throw new Error('Emoji name must contain at least 2 letters/numbers/underscores.');
  const emoji = await application.emojis.create({ name, attachment: attachment.url });
  return emoji;
}

export const uploadoji: Command = {
  data: new SlashCommandBuilder()
    .setName('uploadoji')
    .setDescription('Upload an emoji image to this Discord application')
    .addAttachmentOption(option => option.setName('emoji').setDescription('PNG, JPG, WEBP or GIF emoji image').setRequired(true))
    .addStringOption(option => option.setName('name').setDescription('Optional emoji name').setRequired(false).setMaxLength(32)),
  async execute(interaction: CommandInteraction & any) {
    if (!(await isDeveloper(interaction))) {
      await interaction.reply({ content: '❌ Developer-only command.', ephemeral: true });
      return;
    }
    const attachment = interaction.options.getAttachment('emoji', true) as Attachment;
    const requestedName = interaction.options.getString('name') ?? undefined;
    await interaction.deferReply({ ephemeral: true });
    try {
      const emoji = await upload(interaction.client.application, attachment, requestedName);
      await interaction.editReply(`✅ **Emoji uploaded to the Discord Developer Portal application emojis.**\n\n**Name:** \`${emoji.name}\`\n**Full name:** \`${emoji.toString()}\`\n**ID:** \`${emoji.id}\``);
    } catch (error) {
      await interaction.editReply(`❌ ${error instanceof Error ? error.message : 'Discord rejected the emoji upload.'}`);
    }
  },
};

export async function uploadEmojiFromMessage(message: any, requestedName?: string): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;
  if (!ownerIds().has(message.author.id)) return false;
  const application = message.client.application;
  if (!application) return false;
  const attachment = message.attachments.first() as Attachment | undefined;
  if (!attachment) {
    await message.reply('❌ Attach the emoji image to the same message.').catch(() => undefined);
    return true;
  }
  try {
    const emoji = await upload(application, attachment, requestedName);
    await message.reply(`✅ **Emoji uploaded to the application emojis.**\n**Name:** \`${emoji.name}\`\n**Full name:** \`${emoji.toString()}\`\n**ID:** \`${emoji.id}\``).catch(() => undefined);
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Discord rejected the emoji upload.'}`).catch(() => undefined);
  }
  return true;
}
