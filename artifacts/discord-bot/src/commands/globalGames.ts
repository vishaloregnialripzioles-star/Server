import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type Message,
} from 'discord.js';
import { GAME_DEFS, type GameName } from './games.js';
import { updateGuild } from '../storage.js';

interface GlobalPlayer {
  userId: string;
  guildId: string;
}

interface GlobalSession {
  id: string;
  game: (typeof GAME_DEFS)[number];
  players: GlobalPlayer[];
  messages: Map<string, Message>;
  choices: Map<string, string>;
  board: string[];
  turn: number;
  ended: boolean;
}

const queues = new Map<GameName, GlobalPlayer[]>();
const queuedUsers = new Set<string>();
const sessions = new Map<string, GlobalSession>();

const rand = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function addSparks(guildId: string, userId: string, amount: number): void {
  updateGuild(guildId, data => {
    data.sparks[userId] = (data.sparks[userId] ?? 0) + amount;
  });
}

function globalId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function gameByName(name: string) {
  return GAME_DEFS.find(game => game.name === name);
}

function globalControls(game: (typeof GAME_DEFS)[number], id: string): ActionRowBuilder<ButtonBuilder>[] {
  if (game.name === 'rps') {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`global:rps:${id}:rock`).setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`global:rps:${id}:paper`).setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`global:rps:${id}:scissors`).setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary),
    )];
  }

  if (game.name === 'xo' || game.name === 'hotxo') {
    return [0, 1, 2].map(row => new ActionRowBuilder<ButtonBuilder>().addComponents(
      [0, 1, 2].map(col => new ButtonBuilder()
        .setCustomId(`global:xo:${id}:${row * 3 + col}`)
        .setLabel('·')
        .setStyle(ButtonStyle.Primary)),
    ));
  }

  if (game.name === 'fastclick' || game.name === 'reveal') {
    const count = game.name === 'fastclick' ? 5 : 3;
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      Array.from({ length: count }, (_, index) => new ButtonBuilder()
        .setCustomId(`global:quick:${id}:${index}`)
        .setLabel(game.name === 'fastclick' ? String(index + 1) : '🂠')
        .setStyle(game.name === 'fastclick' ? ButtonStyle.Primary : ButtonStyle.Secondary)),
    )];
  }

  return [];
}

function baseEmbed(session: GlobalSession): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🌐 Global ${session.game.label}`)
    .setDescription(`Matched with **${session.players.length} random global player(s)** for **${session.game.label}**.\n\nWinner reward: **⚡ ${session.game.reward} sparks**`);
}

async function sendToPlayers(client: Client, session: GlobalSession, content: string): Promise<boolean> {
  let ok = 0;
  for (const player of session.players) {
    try {
      const user = await client.users.fetch(player.userId);
      const message = await user.send({
        embeds: [baseEmbed(session).setDescription(`${content}\n\nWinner reward: **⚡ ${session.game.reward} sparks**`)],
      });
      session.messages.set(player.userId, message);
      ok++;
    } catch {
      // DMs can be disabled for individual users.
    }
  }
  return ok === session.players.length;
}

async function finish(session: GlobalSession, winnerId: string | null, text: string): Promise<void> {
  if (session.ended) return;
  session.ended = true;

  if (winnerId) {
    const winner = session.players.find(player => player.userId === winnerId);
    if (winner) addSparks(winner.guildId, winner.userId, session.game.reward);
  }

  for (const player of session.players) {
    const message = session.messages.get(player.userId);
    if (!message) continue;
    await message.edit({
      embeds: [new EmbedBuilder()
        .setTitle(`🏆 Global ${session.game.label}`)
        .setDescription(text + (winnerId ? `\n\n🎉 Winner: <@${winnerId}> earned **⚡ ${session.game.reward} sparks**!` : '\n\n🤝 No sparks were awarded.'))
        .setTimestamp()],
      components: [],
    }).catch(() => undefined);
  }

  sessions.delete(session.id);
}

async function startTextRace(session: GlobalSession, answer: string, clue: string): Promise<void> {
  const collectors: Array<{ stop: () => void }> = [];
  for (const player of session.players) {
    const message = session.messages.get(player.userId);
    const channel = message?.channel;
    if (!channel?.isTextBased()) continue;

    const collector = channel.createMessageCollector({
      time: 30_000,
      filter: message => message.author.id === player.userId,
    });
    collector.on('collect', async message => {
      if (session.ended) return;
      if (message.content.trim().toLowerCase() !== answer.toLowerCase()) return;
      collectors.forEach(item => item.stop());
      await finish(session, player.userId, `Clue: **${clue}**\n\nThe first correct answer was **${message.content.trim()}**.`);
    });
    collectors.push({ stop: () => collector.stop() });
  }

  setTimeout(() => {
    if (!session.ended) {
      collectors.forEach(item => item.stop());
      void finish(session, null, `⏱️ Time is up.\n\nThe correct answer was **${answer}**.`);
    }
  }, 30_500);
}

async function startReplica(session: GlobalSession): Promise<void> {
  const pattern = Array.from({ length: 5 }, () => String(Math.floor(Math.random() * 4) + 1)).join(' ');
  for (const message of session.messages.values()) {
    await message.edit({
      embeds: [baseEmbed(session).setDescription(`Memorize this for **3 seconds**:\n\n**${pattern}**`)],
      components: [],
    }).catch(() => undefined);
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
  for (const message of session.messages.values()) {
    await message.edit({
      embeds: [baseEmbed(session).setDescription(`First player to send exactly:\n\n\`${pattern}\``)],
      components: [],
    }).catch(() => undefined);
  }
  await startTextRace(session, pattern, `First player to reproduce exactly: \`${pattern}\``);
}

async function startButtonRace(session: GlobalSession, winning: number): Promise<void> {
  const rows = globalControls(session.game, session.id);
  const collectors = session.players.map(player => {
    const message = session.messages.get(player.userId);
    if (!message) return null;
    const collector = message.createMessageComponentCollector({ time: 20_000 });
    collector.on('collect', async interaction => {
      if (session.ended || !interaction.isButton()) return;
      if (!interaction.customId.startsWith(`global:quick:${session.id}:`)) return;
      const selected = Number(interaction.customId.split(':').pop());
      if (selected !== winning) {
        await interaction.reply({ content: '❌ Wrong button!', ephemeral: true }).catch(() => undefined);
        return;
      }
      await interaction.deferUpdate().catch(() => undefined);
      collectors.forEach(item => item?.stop());
      await finish(session, player.userId, `⚡ <@${player.userId}> hit the winning button first!`);
    });
    return collector;
  });

  for (const message of session.messages.values()) {
    await message.edit({ embeds: [baseEmbed(session).setDescription('⚡ Be the first to hit the winning button!')], components: rows }).catch(() => undefined);
  }

  setTimeout(() => {
    if (!session.ended) {
      collectors.forEach(item => item?.stop());
      void finish(session, null, '⏱️ Nobody hit the winning button in time.');
    }
  }, 20_500);
}

async function startRps(session: GlobalSession): Promise<void> {
  const collectors = session.players.map(player => {
    const message = session.messages.get(player.userId);
    if (!message) return null;
    const collector = message.createMessageComponentCollector({ time: 30_000 });
    collector.on('collect', async interaction => {
      if (session.ended || !interaction.isButton()) return;
      if (!interaction.customId.startsWith(`global:rps:${session.id}:`)) return;
      const choice = interaction.customId.split(':').pop()!;
      if (session.choices.has(interaction.user.id)) {
        await interaction.reply({ content: 'Your choice is already locked.', ephemeral: true }).catch(() => undefined);
        return;
      }
      session.choices.set(interaction.user.id, choice);
      await interaction.deferUpdate().catch(() => undefined);
      await interaction.message.edit({ content: '✅ Choice locked. Waiting for the other player...', embeds: [], components: [] }).catch(() => undefined);

      if (session.choices.size < 2) return;
      const [a, b] = session.players.map(player => player.userId);
      const av = session.choices.get(a);
      const bv = session.choices.get(b);
      if (!av || !bv) return;
      if (av === bv) {
        collectors.forEach(item => item?.stop());
        await finish(session, null, '🤝 RPS ended in a draw.');
        return;
      }
      const beats = (x: string, y: string) =>
        (x === 'rock' && y === 'scissors') ||
        (x === 'paper' && y === 'rock') ||
        (x === 'scissors' && y === 'paper');
      const winner = beats(av, bv) ? a : b;
      collectors.forEach(item => item?.stop());
      await finish(session, winner, `✊ RPS: <@${winner}> played the winning choice.`);
    });
    return collector;
  });

  for (const message of session.messages.values()) {
    await message.edit({ embeds: [baseEmbed(session).setDescription('Choose Rock, Paper, or Scissors.')], components: globalControls(session.game, session.id) }).catch(() => undefined);
  }

  setTimeout(() => {
    if (!session.ended) {
      collectors.forEach(item => item?.stop());
      void finish(session, null, '⏱️ RPS timed out.');
    }
  }, 30_500);
}

async function startXo(session: GlobalSession): Promise<void> {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const collectors = session.players.map(player => {
    const message = session.messages.get(player.userId);
    if (!message) return null;
    const collector = message.createMessageComponentCollector({ time: 60_000 });
    collector.on('collect', async interaction => {
      if (session.ended || !interaction.isButton()) return;
      if (!interaction.customId.startsWith(`global:xo:${session.id}:`)) return;
      if (interaction.user.id !== session.players[session.turn].userId) {
        await interaction.reply({ content: 'Wait for your turn.', ephemeral: true }).catch(() => undefined);
        return;
      }
      const index = Number(interaction.customId.split(':').pop());
      if (session.board[index]) {
        await interaction.reply({ content: 'That square is taken.', ephemeral: true }).catch(() => undefined);
        return;
      }
      session.board[index] = session.turn === 0 ? 'X' : 'O';
      const current = session.board[index];
      const line = wins.find(row => row.every(position => session.board[position] === current));
      if (line) {
        const winner = interaction.user.id;
        collectors.forEach(item => item?.stop());
        await interaction.deferUpdate().catch(() => undefined);
        await finish(session, winner, `⭕ <@${winner}> completed a line and won!`);
        return;
      }
      if (session.board.every(Boolean)) {
        collectors.forEach(item => item?.stop());
        await interaction.deferUpdate().catch(() => undefined);
        await finish(session, null, '🤝 XO ended in a draw.');
        return;
      }
      session.turn = 1 - session.turn;
      await interaction.deferUpdate().catch(() => undefined);
      const rows = globalControls(session.game, session.id);
      rows.forEach((row, rowIndex) => row.components.forEach((button, colIndex) => {
        const index = rowIndex * 3 + colIndex;
        button.setLabel(session.board[index] || '·').setDisabled(Boolean(session.board[index]));
      }));
      for (const message of session.messages.values()) {
        await message.edit({
          embeds: [baseEmbed(session).setDescription(`❌ <@${session.players[0].userId}>  vs  ⭕ <@${session.players[1].userId}>\n\nTurn: <@${session.players[session.turn].userId}>`)],
          components: rows,
        }).catch(() => undefined);
      }
    });
    return collector;
  });

  const rows = globalControls(session.game, session.id);
  for (const message of session.messages.values()) {
    await message.edit({
      embeds: [baseEmbed(session).setDescription(`❌ <@${session.players[0].userId}>  vs  ⭕ <@${session.players[1].userId}>\n\nTurn: <@${session.players[0].userId}>`)],
      components: rows,
    }).catch(() => undefined);
  }

  setTimeout(() => {
    if (!session.ended) {
      collectors.forEach(item => item?.stop());
      void finish(session, null, '⏱️ XO timed out.');
    }
  }, 60_500);
}

async function startMatchedGame(client: Client, game: (typeof GAME_DEFS)[number], players: GlobalPlayer[]): Promise<void> {
  const session: GlobalSession = {
    id: globalId(),
    game,
    players,
    messages: new Map(),
    choices: new Map(),
    board: Array(9).fill(''),
    turn: 0,
    ended: false,
  };
  sessions.set(session.id, session);

  const sent = await sendToPlayers(client, session, `🌐 **Global matchmaking found ${players.length} player(s)!**`);
  if (!sent) {
    sessions.delete(session.id);
    for (const player of players) queuedUsers.delete(player.userId);
    const successful = players.filter(player => session.messages.has(player.userId));
    for (const player of successful) {
      queues.set(game.name, [...(queues.get(game.name) ?? []), player]);
      queuedUsers.add(player.userId);
      const message = session.messages.get(player.userId);
      await message?.edit({ embeds: [new EmbedBuilder().setTitle('🌐 Global matchmaking').setDescription('❌ I could not DM every player, so the match was cancelled. You were returned to the global queue.')], components: [] }).catch(() => undefined);
    }
    return;
  }

  for (const player of players) queuedUsers.delete(player.userId);

  if (game.name === 'rps') return startRps(session);
  if (game.name === 'xo' || game.name === 'hotxo') return startXo(session);
  if (game.name === 'fastclick' || game.name === 'reveal') return startButtonRace(session, Math.floor(Math.random() * (game.name === 'fastclick' ? 5 : 3)));
  if (game.name === 'replica') return startReplica(session);
  if (game.name === 'guessthecountry') return startTextRace(session, 'canada', '🍁🏒🍁');
  if (game.name === 'guessthedraw') return startTextRace(session, 'night house forest', '🌙🏠🌲');
  if (game.name === 'fasttype') return startTextRace(session, 'discord bot', 'Type: **discord bot**');
  if (game.name === 'textsplit') return startTextRace(session, 'discord | bot', 'Split **discord bot** into two words with `|`.');
  if (game.name === 'textmerge') return startTextRace(session, 'discordbot', 'Merge **discord | bot**.');
  if (game.name === 'flag') return startTextRace(session, 'india', '🇮🇳');
  if (game.name === 'textreverse') return startTextRace(session, 'redner', 'Reverse **render**.');
  if (game.name === 'findletter') return startTextRace(session, '4', 'Find the position of D in **D I S C O R D**.');
  if (game.name === 'correctletter') return startTextRace(session, 'P', 'Complete **S _ A R K S**.');
  if (game.name === 'sortnumbers') return startTextRace(session, '1 2 5 8 9', 'Sort **8 2 9 1 5**.');
  if (game.name === 'guesscolor') return startTextRace(session, 'blue', 'Guess the color: 🟦');
  if (game.name === 'emoji') return startTextRace(session, 'honey', '🐝 + 🍯');

  if (game.name === 'dice') {
    const rolls = players.map(player => ({ player, roll: Math.floor(Math.random() * 100) + 1 }));
    const winner = rolls.sort((a, b) => b.roll - a.roll)[0].player;
    await finish(session, winner.userId, rolls.map(item => `<@${item.player.userId}> rolled **${item.roll}**`).join('\n'));
    return;
  }

  const winner = rand(players);
  const descriptions: Record<string, string> = {
    roulette: '🎰 The global roulette landed on a winner.',
    mafia: '🕵️ The mafia round selected a winner.',
    chairs: '🪑 The last player standing won the chairs round.',
    deathwheel: '☠️ The deathwheel left one winner.',
    hideandseek: '🙈 The hider survived the global round.',
  };
  await finish(session, winner.userId, descriptions[game.name] ?? '🎮 The global round is complete.');
}

export async function handleGlobalButton(interaction: ButtonInteraction, client: Client): Promise<boolean> {
  const id = interaction.customId;
  if (!id.startsWith('global:')) return false;

  if (id.startsWith('global:queue:')) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ Global matchmaking can only be started from a server game.', ephemeral: true });
      return true;
    }

    const name = id.slice('global:queue:'.length) as GameName;
    const game = gameByName(name);
    if (!game) {
      await interaction.reply({ content: '❌ That game is no longer available.', ephemeral: true });
      return true;
    }
    if (queuedUsers.has(interaction.user.id)) {
      await interaction.reply({ content: '🔎 You are already searching for a global match. Wait for enough players.', ephemeral: true });
      return true;
    }

    const player = { userId: interaction.user.id, guildId: interaction.guildId };
    const queue = queues.get(name) ?? [];
    queue.push(player);
    queues.set(name, queue);
    queuedUsers.add(player.userId);

    if (queue.length < game.min) {
      await interaction.reply({
        content: `🔎 Searching for global **${game.label}** players… **${queue.length}/${game.min}** matched so far.`,
        ephemeral: true,
      });
      return true;
    }

    const players = queue.splice(0, Math.min(game.max, queue.length));
    queues.set(name, queue);
    await interaction.reply({
      content: `🌐 Match found! Connecting **${players.length}** random **${game.label}** players in DMs…`,
      ephemeral: true,
    });
    void startMatchedGame(client, game, players);
    return true;
  }

  return true;
}
