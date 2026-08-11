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
  { name:'guessthecountry', label:'guessthecountry', category:'Server Games', min:1, max:12, reward:30, description:'Guess a country; the geographically closest valid guess wins.' },
  { name:'guessthedraw', label:'guessthedraw', category:'Server Games', min:2, max:12, reward:35, description:'Guess a random emoji/ASCII drawing.' },
  { name:'fastclick', label:'fastclick', category:'Quick Games', min:1, max:12, reward:10, description:'Click first.' },
  { name:'fasttype', label:'fasttype', category:'Quick Games', min:1, max:12, reward:10, description:'Type a random phrase first.' },
  { name:'textsplit', label:'textsplit', category:'Quick Games', min:1, max:12, reward:10, description:'Split a random phrase correctly.' },
  { name:'textmerge', label:'textmerge', category:'Quick Games', min:1, max:12, reward:10, description:'Merge random chunks correctly.' },
  { name:'flag', label:'flag', category:'Quick Games', min:1, max:12, reward:10, description:'Pick the country from a random flag.' },
  { name:'textreverse', label:'textreverse', category:'Quick Games', min:1, max:12, reward:10, description:'Reverse a random text.' },
  { name:'findletter', label:'findletter', category:'Quick Games', min:1, max:12, reward:10, description:'Find a requested letter position in random text.' },
  { name:'correctletter', label:'correctletter', category:'Quick Games', min:1, max:12, reward:10, description:'Choose the missing letter in random text.' },
  { name:'sortnumbers', label:'sortnumbers', category:'Quick Games', min:1, max:12, reward:10, description:'Sort random numbers fastest.' },
  { name:'guesscolor', label:'guesscolor', category:'Quick Games', min:1, max:12, reward:10, description:'Guess a random color.' },
  { name:'emoji', label:'emoji', category:'Quick Games', min:1, max:12, reward:10, description:'Guess a random emoji clue.' },
  { name:'reveal', label:'reveal', category:'Quick Games', min:1, max:12, reward:10, description:'Pick the hidden winning card.' },
];

const byName = new Map(GAME_DEFS.map(g => [g.name, g]));
const rand = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const shuffle = <T>(a: T[]): T[] => [...a].sort(() => Math.random() - .5);
const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

function addSparks(guildId: string, userId: string, amount: number): void {
  updateGuild(guildId, d => { d.sparks[userId] = (d.sparks[userId] ?? 0) + amount; });
}

function joinRow(id: string, gameName: GameName): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${id}:join`).setLabel('🎮 Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${id}:start`).setLabel('▶️ Start').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`global:queue:${gameName}`).setLabel('🌐 Global').setStyle(ButtonStyle.Secondary),
  );
}

async function lobby(interaction: ChatInputCommandInteraction, game: GameDef): Promise<string[]> {
  const players = new Set<string>([interaction.user.id]);
  const id = `game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const message = await interaction.reply({
    fetchReply: true,
    embeds: [new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`**${game.description}**\n\nPlayers: <@${interaction.user.id}>\n\nNeed at least **${game.min}** player(s). Click **Join** to enter.`).setFooter({ text: `Winner reward: ⚡ ${game.reward} sparks` })],
    components: [joinRow(id, game.name)],
  });
  const collector = message.createMessageComponentCollector({ time: 45_000 });
  let started = false;
  collector.on('collect', async i => {
    try {
      if (i.customId === `${id}:join`) {
        if (players.has(i.user.id)) { await i.reply({ content:'You are already in.', ephemeral:true }); return; }
        if (players.size >= game.max) { await i.reply({ content:'This game is full.', ephemeral:true }); return; }
        players.add(i.user.id);
        await i.update({ embeds:[new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`**${game.description}**\n\nPlayers (${players.size}/${game.max}): ${[...players].map(x=>`<@${x}>`).join(', ')}\n\nNeed at least **${game.min}** player(s).`)], components:[joinRow(id, game.name)] });
        return;
      }
      if (i.customId === `${id}:start`) {
        if (i.user.id !== interaction.user.id) { await i.reply({content:'Only the game creator can start it.',ephemeral:true}); return; }
        if (players.size < game.min) { await i.reply({content:`Need at least ${game.min} players.`,ephemeral:true}); return; }
        started = true;
        await i.deferUpdate();
        collector.stop('started');
        await message.edit({embeds:[new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(`Starting with ${players.size} players…`)],components:[]});
      }
    } catch (err) {
      console.error(`[game:${game.name}:lobby]`, err);
      await i.reply({content:'❌ Something went wrong. Please try again.',ephemeral:true}).catch(()=>{});
    }
  });
  await new Promise<void>(resolve => collector.once('end', () => resolve()));
  if (!started) {
    await message.edit({embeds:[new EmbedBuilder().setTitle(`🎮 ${game.label}`).setDescription(players.size >= game.min ? 'Game lobby closed.' : `Not enough players joined (${players.size}/${game.min}).`)],components:[]}).catch(()=>{});
    return [];
  }
  return [...players];
}

async function award(interaction: ChatInputCommandInteraction, game: GameDef, winnerId: string, amount = game.reward): Promise<void> {
  addSparks(interaction.guild!.id, winnerId, amount);
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`🏆 ${game.label} winner`).setDescription(`🎉 <@${winnerId}> won and earned **⚡ ${amount} sparks**!`).setTimestamp()],components:[]});
}

async function runMultiplayer(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  if (game.name === 'dice') {
    const rolls = ids.map(id=>({id,n:Math.floor(Math.random()*100)+1})).sort((a,b)=>b.n-a.n);
    await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🎲 Dice').setDescription(rolls.map(r=>`<@${r.id}> rolled **${r.n}**`).join('\n'))],components:[]});
    await award(interaction,game,rolls[0].id); return;
  }
  if (game.name === 'roulette' || game.name === 'chairs' || game.name === 'deathwheel') { await award(interaction,game,rand(ids)); return; }
  if (game.name === 'hideandseek') {
    const seeker=rand(ids); const hidden=rand(ids.filter(x=>x!==seeker));
    await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🙈 Hide & Seek').setDescription(`The seeker was <@${seeker}>.\nThe hider who survived was <@${hidden}>.`)]});
    await award(interaction,game,hidden); return;
  }
  if (game.name === 'mafia') {
    const mafia=rand(ids); const winner=rand(ids);
    await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🕵️ Mafia').setDescription(`The mafia was <@${mafia}>.\n\nRound winner: <@${winner}>.`)]});
    await award(interaction,game,winner); return;
  }
  if (game.name === 'rps') { await runRps(interaction,game,ids); return; }
  if (game.name === 'xo' || game.name === 'hotxo') { await runXo(interaction,game,ids); return; }
  if (game.name === 'replica') { await runReplica(interaction,game,ids); return; }
  if (game.name === 'guessthecountry') { await runCountry(interaction,game,ids); return; }
  if (game.name === 'guessthedraw') { await runGuessDraw(interaction,game,ids); return; }
  await award(interaction,game,rand(ids));
}

async function runRps(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const choices=new Map<string,string>();
  const rows=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rps:rock').setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps:paper').setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps:scissors').setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary),
  );
  const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle('✊ RPS').setDescription(ids.map(id=>`<@${id}> choose!`).join('\n'))],components:[rows]});
  const c=msg.createMessageComponentCollector({time:30_000});
  c.on('collect',async i=>{if(!ids.includes(i.user.id)){await i.reply({content:'You are not in this game.',ephemeral:true});return;} choices.set(i.user.id,i.customId.split(':')[1]); await i.reply({content:'Choice locked!',ephemeral:true}); if(choices.size===2)c.stop('done');});
  await new Promise<void>(r=>c.once('end',()=>r()));
  if(choices.size<2){await interaction.editReply({content:'⏱️ RPS timed out.',embeds:[],components:[]});return;}
  const [a,b]=ids; const av=choices.get(a)!,bv=choices.get(b)!;
  const win=(x:string,y:string)=>(x==='rock'&&y==='scissors')||(x==='paper'&&y==='rock')||(x==='scissors'&&y==='paper');
  if(av===bv){await interaction.editReply({content:'🤝 Draw — no sparks awarded.',embeds:[],components:[]});return;}
  await award(interaction,game,win(av,bv)?a:b);
}

async function runXo(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const board=Array(9).fill(''); let turn=0; let winner:string|undefined;
  const makeRows=()=>[0,1,2].map(r=>new ActionRowBuilder<ButtonBuilder>().addComponents([0,1,2].map(c=>{const n=r*3+c;return new ButtonBuilder().setCustomId(`xo:${n}`).setLabel(board[n]||'·').setStyle(board[n]?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(Boolean(board[n]));})));
  const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⭕ ${game.label}`).setDescription(`<@${ids[0]}> = ❌\n<@${ids[1]}> = ⭕\n\nTurn: <@${ids[0]}>`)],components:makeRows()});
  const c=msg.createMessageComponentCollector({time:60_000});
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  c.on('collect',async i=>{if(!ids.includes(i.user.id)){await i.reply({content:'Not in this game.',ephemeral:true});return;} if(i.user.id!==ids[turn]){await i.reply({content:'Wait for your turn.',ephemeral:true});return;} const n=Number(i.customId.split(':')[1]); if(board[n]){await i.reply({content:'That square is taken.',ephemeral:true});return;} board[n]=turn===0?'X':'O'; const line=wins.find(w=>w.every(x=>board[x]===board[n])); if(line){winner=i.user.id;c.stop('won');await i.update({embeds:[new EmbedBuilder().setTitle(`🏆 ${game.label}`).setDescription(`<@${i.user.id}> won!`)],components:makeRows()});return;} if(board.every(Boolean)){c.stop('draw');await i.update({embeds:[new EmbedBuilder().setTitle(`🤝 ${game.label}`).setDescription('Draw — no sparks awarded.')],components:makeRows()});return;} turn=1-turn;await i.update({embeds:[new EmbedBuilder().setTitle(`⭕ ${game.label}`).setDescription(`<@${ids[0]}> = ❌\n<@${ids[1]}> = ⭕\n\nTurn: <@${ids[turn]}>`)],components:makeRows()});});
  await new Promise<void>(r=>c.once('end',()=>r()));
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

interface Country { name:string; code:string; lat:number; lon:number; aliases?:string[]; }
const COUNTRIES: Country[] = [
  {name:'Nigeria',code:'NG',lat:9.08,lon:8.68}, {name:'India',code:'IN',lat:20.59,lon:78.96}, {name:'Japan',code:'JP',lat:36.20,lon:138.25}, {name:'China',code:'CN',lat:35.86,lon:104.19},
  {name:'Pakistan',code:'PK',lat:30.38,lon:69.35}, {name:'Bangladesh',code:'BD',lat:23.68,lon:90.36}, {name:'Nepal',code:'NP',lat:28.39,lon:84.12}, {name:'Sri Lanka',code:'LK',lat:7.87,lon:80.77},
  {name:'United States',code:'US',lat:37.09,lon:-95.71,aliases:['usa','us','america']}, {name:'Canada',code:'CA',lat:56.13,lon:-106.35}, {name:'Mexico',code:'MX',lat:23.63,lon:-102.55}, {name:'Brazil',code:'BR',lat:-14.24,lon:-51.93},
  {name:'Argentina',code:'AR',lat:-38.42,lon:-63.62}, {name:'United Kingdom',code:'GB',lat:55.38,lon:-3.44,aliases:['uk','britain']}, {name:'France',code:'FR',lat:46.23,lon:2.21}, {name:'Germany',code:'DE',lat:51.17,lon:10.45},
  {name:'Spain',code:'ES',lat:40.46,lon:-3.75}, {name:'Italy',code:'IT',lat:41.87,lon:12.57}, {name:'Portugal',code:'PT',lat:39.40,lon:-8.22}, {name:'Russia',code:'RU',lat:61.52,lon:105.32},
  {name:'Turkey',code:'TR',lat:38.96,lon:35.24}, {name:'Egypt',code:'EG',lat:26.82,lon:30.80}, {name:'South Africa',code:'ZA',lat:-30.56,lon:22.94}, {name:'Kenya',code:'KE',lat:0.02,lon:37.91},
  {name:'Ethiopia',code:'ET',lat:9.15,lon:40.49}, {name:'Saudi Arabia',code:'SA',lat:23.89,lon:45.08}, {name:'United Arab Emirates',code:'AE',lat:23.42,lon:53.85,aliases:['uae']}, {name:'Iran',code:'IR',lat:32.43,lon:53.69},
  {name:'Australia',code:'AU',lat:-25.27,lon:133.78}, {name:'New Zealand',code:'NZ',lat:-40.90,lon:174.89}, {name:'Indonesia',code:'ID',lat:-0.79,lon:113.92}, {name:'Thailand',code:'TH',lat:15.87,lon:100.99},
  {name:'Vietnam',code:'VN',lat:14.06,lon:108.28}, {name:'South Korea',code:'KR',lat:35.91,lon:127.77,aliases:['korea']}, {name:'Philippines',code:'PH',lat:12.88,lon:121.77}, {name:'Greece',code:'GR',lat:39.07,lon:21.82},
];
const countryMap=new Map<string,Country>();
for(const c of COUNTRIES){countryMap.set(normalize(c.name),c); for(const a of c.aliases??[]) countryMap.set(normalize(a),c);}
function flagEmoji(code:string):string{return [...code.toUpperCase()].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('');}
function distanceKm(a:Country,b:Country):number{const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

async function runCountry(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const target=rand(COUNTRIES); const guesses=new Map<string,Country>();
  const ch=interaction.channel; if(!ch?.isTextBased()) return;
  const render=()=>ids.map(id=>`<@${id}>${guesses.has(id)?` ${flagEmoji(guesses.get(id)!.code)}`:''}`).join('\n');
  const update=()=>interaction.editReply({embeds:[new EmbedBuilder().setTitle('🌍 Guess The Country').setDescription(`Guess **one country name only** per round.\n\nEach member gets **one valid guess**. After guessing, your flag appears beside your name.\n\n${render()}\n\n⏳ The country is hidden. The **closest geographic guess** wins the most sparks!`)],components:[]});
  await update();
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&countryMap.has(normalize(m.content))&&!guesses.has(m.author.id),time:30_000,max:ids.length}).catch(()=>null);
  for(const m of collected?.values?.()??[]){const c=countryMap.get(normalize(m.content));if(c&&!guesses.has(m.author.id)){guesses.set(m.author.id,c);await update();}}
  if(!guesses.size){await interaction.editReply({content:`⏱️ Time up. The country was **${target.name} ${flagEmoji(target.code)}**.`,embeds:[],components:[]});return;}
  const results=[...guesses.entries()].map(([id,c])=>({id,c,d:distanceKm(c,target)})).sort((a,b)=>a.d-b.d);
  const winner=results[0];
  const maxReward=game.reward; const second=Math.max(1,Math.floor(maxReward*0.7)); const third=Math.max(1,Math.floor(maxReward*0.4));
  const rewards=[maxReward,second,third];
  for(let i=0;i<results.length;i++){const reward=rewards[i]??Math.max(1,Math.floor(maxReward*0.25));addSparks(interaction.guild!.id,results[i].id,reward);}
  const board=results.map((r,i)=>`${i+1}. <@${r.id}> ${flagEmoji(r.c.code)} **${r.c.name}** — ${Math.round(r.d).toLocaleString()} km — **⚡ ${rewards[i]??Math.max(1,Math.floor(maxReward*0.25))}**`).join('\n');
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🏆 Guess The Country Results').setDescription(`Target: **${target.name} ${flagEmoji(target.code)}**\n\n${board}\n\n📍 Closest valid guess wins the most sparks.`).setTimestamp()],components:[]});
}

const DRAW_PROMPTS=[
  ['🌧️🏠☂️','rainy house'],['🐱👑','cat king'],['🚀🌙','space moon'],['🍕🐢','pizza turtle'],['🌋🏝️','volcano island'],['🐟🌊🏠','fish tank'],['🦁👑','lion king'],['🍎📚🏫','school'],
];
async function runGuessDraw(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const [clue,answer]=rand(DRAW_PROMPTS); await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🎨 Guess The Draw').setDescription(`A random drawing clue is shown below.\n\n**${clue}**\n\nFirst player to guess the idea wins!`)],components:[]});
  const ch=interaction.channel;if(!ch?.isTextBased())return;
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&normalize(m.content)===normalize(answer),time:30_000,max:1}).catch(()=>null);
  const w=collected?.first()?.author.id;if(w)await award(interaction,game,w);else await interaction.editReply({content:`⏱️ Time up. Answer: **${answer}**`,embeds:[],components:[]});
}

const FAST_PHRASES=['purple comet','silver dragon','midnight pizza','cosmic banana','hidden treasure','electric tiger','rainy weekend','pixel wizard','flying castle','golden thunder','orange planet','mystic forest','blue galaxy','sleepy panda','rocket coffee'];
const SPLIT_PHRASES=['hello world','fast typing','purple dragon','server games','spark shop','hidden treasure','cosmic adventure','discord community','rainbow rocket','midnight forest'];
const REVERSE_TEXT=['galaxy','thunder','adventure','champion','firestorm','moonlight','butterfly','keyboard','treasure','waterfall'];
const COLORS=[['🔴','red'],['🔵','blue'],['🟢','green'],['🟡','yellow'],['🟣','purple'],['🟠','orange'],['🩷','pink'],['🟤','brown'],['⚫','black'],['⚪','white']];
const EMOJI_CLUES=[['🐝 + 🍯','honey'],['🌞 + 🌻','sunflower'],['🐟 + 🍟','fish and chips'],['🌧️ + 🌈','rainbow'],['⭐ + 🐟','starfish'],['🦋 + 🌸','butterfly flower'],['🍎 + 👨‍🏫','teacher'],['🌙 + 🛏️','sleep']];

async function runQuick(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  if(game.name==='fastclick'||game.name==='reveal'){
    const count=game.name==='fastclick'?5:3; const winning=String(Math.floor(Math.random()*count));
    const buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(...Array.from({length:count},(_,n)=>new ButtonBuilder().setCustomId(`quick:${n}`).setLabel(game.name==='fastclick'?String(n+1):'🂠').setStyle(game.name==='fastclick'?ButtonStyle.Primary:ButtonStyle.Secondary)));
    const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⚡ ${game.label}`).setDescription(`First player to hit the winning ${game.name==='fastclick'?'number':'card'} gets sparks!`)],components:[buttons]});
    const c=msg.createMessageComponentCollector({time:20_000,max:1});c.on('collect',async i=>{if(!ids.includes(i.user.id)){await i.reply({content:'Not in this round.',ephemeral:true});return;}if(i.customId.split(':')[1]===winning){await i.deferUpdate();await award(interaction,game,i.user.id);c.stop('won');}else await i.reply({content:'❌ Wrong choice!',ephemeral:true});});await new Promise<void>(r=>c.once('end',()=>r()));return;
  }
  const ch=interaction.channel;if(!ch?.isTextBased())return;
  let clue:string;let answer:string;
  if(game.name==='fasttype'){answer=rand(FAST_PHRASES);clue=`Type exactly: **${answer}**`;}
  else if(game.name==='textsplit'){answer=rand(SPLIT_PHRASES);clue=`Split this into words using **/**: **${answer.replace(/ /g,' / ')}**`;answer=answer.split(' ').join(' / ');}
  else if(game.name==='textmerge'){const words=rand(SPLIT_PHRASES).split(' ');shuffle(words);clue=`Merge these chunks with no spaces: **${words.join(' | ')}**`;answer=words.join('');}
  else if(game.name==='textreverse'){const text=rand(REVERSE_TEXT);clue=`Reverse this text: **${text}**`;answer=[...text].reverse().join('');}
  else if(game.name==='findletter'){const word=rand(FAST_PHRASES).replace(/ /g,'');const pos=Math.floor(Math.random()*word.length)+1;clue=`What letter is at position **${pos}** in **${word}**?`;answer=word[pos-1];}
  else if(game.name==='correctletter'){const word=rand(REVERSE_TEXT).toUpperCase();const pos=Math.floor(Math.random()*word.length);answer=word[pos];clue=`Fill the blank: **${word.slice(0,pos)}_ ${word.slice(pos+1)}**`;}
  else if(game.name==='sortnumbers'){const nums=shuffle(Array.from({length:5},()=>Math.floor(Math.random()*90)+10));answer=[...nums].sort((a,b)=>a-b).join(' ');clue=`Sort these numbers smallest → largest: **${nums.join('  ') }**`;}
  else if(game.name==='guesscolor'){const item=rand(COLORS);answer=item[1];clue=`What color is this? **${item[0]}**`;}
  else if(game.name==='emoji'){const item=rand(EMOJI_CLUES);answer=item[1];clue=`Guess the phrase: **${item[0]}**`;}
  else if(game.name==='flag'){const country=rand(COUNTRIES);answer=normalize(country.name);clue=`Which country is this flag? **${flagEmoji(country.code)}**`;}
  else {answer='ready';clue='Say **ready** to win.';}
  await interaction.editReply({embeds:[new EmbedBuilder().setTitle(`⚡ ${game.label}`).setDescription(`First correct answer wins!\n\n${clue}`)],components:[]});
  const accepted=normalize(answer);
  const collected=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&normalize(m.content)===accepted,time:20_000,max:1}).catch(()=>null);
  const w=collected?.first()?.author.id;if(w)await award(interaction,game,w);else await interaction.editReply({content:`⏱️ Nobody got it. Answer: **${answer}**`,embeds:[],components:[]});
}

export const game: Command = {
  data:new SlashCommandBuilder().setName('game').setDescription('Play a server or quick game').addStringOption(o=>o.setName('name').setDescription('Game to play').setRequired(true).addChoices(...GAME_DEFS.map(g=>({name:g.name,value:g.name})))),
  async execute(interaction){if(!interaction.guild)return;const gameName=interaction.options.getString('name',true) as GameName;const def=byName.get(gameName)!;const ids=await lobby(interaction,def);if(!ids.length)return;if(def.category==='Quick Games')await runQuick(interaction,def,ids);else await runMultiplayer(interaction,def,ids);},
};

export const games: Command = {
  data:new SlashCommandBuilder().setName('games').setDescription('Show all available server games'),
  async execute(interaction){const server=GAME_DEFS.filter(g=>g.category==='Server Games').map(g=>`• **${g.name}** — ${g.description} · min ${g.min} · ⚡${g.reward}`).join('\n');const quick=GAME_DEFS.filter(g=>g.category==='Quick Games').map(g=>`• **${g.name}** — ${g.description} · ⚡${g.reward}`).join('\n');await interaction.reply({embeds:[new EmbedBuilder().setTitle('🎮 Server Games').addFields({name:'Server Games',value:server},{name:'Quick Games',value:quick}).setFooter({text:'Use /game name:<game> to play'})]});},
};