import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types.js';
import { GAME_DEFS, type GameName } from './games.js';

type GameInfo = { objective: string; how: string[]; tips: string };

const GAME_INFO: Record<GameName, GameInfo> = {
  roulette:{objective:'Survive the wheel and be the final winner.',how:['Join the lobby.','The wheel selects the winner.','The winner receives the Sparks reward.'],tips:'🎯 Risk it for Sparks!'},
  xo:{objective:'Beat your opponent in classic 1v1 tic-tac-toe.',how:['Join the 2-player lobby.','Take turns placing ❌ or ⭕.','Make 3 in a row to win.'],tips:'🧠 Plan ahead.'},
  mafia:{objective:'Survive the social-deduction round and win.',how:['Join with enough players.','Roles are assigned for the round.','Use the round information and decisions to win.'],tips:'🕵️ Watch everyone carefully.'},
  chairs:{objective:'Survive the musical-chairs style elimination.',how:['Join the lobby.','Players enter the round.','The elimination leaves a final winner.'],tips:'🎵 Stay ready!'},
  rps:{objective:'Win rock, paper, scissors.',how:['Join the 2-player lobby.','Choose 🪨 Rock, 📄 Paper, or ✂️ Scissors.','The winning choice gets the reward.'],tips:'🎲 Choose wisely.'},
  dice:{objective:'Roll the highest number.',how:['Join the lobby.','Every player gets a random roll.','Highest roll wins.'],tips:'🎲 Highest roll wins.'},
  deathwheel:{objective:'Stay on the safe seat until one player remains.',how:['Join the lobby.','The wheel eliminates players.','The last safe player wins.'],tips:'☠️ One seat survives.'},
  hotxo:{objective:'Win tic-tac-toe with the hot-square twist.',how:['Join the 2-player lobby.','Take turns on the board.','Complete the winning pattern.'],tips:'🔥 Watch the hot square.'},
  hideandseek:{objective:'Hide successfully and become the surviving winner.',how:['Join with enough players.','One player becomes the seeker.','The hidden survivor wins.'],tips:'🙈 Stay unpredictable.'},
  replica:{objective:'Remember and copy the pattern fastest.',how:['Watch the temporary pattern.','It disappears.','Type the exact pattern first.'],tips:'🧩 Memory + speed = Sparks.'},
  guessthecountry:{objective:'Guess the hidden country as geographically close as possible.',how:['Each member gets one country guess per round.','Your guessed country flag appears beside your name.','The closest valid guess earns the most Sparks.'],tips:'🌍 Think geographically.'},
  guessthedraw:{objective:'Identify the random drawing clue first.',how:['Join the round.','A random emoji/ASCII-style clue appears.','Send the correct idea first.'],tips:'🎨 Look at the whole clue.'},
  fastclick:{objective:'Click the winning target before anyone else.',how:['Join the quick round.','Several targets appear.','Click the correct target first.'],tips:'⚡ Fast fingers win.'},
  fasttype:{objective:'Type a fresh random phrase exactly and fastest.',how:['Join the quick round.','A new random phrase is generated every round.','Type it exactly; first correct message wins.'],tips:'⌨️ Every round is different.'},
  textsplit:{objective:'Split randomly generated text correctly.',how:['Join the quick round.','A fresh random phrase appears.','Return it in the requested split format.'],tips:'✂️ Read the format carefully.'},
  textmerge:{objective:'Merge random text chunks correctly.',how:['Join the quick round.','Random chunks are shuffled.','Merge them exactly as requested.'],tips:'🧩 The chunks change every round.'},
  flag:{objective:'Identify the country from a random flag.',how:['Join the quick round.','A random country flag is shown.','Send the country name first.'],tips:'🏳️ Learn your flags.'},
  textreverse:{objective:'Reverse random text correctly and quickly.',how:['Join the quick round.','A fresh random word is shown.','Send the exact reversed text first.'],tips:'🔄 The word changes every round.'},
  findletter:{objective:'Find a requested letter position in random text.',how:['Join the quick round.','A random word and position are generated.','Reply with the letter at that position.'],tips:'🔎 Count from the first character.'},
  correctletter:{objective:'Fill the missing letter in random text.',how:['Join the quick round.','A random word has one hidden letter.','Send the missing letter first.'],tips:'🧠 Check the word pattern.'},
  sortnumbers:{objective:'Sort a fresh set of random numbers fastest.',how:['Join the quick round.','Random numbers are generated.','Return them smallest to largest.'],tips:'🔢 Scan before typing.'},
  guesscolor:{objective:'Guess the random color from the clue.',how:['Join the quick round.','A random color clue is generated.','Send the color name first.'],tips:'🎨 The color changes every round.'},
  emoji:{objective:'Guess the phrase represented by random emojis.',how:['Join the quick round.','A fresh emoji combination appears.','Send the represented phrase.'],tips:'😀 Read the emojis as one clue.'},
  reveal:{objective:'Choose the hidden winning card first.',how:['Join the quick round.','Several hidden cards appear.','Pick the winning card.'],tips:'🃏 Trust your timing.'},
};

function animatedEmoji(interaction: ChatInputCommandInteraction, fallback: string): string {
  const animated = interaction.guild?.emojis.cache.find(e => e.animated);
  return animated?.toString() ?? fallback;
}

function introEmbed(interaction: ChatInputCommandInteraction): EmbedBuilder {
  const server = GAME_DEFS.filter(g => g.category === 'Server Games').map(g => `• **${g.name}** — ⚡ ${g.reward}`).join('\n');
  const quick = GAME_DEFS.filter(g => g.category === 'Quick Games').map(g => `• **${g.name}** — ⚡ ${g.reward}`).join('\n');
  return new EmbedBuilder()
    .setTitle(`${animatedEmoji(interaction,'🎮')} Sparxie Games`)
    .setDescription('🎉 **Welcome to the Games section!**\n\nPlay games in your server, compete with members, and **win ⚡ Sparks**. Use your Sparks in the server shop for roles and customization items.\n\n📖 **Check the pages below for full information.** Every game has its own page with how to play, player limits and Sparks reward.\n\n🚀 Use `/game name:<game>` or your server prefix with `game <game>` to play.\n\n⏱️ Game lobbies have a **30-second join window**. If the minimum player count is not reached, the game ends. Only **one game can run at a time per server**.')
    .addFields({name:'🎮 Server Games',value:server},{name:'⚡ Quick Games',value:quick},{name:'💰 Sparks',value:'Win Sparks by playing and winning. The exact reward is shown on each game page.'})
    .setFooter({text:'📚 Open the game pages to learn how every game works.'});
}

function gameEmbed(interaction: ChatInputCommandInteraction, index: number): EmbedBuilder {
  const game = GAME_DEFS[index];
  const info = GAME_INFO[game.name];
  return new EmbedBuilder()
    .setTitle(`${animatedEmoji(interaction,'🎮')} ${game.label}`)
    .setDescription(`**${info.objective}**\n\n${info.tips}`)
    .addFields(
      {name:'📖 How to play',value:info.how.map((s,i)=>`**${i+1}.** ${s}`).join('\n')},
      {name:'💰 Sparks reward',value:`**⚡ ${game.reward} Sparks** for the round winner.`},
      {name:'👥 Players',value:`${game.min} minimum • ${game.max} maximum`},
      {name:'🚀 Commands',value:`Slash: \/game name:${game.name}\nPrefix: .game ${game.name}`},
    )
    .setFooter({text:`Game ${index+1} of ${GAME_DEFS.length} • Browse with the menu or buttons`});
}

function pageComponents(page:number): ActionRowBuilder<any>[] {
  const menu = new StringSelectMenuBuilder().setCustomId('games:page').setPlaceholder('🎮 Choose a game page').addOptions(
    GAME_DEFS.map((g,i)=>({label:g.name,value:String(i),description:`${g.category} • ⚡ ${g.reward} Sparks`,emoji:g.category==='Server Games'?'🎮':'⚡',default:i===page}))
  );
  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('games:first').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId('games:prev').setLabel('◀️ Previous').setStyle(ButtonStyle.Primary).setDisabled(page===0),
    new ButtonBuilder().setCustomId('games:intro').setLabel('🏠 Intro').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('games:next').setLabel('Next ▶️').setStyle(ButtonStyle.Primary).setDisabled(page===GAME_DEFS.length-1),
    new ButtonBuilder().setCustomId('games:last').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(page===GAME_DEFS.length-1),
  );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),nav];
}

export const games: Command = {
  data:new SlashCommandBuilder().setName('games').setDescription('Browse game information and Sparks rewards'),
  async execute(interaction){
    const message=await interaction.reply({fetchReply:true,embeds:[introEmbed(interaction)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('games:browse').setLabel('📖 Browse Game Pages').setStyle(ButtonStyle.Primary))]});
    const collector=message.createMessageComponentCollector({time:10*60*1000});
    let page=0;
    let intro=true;
    collector.on('collect',async i=>{
      if(i.user.id!==interaction.user.id){await i.reply({content:'📖 Only the person who opened this games menu can browse these pages.',ephemeral:true});return;}
      if(i.customId==='games:browse'){intro=false;page=0;}
      else if(i.customId==='games:intro'){intro=true;}
      else if(i.customId==='games:first'){intro=false;page=0;}
      else if(i.customId==='games:prev'){intro=false;page=Math.max(0,page-1);}
      else if(i.customId==='games:next'){intro=false;page=Math.min(GAME_DEFS.length-1,page+1);}
      else if(i.customId==='games:last'){intro=false;page=GAME_DEFS.length-1;}
      else if(i.customId==='games:page'){intro=false;page=Math.max(0,Math.min(GAME_DEFS.length-1,Number(i.values[0])));}
      else return;
      await i.update({embeds:[intro?introEmbed(interaction):gameEmbed(interaction,page)],components:intro?[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('games:browse').setLabel('📖 Browse Game Pages').setStyle(ButtonStyle.Primary))]:pageComponents(page)});
    });
    collector.once('end',async()=>{await message.edit({components:[]}).catch(()=>undefined);});
  },
};
