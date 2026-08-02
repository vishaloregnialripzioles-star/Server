import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types.js';

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const poll: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with up to 10 options')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3'))
    .addStringOption(o => o.setName('option4').setDescription('Option 4'))
    .addStringOption(o => o.setName('option5').setDescription('Option 5'))
    .addStringOption(o => o.setName('option6').setDescription('Option 6'))
    .addStringOption(o => o.setName('option7').setDescription('Option 7'))
    .addStringOption(o => o.setName('option8').setDescription('Option 8'))
    .addStringOption(o => o.setName('option9').setDescription('Option 9'))
    .addStringOption(o => o.setName('option10').setDescription('Option 10')),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const options: string[] = [];

    for (let i = 1; i <= 10; i++) {
      const opt = interaction.options.getString(`option${i}`);
      if (opt) options.push(opt);
    }

    if (options.length < 2) {
      await interaction.reply({ content: '❌ You need at least 2 options.', flags: 64 });
      return;
    }

    const description = options
      .map((opt, i) => `${EMOJI_NUMBERS[i]} ${opt}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 ${question}`)
      .setDescription(description)
      .setFooter({ text: `Poll by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    const sent = await interaction.fetchReply();

    // Add reaction emojis
    for (let i = 0; i < options.length; i++) {
      await sent.react(EMOJI_NUMBERS[i]).catch(() => undefined);
    }
  },
};
