import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { BLOX_VALUES } from './bloxvalue.js';
import { allEmojiEntries, emojiEligible, emojiNameForBlox, findBloxImageUrl, refreshBloxApplicationEmojis } from '../bloxEmojiManager.js';

const command = new SlashCommandBuilder()
  .setName('setbloxemojis')
  .setDescription('Create the Blox value emojis in the Discord app emoji library')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions.toString());

function sleep(ms:number){ return new Promise(resolve => setTimeout(resolve, ms)); }

export const setbloxemojis: Command = {
  data: command,
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      await interaction.reply({ content: '❌ You need **Create Expressions / Manage Expressions** permission to run this.', ephemeral: true });
      return;
    }
    const application = interaction.client.application;
    if (!application) {
      await interaction.reply({ content: '❌ The application is not ready yet. Try again in a moment.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const existing = await application.emojis.fetch();
    const entries = allEmojiEntries();
    let created = 0;
    let existingCount = 0;
    let failed = 0;
    let noImage = 0;
    const failures:string[] = [];

    for (const entry of entries) {
      const emojiName = emojiNameForBlox(entry.name);
      if (existing.some(e => e.name === emojiName)) {
        existingCount++;
        continue;
      }
      const imageUrl = await findBloxImageUrl(entry.name);
      if (!imageUrl) {
        noImage++;
        failures.push(`${entry.name}: no wiki icon found`);
        continue;
      }
      try {
        await application.emojis.create({ name: emojiName, attachment: imageUrl });
        created++;
        await sleep(250);
      } catch (error) {
        failed++;
        const detail = error instanceof Error ? error.message.slice(0, 90) : 'Discord rejected the upload';
        failures.push(`${entry.name}: ${detail}`);
      }
    }

    await refreshBloxApplicationEmojis(interaction.client);
    const skippedWeaponRelated = BLOX_VALUES.filter(entry => !emojiEligible(entry)).map(entry => entry.name);
    const limitNote = entries.length > 200 ? '\n⚠️ Discord application emojis are limited to 2,000 total; this set is below that limit.' : '';
    const failureText = failures.length ? `\n\n**Needs manual image/source:** ${failures.slice(0, 8).join(', ')}${failures.length > 8 ? ` +${failures.length - 8} more` : ''}` : '';
    const skippedText = skippedWeaponRelated.length ? `\n**Skipped restricted item entries:** ${skippedWeaponRelated.length}` : '';

    await interaction.editReply({
      content: `✅ **Blox emoji setup finished!**\n\n🆕 Created: **${created}**\n♻️ Already existed: **${existingCount}**\n🖼️ No source image: **${noImage}**\n❌ Upload failed: **${failed}**${skippedText}${limitNote}${failureText}\n\nThe Blox value lookup now automatically uses the app emojis when available.`,
    });
  },
};
