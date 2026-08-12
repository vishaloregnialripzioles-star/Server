import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { games, GAME_DEFS, type GameName } from './games.js';

const details: Record<GameName, { icon: string; title: string; description: string; how: string; tips?: string }> = {
  roulette: { icon: '🎡', title: 'Roulette', description: 'Join the wheel and one player is selected as the winner.', how: '1. Join the lobby.\n2. Wait until the 30-second lobby ends.\n3. One participating player is selected as the winner.', tips: 'More players means more competition.' },
  xo: { icon: '⭕', title: 'XO', description: 'Classic 1v1 tic-tac-toe.', how: '1. Two players join.\n2. Take turns placing X and O.\n3. Get three in a row to win.', tips: 'Watch the middle and corners.' },
  mafia: { icon: '🕵️', title: 'Mafia', description: 'A quick social-deduction style round.', how: '1. Join with at least 4 players.\n2. The game selects the mafia and a round winner.\n3. The winner receives Sparks.', tips: 'Stay alert and watch the round.' },
  chairs: { icon: '🪑', title: 'Chairs', description: 'A musical-chairs style elimination game.', how: '1. Join the lobby.\n2. The round selects the surviving player.\n3. The winner receives Sparks.', tips: 'Only one winner takes the main reward.' },
  rps: { icon: '✊', title: 'Rock Paper Scissors', description: 'Classic 1v1 Rock, Paper, Scissors.', how: '1. Two players join.\n2. Choose Rock, Paper, or Scissors.\n3. The winning choice wins the round.', tips: 'Rock beats Scissors, Scissors beats Paper, Paper beats Rock.' },
  dice: { icon: '🎲', title: 'Dice', description: 'Everyone rolls a random number and the highest roll wins.', how: '1. Join the lobby.\n2. Each player gets a random roll from 1–100.\n3. The highest roll wins.', tips: 'Luck decides this one.' },
  deathwheel: { icon: '☠️', title: 'Deathwheel', description: 'A random survival game where one safe player remains.', how: '1. Join the lobby.\n2. The round selects a surviving player.\n3. The survivor wins the Sparks.', tips: 'Risk it for the reward.' },
  hotxo: { icon: '🔥', title: 'Hot XO', description: 'XO with a hot-square twist.', how: '1. Two players join.\n2. Play tic-tac-toe by taking turns.\n3. Complete a winning line to earn Sparks.', tips: 'The hot variant rewards careful moves.' },
  hideandseek: { icon: '🙈', title: 'Hide & Seek', description: 'One seeker is selected and a hidden survivor wins.', how: '1. Join with at least 3 players.\n2. A seeker is selected.\n3. A different player is selected as the surviving hider.', tips: 'The hidden winner gets the main reward.' },
  replica: { icon: '🧩', title: 'Replica', description: 'Memorize a random pattern and copy it exactly.', how: '1. A random 5-number pattern appears for 3 seconds.\n2. The pattern disappears.\n3. Send the exact pattern first to win.', tips: 'Spacing matters.' },
  guessthecountry: { icon: '🌍', title: 'Guess The Country', description: 'Guess a country. The geographically closest valid guess wins the most Sparks.', how: '1. A hidden target country is selected.\n2. Each member can submit one valid country name.\n3. Your country flag appears beside your name.\n4. Results are ranked by geographic distance to the target.', tips: 'Only one country guess per player per round.' },
  guessthedraw: { icon: '🎨', title: 'Guess The Draw', description: 'Guess the idea represented by a random emoji/ASCII-style drawing.', how: '1. A random drawing clue appears.\n2. Send your guess in the channel.\n3. The first correct player wins.', tips: 'Answer quickly.' },
  fastclick: { icon: '⚡', title: 'Fast Click', description: 'Be the first player to click the correct target.', how: '1. A set of targets appears.\n2. Click the winning target.\n3. The first correct player wins.', tips: 'Speed matters.' },
  fasttype: { icon: '⌨️', title: 'Fast Type', description: 'Type a randomly selected phrase faster than everyone else.', how: '1. A random phrase is shown.\n2. Type it exactly in the channel.\n3. The first correct message wins.', tips: 'Every round uses a random phrase.' },
  textsplit: { icon: '✂️', title: 'Text Split', description: 'Split a randomly selected phrase into the required word format.', how: '1. A random phrase is shown.\n2. Rewrite it using `/` between words.\n3. The first exact answer wins.', tips: 'The phrase changes every round.' },
  textmerge: { icon: '🔗', title: 'Text Merge', description: 'Merge randomly shuffled text chunks into the required answer.', how: '1. Random chunks are shown.\n2. Merge them with no spaces.\n3. The first exact answer wins.', tips: 'Read every chunk carefully.' },
  flag: { icon: '🏳️', title: 'Flag', description: 'Identify a randomly selected country from its flag.', how: '1. A random country flag appears.\n2. Type the country name.\n3. The first correct answer wins.', tips: 'Country aliases such as USA/UK are accepted where configured.' },
  textreverse: { icon: '🔄', title: 'Text Reverse', description: 'Reverse a random word as fast as possible.', how: '1. A random word appears.\n2. Reverse all of its letters.\n3. Send the reversed word first.', tips: 'Do not add extra spaces.' },
  findletter: { icon: '🔎', title: 'Find Letter', description: 'Find the letter at a requested position in random text.', how: '1. A random text and position are shown.\n2. Find the requested character.\n3. Send that character first.', tips: 'Count positions from the beginning.' },
  correctletter: { icon: '🔤', title: 'Correct Letter', description: 'Find the missing letter in a random word.', how: '1. A random word appears with one letter hidden.\n2. Identify the missing letter.\n3. Send it first.', tips: 'Answer with the letter only.' },
  sortnumbers: { icon: '🔢', title: 'Sort Numbers', description: 'Sort a random set of numbers from smallest to largest.', how: '1. Random numbers appear.\n2. Sort them in ascending order.\n3. Send the exact sequence first.', tips: 'Separate numbers with spaces.' },
  guesscolor: { icon: '🎨', title: 'Guess Color', description: 'Guess the color represented by a random color clue.', how: '1. A random color clue appears.\n2. Type the color name.\n3. The first correct answer wins.', tips: 'Answer with the color name.' },
  emoji: { icon: '😀', title: 'Emoji', description: 'Guess the phrase represented by a random emoji clue.', how: '1. A random emoji combination appears.\n2. Work out the phrase.\n3. The first exact answer wins.', tips: 'Think about what the emojis mean together.' },
  reveal: { icon: '🃏', title: 'Reveal', description: 'Choose the hidden winning card before another player does.', how: '1. Several hidden cards appear.\n2. Pick one card.\n3. Pick the winning card to receive Sparks.', tips: 'There is only one winning card.' },
};

function pageButtons(page: number, total: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`games:prev:${page}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`games:next:${page}`).setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= total - 1),
    new ButtonBuilder().setCustomId(`games:close:${page}`).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
  );
}

function makePage(page: number) {
  const total = GAME_DEFS.length + 1;
  if (page === 0) {
    const server = GAME_DEFS.filter(g => g.category === 'Server Games').map(g => `• **${g.name}** — ⚡${g.reward}`).join('\n');
    const quick = GAME_DEFS.filter(g => g.category === 'Quick Games').map(g => `• **${g.name}** — ⚡${g.reward}`).join('\n');
    return new EmbedBuilder()
      .setTitle('🎮 Sparxie Games')
      .setDescription('Welcome to the Sparxie Games section!\n\nPlay games in your server, compete with other members, and **win ⚡ Sparks**. Use your Sparks in the shop for rewards, roles, and customization items.\n\n📖 **Want to know how a game works?** Use the **Next ▶** button to open the information page for each game. Every game has its own page with how to play, player limits, and Sparks reward.')
      .addFields(
        { name: '🎯 Server Games', value: server || 'None', inline: false },
        { name: '⚡ Quick Games', value: quick || 'None', inline: false },
        { name: '🪙 Sparks', value: 'Win Sparks by playing and use them in the server shop.', inline: false },
      )
      .setFooter({ text: `Page 1/${total} • Use /game name:<game> to play` });
  }

  const game = GAME_DEFS[page - 1];
  const info = details[game.name];
  return new EmbedBuilder()
    .setTitle(`${info.icon} ${info.title}`)
    .setDescription(info.description)
    .addFields(
      { name: '👥 Players', value: `${game.min}–${game.max} players`, inline: true },
      { name: '⚡ Sparks', value: `Winner: **${game.reward} Sparks**`, inline: true },
      { name: '🎮 How to play', value: info.how, inline: false },
      { name: '💡 Tip', value: info.tips ?? 'Play fast and have fun!', inline: false },
    )
    .setFooter({ text: `Page ${page + 1}/${total} • /game name:${game.name}` });
}

async function showGames(interaction: ChatInputCommandInteraction | ButtonInteraction, page: number) {
  const total = GAME_DEFS.length + 1;
  const safePage = Math.max(0, Math.min(page, total - 1));
  const payload = { embeds: [makePage(safePage)], components: [pageButtons(safePage, total)] };
  if (interaction.isButton()) await interaction.update(payload);
  else await interaction.reply(payload);
}

const originalExecute = games.execute;
games.execute = async (interaction) => {
  await showGames(interaction as ChatInputCommandInteraction, 0);
  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({ time: 120_000 });
  collector.on('collect', async (button) => {
    if (!button.customId.startsWith('games:')) return;
    if (button.user.id !== interaction.user.id) {
      await button.reply({ content: 'Only the person who opened the games menu can use these buttons.', ephemeral: true });
      return;
    }
    const [, action, rawPage] = button.customId.split(':');
    const current = Number(rawPage);
    if (action === 'close') {
      collector.stop('closed');
      await button.update({ embeds: [new EmbedBuilder().setTitle('🎮 Sparxie Games').setDescription('Games menu closed. Use `/games` again whenever you want to browse the games.')], components: [] });
      return;
    }
    await showGames(button, action === 'next' ? current + 1 : current - 1);
  });
  collector.once('end', async (_, reason) => {
    if (reason === 'closed') return;
    await interaction.editReply({ components: [] }).catch(() => undefined);
  });
};

void originalExecute;
