import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';

export type GameName =
  | 'roulette' | 'xo' | 'mafia' | 'chairs' | 'rps' | 'dice' | 'deathwheel' | 'hotxo'
  | 'hideandseek' | 'replica' | 'guessthecountry' | 'guessthedraw'
  | 'fastclick' | 'fasttype' | 'textsplit' | 'textmerge' | 'flag' | 'textreverse'
  | 'findletter' | 'correctletter' | 'sortnumbers' | 'guesscolor' | 'emoji' | 'reveal';

interface GameDef { name: GameName; label: string; category: 'Server Games' | 'Quick Games'; min: number; max: number; reward: number; description: string; }

export const GAME_DEFS: GameDef[] = [
  { name:'roulette', label:'roulette', category:'Server Games', min:2, max:12, reward:30, description:'Join the wheel and one player wins.' },
  { name:'xo', label:'xo', category:'Server Games', min:2, max:2, reward:35, description:'Classic 1v1 tic-tac-toe.' },
  { name:'mafia', label:'mafia', category:'Server Games', min:4, max:12, reward:50, description:'A quick social-deduction round.' },
  { name:'chairs', label:'chairs', category:'Server Games', min:3, max:12, reward:35, description:'Musical-chairs style elimination.' },
  { name:'rps', label:'rps', category:'Server Games', min:2, max:2, reward:20, description:'Rock, paper, scissors.' },
  { name:'dice', label:'dice', category:'Server Games', min:2, max:12, reward:20, description:'Highest roll wins.' },
  { name:'deathwheel', label:'deathwheel', category:'Server Games', min:2, max:12, reward:40, description:'One safe seat remains.' },
  { name:'hotxo', label:'hotxo', category:'Server Games', min:2, max:2, reward:40, description:'Tic-tac-toe with a hot square.' },
  { name:'hideandseek', label:'hideandseek', category:'Server Games', min:3, max:12, reward:40, description:'One seeker, one hidden winner.' },
  { name:'replica', label:'replica', category:'Server Games', min:2, max:12, reward:30, description:'Copy the pattern fastest.' },
  { name:'guessthecountry', label:'guessthecountry', category:'Server Games', min:1, max:12, reward:30, description:'Guess the country from a clue.' },
  { name:'guessthedraw', label:'guessthedraw', category:'Server Games', min:2, max:12, reward:35, description:'Guess a tiny emoji/ASCII drawing.' },
  { name:'fastclick', label:'fastclick', category:'Quick Games', min:1, max:12, reward:10, description:'Click first.' },
  { name:'fasttype', label:'fasttype', category:'Quick Games', min:1, max:12, reward:10, description:'Type the phrase first.' },
  { name:'textsplit', label:'textsplit', category:'Quick Games', min:1, max:12, reward:10, description:'Split the phrase correctly.' },
  { name:'textmerge', label:'textmerge', category:'Quick Games', min:1, max:12, reward:10, description:'Merge the chunks correctly.' },
  { name:'flag', label:'flag', category:'Quick Games', min:1, max:12, reward:10, description:'Pick the country from the flag clue.' },
  { name:'textreverse', label:'textreverse', category:'Quick Games', min:1, max:12, reward:10, description:'Reverse the text.' },
  { name:'findletter', label:'findletter', category:'Quick Games', min:1, max:12, reward:10, description:'Find the requested letter position.' },
  { name:'correctletter', label:'correctletter', category:'Quick Games', min:1, max:12, reward:10, description:'Choose the missing letter.' },
  { name:'sortnumbers', label:'sortnumbers', category:'Quick Games', min:1, max:12, reward:10, description:'Sort the numbers fastest.' },
  { name:'guesscolor', label:'guesscolor', category:'Quick Games', min:1, max:12, reward:10, description:'Guess the color.' },
  { name:'emoji', label:'emoji', category:'Quick Games', min:1, max:12, reward:10, description:'Guess the emoji clue.' },
  { name:'reveal', label:'reveal', category:'Quick Games', min:1, max:12, reward:10, description:'Pick the hidden winning card.' },
];

const byName = new Map(GAME_DEFS.map(g => [g.name, g]));
const rand = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const shuffle = <T>(a: T[]): T[] => [...a].sort(() => Math.random() - .5);

function addSparks(guildId: string, userId: string, amount: number): void {
  updateGuild(guildId, d => { d.sparks[userId] = (d.sparks[userId] ?? 0) + amount; });
}

function joinRow(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${id}:join`).setLabel('🎮 Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${id}:start`).setLabel('▶️ Start').setStyle(ButtonStyle.Primary),
  );
}

async function lobby(interaction: ChatInputCommandInteraction, game: GameDef): Promise<string[]> {
  const players = new Set<string>([interaction.user.id]);
  const id = `game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const message = await interaction.reply({
    fetchReply: true,
    embeds: [new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`**${game.description}**\n\nPlayers: <@${interaction.user.id}>\n\nNeed at least **${game.min}** player(s). Click **Join** to enter.`).setFooter({ text: `Winner reward: ⚡ ${game.reward} sparks` })],
    components: [joinRow(id)],
  });
  const collector = message.createMessageComponentCollector({ time: 45_000 });
  let started = false;
  collector.on('collect', async i => {
    if (i.customId === `${id}:join`) {
      if (players.has(i.user.id)) { await i.reply({ content:'You are already in.', ephemeral:true }); return; }
      if (players.size >= game.max) { await i.reply({ content:'This game is full.', ephemeral:true }); return; }
      players.add(i.user.id);
      await i.update({ embeds: [new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`**${game.description}**\n\nPlayers (${players.size}/${game.max}): ${[...players].map(x => `<@${x}>`).join(', ')}\n\nNeed at least **${game.min}** player(s).`)], components: [joinRow(id)] });
    } else if (i.customId === `${id}:start`) {
      if (i.user.id !== interaction.user.id) { await i.reply({ content:'Only the game creator can start it.', ephemeral:true }); return; }
      if (players.size < game.min) { await i.reply({ content:`Need at least ${game.min} players.`, ephemeral:true }); return; }
      started = true;
      collector.stop('started');
      await i.update({ embeds: [new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`Starting with ${players.size} players…`)], components: [] });
    }
  });
  await new Promise<void>(resolve => collector.once('end', () => resolve()));
  if (!started) { await message.edit({ embeds:[new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(players.size >= game.min ? 'Game lobby closed.' : `Not enough players joined (${players.size}/${game.min}).`)], components:[] }).catch(()=>{}); return []; }
  return [...players];
}

async function award(interaction: ChatInputCommandInteraction, game: GameDef, winnerId: string): Promise<void> {
  addSparks(interaction.guild!.id, winnerId, game.reward);
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🏆 ${game.label} winner`).setDescription(`🎉 <@${winnerId}> won and earned **⚡ ${game.reward} sparks**!`).setTimestamp()], components: [] });
}

async function runMultiplayer(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  if (game.name === 'dice') {
    const rolls = ids.map(id => ({ id, n: Math.floor(Math.random()*100)+1 })).sort((a,b)=>b.n-a.n);
    await award(interaction, game, rolls[0].id); return;
  }
  if (game.name === 'roulette' || game.name === 'chairs' || game.name === 'deathwheel') {
    await award(interaction, game, rand(ids)); return;
  }
  if (game.name === 'hideandseek') {
    const seeker = rand(ids); const hidden = rand(ids.filter(x => x !== seeker));
    await interaction.editReply({ embeds:[new EmbedBuilder().setTitle('🙈 Hide & Seek').setDescription(`The seeker was <@${seeker}>. The hider who survived was <@${hidden}>.`)] });
    await award(interaction, game, hidden); return;
  }
  if (game.name === 'mafia') {
    const mafia = rand(ids); const winner = rand(ids);
    await interaction.editReply({ embeds:[new EmbedBuilder().setTitle('🕵️ Mafia').setDescription(`A quick mafia round was played. The mafia was <@${mafia}>.\n\nRound winner: <@${winner}>.`)] });
    await award(interaction, game, winner); return;
  }
  if (game.name === 'rps') { await runRps(interaction, game, ids); return; }
  if (game.name === 'xo' || game.name === 'hotxo') { await runXo(interaction, game, ids); return; }
  if (game.name === 'replica') { await runReplica(interaction, game, ids); return; }
  if (game.name === 'guessthecountry' || game.name === 'guessthedraw') { await runTextRace(interaction, game, ids); return; }
  await award(interaction, game, rand(ids));
}

async function runRps(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const choices = new Map<string,string>();
  const rows = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rps:rock').setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps:paper').setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps:scissors').setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary),
  );
  const msg = await interaction.editReply({ embeds:[new EmbedBuilder().setTitle('✊ RPS').setDescription(ids.map(id=>`<@${id}> choose!`).join('\n'))], components:[rows] });
  const c = msg.createMessageComponentCollector({ time:30_000 });
  c.on('collect', async i => {
    if (!ids.includes(i.user.id)) { await i.reply({content:'You are not in this game.',ephemeral:true}); return; }
    choices.set(i.user.id, i.customId.split(':')[1]); await i.reply({content:'Choice locked!',ephemeral:true}); if(choices.size===2)c.stop('done');
  });
  await new Promise<void>(resolve=>c.once('end',()=>resolve()));
  if(choices.size<2){await interaction.editReply({content:'⏱️ RPS timed out.',embeds:[],components:[]});return;}
  const [a,b]=ids; const av=choices.get(a)!, bv=choices.get(b)!;
  const win=(x:string,y:string)=> (x==='rock'&&y==='scissors')||(x==='paper'&&y==='rock')||(x==='scissors'&&y==='paper');
  if(av===bv){await interaction.editReply({content:'🤝 Draw — no sparks awarded.',embeds:[],components:[]});return;}
  await award(interaction,game,win(av,bv)?a:b);
}

async function runXo(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const board = Array(9).fill(''); let turn=0;
  const makeRows=()=>[0,1,2].map(r=>new ActionRowBuilder<ButtonBuilder>().addComponents([0,1,2].map(c=>{const n=r*3+c; return new ButtonBuilder().setCustomId(`xo:${n}`).setLabel(board[n]||'·').setStyle(board[n] ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(Boolean(board[n]));})));
  const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⭕ ${game.label}`).setDescription(`<@${ids[0]}> = ❌\n<@${ids[1]}> = ⭕\n\nTurn: <@${ids[0]}>`)],components:makeRows()});
  const c=msg.createMessageComponentCollector({time:60_000});
  let winner:string|undefined;
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  c.on('collect',async i=>{if(!ids.includes(i.user.id)){await i.reply({content:'Not in this game.',ephemeral:true});return;} if(i.user.id!==ids[turn]){await i.reply({content:'Wait for your turn.',ephemeral:true});return;} const n=Number(i.customId.split(':')[1]); if(board[n]){await i.reply({content:'That square is taken.',ephemeral:true});return;} board[n]=turn===0?'X':'O'; const line=wins.find(w=>w.every(x=>board[x]===board[n])); if(line){winner=i.user.id;c.stop('won');await i.update({embeds:[new EmbedBuilder().setTitle(`🏆 ${game.label}`).setDescription(`<@${i.user.id}> won!`)],components:makeRows()});return;} if(board.every(Boolean)){c.stop('draw');await i.update({embeds:[new EmbedBuilder().setTitle(`🤝 ${game.label}`).setDescription('Draw — no sparks awarded.')],components:makeRows()});return;} turn=1-turn;await i.update({embeds:[new EmbedBuilder().setTitle(`⭕ ${game.label}`).setDescription(`<@${ids[0]}> = ❌\n<@${ids[1]}> = ⭕\n\nTurn: <@${ids[turn]}>`)],components:makeRows()});});
  await new Promise<void>(resolve=>c.once('end',()=>resolve()));
  if(winner) await award(interaction,game,winner); else if(!winner) await interaction.editReply({content:'⏱️ Game timed out.',embeds:[],components:[]}).catch(()=>{});
}

async function runReplica(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const pattern=Array.from({length:5},()=>String(Math.floor(Math.random()*4)+1)).join(' ');
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🧩 Replica').setDescription(`Memorize this for **3 seconds**:\n\n**${pattern}**`)],components:[]});
  await new Promise(r=>setTimeout(r,3000));
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🧩 Replica').setDescription(`First player to send exactly:\n\`${pattern}\``)],components:[]});
  const ch=interaction.channel; if(!ch?.isTextBased()) return;
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&m.content.trim()===pattern,time:20_000,max:1}).catch(()=>null);
  const w=collected?.first()?.author.id; if(w) await award(interaction,game,w); else await interaction.editReply({content:'⏱️ Nobody replicated it in time.',embeds:[],components:[]});
}

async function runTextRace(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const prompt=game.name==='guessthecountry' ? { clue:'🍁🏒🍁', answer:'canada' } : { clue:'🌙🏠🌲', answer:'night house forest' };
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`🧠 ${game.label}`).setDescription(`First player to answer wins!\n\nClue: **${prompt.clue}**\n\nSend your answer in chat.`)],components:[]});
  const ch=interaction.channel; if(!ch?.isTextBased()) return;
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&m.content.trim().toLowerCase()===prompt.answer,time:30_000,max:1}).catch(()=>null);
  const w=collected?.first()?.author.id; if(w) await award(interaction,game,w); else await interaction.editReply({content:`⏱️ Time up. The answer was **${prompt.answer}**.`,embeds:[],components:[]});
}

async function runQuick(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const seed: Record<string,string[]> = {
    fasttype:['discord bot','discord bot'], textsplit:['discord bot','discord | bot'], textmerge:['discord | bot','discordbot'], textreverse:['render','redner'],
    findletter:['D I S C O R D','4'], correctletter:['S _ A R K S','P'], sortnumbers:['8 2 9 1 5','1 2 5 8 9'], guesscolor:['🟦','blue'], flag:['🇮🇳','india'], reveal:['🂠 🂠 🂠','2'], emoji:['🐝+🍯','honey'],
  };
  if(game.name==='fastclick'||game.name==='reveal'){
    const buttons=game.name==='fastclick' ? new ActionRowBuilder<ButtonBuilder>().addComponents(...shuffle([0,1,2,3,4]).map(n=>new ButtonBuilder().setCustomId(`quick:${n}`).setLabel(String(n+1)).setStyle(ButtonStyle.Primary))) : new ActionRowBuilder<ButtonBuilder>().addComponents(...[1,2,3].map(n=>new ButtonBuilder().setCustomId(`quick:${n}`).setLabel('🂠').setStyle(ButtonStyle.Secondary)));
    const winning=game.name==='fastclick'?String(Math.floor(Math.random()*5)):String(Math.floor(Math.random()*3)+1);
    const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⚡ ${game.label}`).setDescription('First player to hit the winning button gets sparks!')],components:[buttons]});
    const c=msg.createMessageComponentCollector({time:20_000,max:1}); c.on('collect',async i=>{if(!ids.includes(i.user.id)){await i.reply({content:'Not in this round.',ephemeral:true});return;} if(i.customId.split(':')[1]===winning){await i.deferUpdate();await award(interaction,game,i.user.id);c.stop('won');} else await i.reply({content:'❌ Wrong button!',ephemeral:true});}); await new Promise<void>(r=>c.once('end',()=>r())); return;
  }
  const [clue,answer]=seed[game.name] ?? ['Say `ready`','ready'];
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⚡ ${game.label}`).setDescription(`First correct answer wins!\n\n**${clue}**`)],components:[]});
  const ch=interaction.channel; if(!ch?.isTextBased()) return;
  const accepted=answer.toLowerCase();
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&m.content.trim().toLowerCase()===accepted,time:20_000,max:1}).catch(()=>null);
  const w=collected?.first()?.author.id; if(w) await award(interaction,game,w); else await interaction.editReply({content:`⏱️ Nobody got it. Answer: **${answer}**`,embeds:[],components:[]});
}

export const game: Command = {
  data: new SlashCommandBuilder().setName('game').setDescription('Play a server or quick game').addStringOption(o=>o.setName('name').setDescription('Game to play').setRequired(true).addChoices(...GAME_DEFS.map(g=>({name:g.name,value:g.name})))),
  async execute(interaction) {
    if (!interaction.guild) return;
    const gameName=interaction.options.getString('name',true) as GameName; const def=byName.get(gameName)!;
    const ids=await lobby(interaction,def); if(ids.length===0)return;
    if(def.category==='Quick Games') await runQuick(interaction,def,ids); else await runMultiplayer(interaction,def,ids);
  },
};

export const games: Command = {
  data: new SlashCommandBuilder().setName('games').setDescription('Show all available server games'),
  async execute(interaction) {
    const server=GAME_DEFS.filter(g=>g.category==='Server Games').map(g=>`• **${g.name}** — ${g.description} · min ${g.min} · ⚡${g.reward}`).join('\n');
    const quick=GAME_DEFS.filter(g=>g.category==='Quick Games').map(g=>`• **${g.name}** — ${g.description} · ⚡${g.reward}`).join('\n');
    await interaction.reply({embeds:[new EmbedBuilder().setTitle('🎮 Server Games').addFields({name:'Server Games',value:server},{name:'Quick Games',value:quick}).setFooter({text:'Use /game name:<game> to play'})]});
  },
};
