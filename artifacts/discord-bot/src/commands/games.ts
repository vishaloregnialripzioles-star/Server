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
  { name:'guessthedraw', label:'guessthedraw', category:'Server Games', min:2, max:12, reward:35, description:'Guess a random drawing that becomes clearer over six rounds.' },
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
    await runMafia(interaction, game, ids);
    return;
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
  if(winner) await award(interaction,game,winner); else if(!winner) await interaction.editReply({content:'⏱️ Game timed out.',embeds:[],components:[]});
}

async function runReplica(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const pattern=shuffle(['🟥','🟦','🟩','🟨','🟪','🟧']).slice(0,4); const shown=pattern.join(' ');
  const msg=await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🧠 Replica').setDescription(`Memorize: **${shown}**\n\nYou have 8 seconds.`)],components:[]});
  await new Promise(r=>setTimeout(r,8000));
  await msg.edit({embeds:[new EmbedBuilder().setTitle('🧠 Replica').setDescription('Now type the pattern exactly.')],components:[]});
  const ch=interaction.channel;if(!ch?.isTextBased())return;
  const c=await (ch as any).awaitMessages({filter:(m:any)=>ids.includes(m.author.id)&&m.content.trim()===shown,time:15_000,max:1}).catch(()=>null);const w=c?.first()?.author.id;if(w)await award(interaction,game,w);else await interaction.editReply({content:`⏱️ Nobody matched it. Pattern was ${shown}`,embeds:[],components:[]});
}

interface Country {name:string;code:string;lat:number;lon:number;aliases?:string[]}
const COUNTRIES: Country[] = [
  {name:'United States',code:'US',lat:39.83,lon:-98.58,aliases:['usa','us']}, {name:'Canada',code:'CA',lat:56.13,lon:-106.35}, {name:'Mexico',code:'MX',lat:23.63,lon:-102.55},
  {name:'Brazil',code:'BR',lat:-14.24,lon:-51.93}, {name:'Argentina',code:'AR',lat:-38.42,lon:-63.62}, {name:'Chile',code:'CL',lat:-35.68,lon:-71.54},
  {name:'United Kingdom',code:'GB',lat:55.38,lon:-3.44,aliases:['uk','britain']}, {name:'Ireland',code:'IE',lat:53.14,lon:-7.69}, {name:'France',code:'FR',lat:46.23,lon:2.21},
  {name:'Spain',code:'ES',lat:40.46,lon:-3.75}, {name:'Portugal',code:'PT',lat:39.40,lon:-8.22}, {name:'Germany',code:'DE',lat:51.17,lon:10.45},
  {name:'Italy',code:'IT',lat:41.87,lon:12.57}, {name:'Netherlands',code:'NL',lat:52.13,lon:5.29}, {name:'Belgium',code:'BE',lat:50.50,lon:4.47},
  {name:'Switzerland',code:'CH',lat:46.82,lon:8.23}, {name:'Austria',code:'AT',lat:47.52,lon:14.55}, {name:'Poland',code:'PL',lat:51.92,lon:19.15},
  {name:'Norway',code:'NO',lat:60.47,lon:8.47}, {name:'Sweden',code:'SE',lat:60.13,lon:18.64}, {name:'Finland',code:'FI',lat:61.92,lon:25.75},
  {name:'Denmark',code:'DK',lat:56.26,lon:9.50}, {name:'Iceland',code:'IS',lat:64.96,lon:-19.02}, {name:'Greece',code:'GR',lat:39.07,lon:21.82},
  {name:'Turkey',code:'TR',lat:38.96,lon:35.24}, {name:'Egypt',code:'EG',lat:26.82,lon:30.80}, {name:'South Africa',code:'ZA',lat:-30.56,lon:22.94}, {name:'Kenya',code:'KE',lat:0.02,lon:37.91},
  {name:'Ethiopia',code:'ET',lat:9.15,lon:40.49}, {name:'Saudi Arabia',code:'SA',lat:23.89,lon:45.08}, {name:'United Arab Emirates',code:'AE',lat:23.42,lon:53.85,aliases:['uae']}, {name:'Iran',code:'IR',lat:32.43,lon:53.69},
  {name:'Australia',code:'AU',lat:-25.27,lon:133.78}, {name:'New Zealand',code:'NZ',lat:-40.90,lon:174.89}, {name:'Indonesia',code:'ID',lat:-0.79,lon:113.92}, {name:'Thailand',code:'TH',lat:15.87,lon:100.99},
  {name:'Vietnam',code:'VN',lat:14.06,lon:108.28}, {name:'South Korea',code:'KR',lat:35.91,lon:127.77,aliases:['korea']}, {name:'Philippines',code:'PH',lat:12.88,lon:121.77},
];
const countryMap=new Map<string,Country>();
for(const c of COUNTRIES){countryMap.set(normalize(c.name),c); for(const a of c.aliases??[]) countryMap.set(normalize(a),c);}
function flagEmoji(code:string):string{return [...code.toUpperCase()].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join('');}
function distanceKm(a:Country,b:Country):number{const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

function escSvg(value: string): string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function gameAttachment(svg: string, name: string): { attachment: Buffer; name: string } { return { attachment: Buffer.from(svg), name }; }

function mafiaBoardSvg(players: string[], roles: Map<string, string>, round: number): string {
  const width=1200,height=675; const names=players.map((id,i)=>`<text x="${120+(i%4)*300}" y="${210+Math.floor(i/4)*150}" fill="#fff" font-size="24" text-anchor="middle">Player ${i+1}</text><text x="${120+(i%4)*300}" y="${240+Math.floor(i/4)*150}" fill="#cbd5e1" font-size="18" text-anchor="middle">${escSvg(roles.get(id)??'Player')}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#030712"/><stop offset=".5" stop-color="#111827"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs><rect width="100%" height="100%" rx="36" fill="url(#bg)"/><text x="60" y="80" fill="#fff" font-size="44" font-weight="700">MAFIA</text><text x="60" y="125" fill="#94a3b8" font-size="24">Roles distributed • Round ${round}</text>${names}<text x="60" y="625" fill="#ef4444" font-size="20">Target: Mafia eliminates civilians before getting caught</text><text x="700" y="625" fill="#22c55e" font-size="20">Target: Town finds the Mafia before getting killed</text></svg>`;
}
function roleCardSvg(role:string, objective:string):string { const colors:Record<string,string>={Mafia:'#ef4444',Doctor:'#22c55e',Detective:'#38bdf8',Civilian:'#a78bfa'}; return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="100%" height="100%" rx="32" fill="#050816"/><text x="70" y="110" fill="${colors[role]??'#fff'}" font-size="56" font-weight="700">${escSvg(role)}</text><text x="70" y="180" fill="#e5e7eb" font-size="28">${escSvg(objective)}</text><text x="70" y="430" fill="#94a3b8" font-size="22">Keep your role secret.</text></svg>`; }
function countryChallengeSvg(place:string,country:Country,seed:number):string { const stars=Array.from({length:24},(_,i)=>`<circle cx="${(i*83+seed%100)%1200}" cy="${80+(i*47)%480}" r="${i%3+1}" fill="#fff" opacity=".3"/>`).join(''); return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#082f49"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="100%" height="100%" rx="38" fill="url(#g)"/>${stars}<circle cx="600" cy="300" r="150" fill="#38bdf8" opacity=".12"/><text x="600" y="120" fill="#fff" font-size="46" font-weight="700" text-anchor="middle">GUESS THE COUNTRY</text><text x="600" y="185" fill="#bae6fd" font-size="28" text-anchor="middle">Random location • ${escSvg(place)}</text><text x="600" y="500" fill="#fff" font-size="32" text-anchor="middle">30 SECONDS • SEND ONE COUNTRY NAME</text><text x="600" y="550" fill="#94a3b8" font-size="22" text-anchor="middle">Closer guesses earn more sparks</text></svg>`; }
function countryMapSvg(target:Country,results:Array<{id:string,c:Country,d:number}>,round:number):string { const px=(lon:number)=>80+(lon+180)/360*1040,py=(lat:number)=>80+(90-lat)/180*515; const tx=px(target.lon),ty=py(target.lat); const lines=results.map((r,i)=>`<line x1="${px(r.c.lon)}" y1="${py(r.c.lat)}" x2="${tx}" y2="${ty}" stroke="${i===0?'#22c55e':'#ef4444'}" stroke-width="4" opacity=".8"/><circle cx="${px(r.c.lon)}" cy="${py(r.c.lat)}" r="${i===0?11:8}" fill="${i===0?'#22c55e':'#ef4444'}"/><text x="${px(r.c.lon)+14}" y="${py(r.c.lat)+6}" fill="#e5e7eb" font-size="16">${escSvg(r.c.name)}</text>`).join(''); return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" rx="38" fill="#07111f"/><path d="M70 160 C180 90 250 190 350 145 S520 100 620 165 S820 115 930 170 S1080 110 1130 180 L1120 500 C1000 560 900 470 780 520 S570 480 450 540 S230 500 80 540 Z" fill="#18324b" opacity=".8"/>${lines}<circle cx="${tx}" cy="${ty}" r="15" fill="#fbbf24"/><text x="600" y="70" fill="#fff" font-size="38" font-weight="700" text-anchor="middle">WORLD MAP • DISTANCE REVEAL</text><text x="600" y="620" fill="#fbbf24" font-size="22" text-anchor="middle">Target: ${escSvg(target.name)} • Round ${round}</text></svg>`; }
function countryPointsSvg(target:Country,results:Array<{id:string,c:Country,d:number}>,rewards:number[]):string { const rows=results.map((r,i)=>`<text x="90" y="${150+i*65}" fill="#fff" font-size="25">${i+1}. ${escSvg(r.c.name)}</text><text x="620" y="${150+i*65}" fill="#cbd5e1" font-size="23">${Math.round(r.d).toLocaleString()} km</text><text x="900" y="${150+i*65}" fill="#fbbf24" font-size="23">+${rewards[i]} ⚡</text>`).join(''); return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" rx="38" fill="#100f1a"/><text x="600" y="75" fill="#fff" font-size="42" font-weight="700" text-anchor="middle">GUESS THE COUNTRY • FINAL SCORES</text><text x="600" y="115" fill="#fbbf24" font-size="22" text-anchor="middle">Target: ${escSvg(target.name)}</text>${rows}<text x="90" y="610" fill="#94a3b8" font-size="20">Closest valid guess wins the largest spark reward.</text></svg>`; }

interface DrawScene { name:string; words:string[]; stages:string[] }
const DRAW_SCENES: DrawScene[] = [
  {name:'Rocket',words:['rocket','space','flames'],stages:['△○','△○│','△○│╱╲','△○│╱╲ ▪▪','△○│╱╲ ▪▪ ≋','🚀']},
  {name:'Cat',words:['cat','ears','whiskers'],stages:['○','(=)',' /\\','(=^=)',' /|\\','🐱']},
  {name:'House',words:['house','roof','window'],stages:['□',' /\\\n□',' /\\\n│□│',' /\\\n│□│□',' /\\\n│▣│□','🏠']},
  {name:'Tree',words:['tree','leaves','trunk'],stages:['│',' /\\\n  │',' /\\\n/●●\\\n  │',' /●\\\n●●●●\n  │',' /●●\\\n●●●●●\n  │','🌳']},
  {name:'Car',words:['car','wheels','road'],stages:['▱','▱_','▱●●','▰●●','🚗','🚗 ───']},
  {name:'Sun',words:['sun','sky','rays'],stages:['○','☼','☼ ✦','☼ ✦ ✦','☀️','☀️ ☁️']},
  {name:'Fish',words:['fish','water','fin'],stages:['><','><(((','><(((*','><(((><','🐟 ≋','🐟 ≋ ≋']},
  {name:'Cake',words:['cake','candle','party'],stages:['▱','▱│','▱│▱','▱│▱ ✦','▰│▰ ✦','🎂']},
  {name:'Airplane',words:['plane','wings','sky'],stages:['─','─△','─△─','✈','✈️ ☁','✈️ ☁️ ☁️']},
  {name:'Flower',words:['flower','petal','stem'],stages:['○','✿','✿│','✿│✿','🌷│','🌷 🌿']},
];
function drawChallengeSvg(scene:DrawScene,round:number):string { const art=escSvg(scene.stages[Math.min(round-1,scene.stages.length-1)]).replace(/\n/g,'&#10;'); const words=scene.words.slice(0,Math.max(0,round-1)); return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" rx="38" fill="#111827"/><text x="70" y="80" fill="#c4b5fd" font-size="38" font-weight="700">GUESS THE DRAW • ROUND ${round}/6</text><text x="1130" y="80" fill="#94a3b8" font-size="22" text-anchor="end">${words.length?escSvg(words.join(' • ')):'NO WORDS YET'}</text><text x="600" y="360" fill="#f8fafc" font-size="120" text-anchor="middle" font-family="monospace">${art}</text><text x="600" y="600" fill="#94a3b8" font-size="22" text-anchor="middle">The sketch becomes clearer every round</text></svg>`; }

async function fetchCountryPlaceImage(country: Country): Promise<{url?: string; buffer?: Buffer; place: string}> {
  const place = rand([
    'Old Town district', 'a residential street', 'a city-center neighborhood',
    'a coastal road', 'a village street', 'a market district', 'a historic quarter'
  ]);
  try {
    const query = encodeURIComponent(`${country.name} ${place}`);
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json`, {
      headers: { 'User-Agent': 'BloxServerGames/1.0 (Discord bot)' }
    });
    if (!response.ok) return { place };
    const json: any = await response.json();
    const pages = Object.values(json?.query?.pages ?? {}) as any[];
    const candidate = pages.find(p => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url);
    const url = candidate?.imageinfo?.[0]?.thumburl ?? candidate?.imageinfo?.[0]?.url;
    if (!url) return { place };
    try {
      const image = await fetch(url, { headers: { 'User-Agent': 'BloxServerGames/1.0' } });
      if (image.ok) return { place, buffer: Buffer.from(await image.arrayBuffer()) };
    } catch {}
    return { place, url };
  } catch {
    return { place };
  }
}

async function runCountry(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const target = rand(COUNTRIES);
  const guesses = new Map<string, Country>();
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return;

  const placeData = await fetchCountryPlaceImage(target);
  const files: any[] = [];
  let imageUrl = placeData.url;
  if (placeData.buffer) {
    files.push({ attachment: placeData.buffer, name: 'country-place.jpg' });
    imageUrl = 'attachment://country-place.jpg';
  } else {
    files.push(gameAttachment(countryChallengeSvg(placeData.place, target, Date.now()), 'country-place.svg'));
    imageUrl = 'attachment://country-place.svg';
  }

  const challenge = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle('🌍  GUESS THE COUNTRY')
    .setDescription(`A random location has been selected.\n\n⏱️ You have **30 seconds** to guess the country.\n\nSend **one country name** in chat. Your first valid guess counts.\n\n🏆 The closer your guess is to the target, the more **⚡ Sparks** you earn.`)
    .addFields(
      { name: '📍 Location', value: placeData.place, inline: true },
      { name: '🎯 Goal', value: 'Get as geographically close as possible.', inline: true },
    )
    .setImage(imageUrl)
    .setFooter({ text: 'Guess The Country • One guess per player' })
    .setTimestamp();

  await interaction.editReply({ content: '', embeds: [challenge], components: [], files });

  const collected = await (ch as any).awaitMessages({
    filter: (m: any) => ids.includes(m.author.id) && countryMap.has(normalize(m.content)) && !guesses.has(m.author.id),
    time: 30_000,
    max: ids.length,
  }).catch(() => null);

  for (const m of collected?.values?.() ?? []) {
    const c = countryMap.get(normalize(m.content));
    if (c && !guesses.has(m.author.id)) guesses.set(m.author.id, c);
  }

  const results = [...guesses.entries()]
    .map(([id, c]) => ({ id, c, d: distanceKm(c, target) }))
    .sort((a, b) => a.d - b.d);

  const maxReward = game.reward;
  const rewards = results.map((_, i) => i === 0 ? maxReward : i === 1 ? Math.max(1, Math.floor(maxReward * .7)) : i === 2 ? Math.max(1, Math.floor(maxReward * .4)) : Math.max(1, Math.floor(maxReward * .25)));
  for (let i = 0; i < results.length; i++) addSparks(interaction.guild!.id, results[i].id, rewards[i]);

  if (results.length) {
    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('🗺️  GUESS THE COUNTRY • MAP REVEAL')
        .setDescription(`The timer is over. The target was **${flagEmoji(target.code)} ${target.name}**.\n\nThe lines show how far each valid guess was from the target.`)
        .setImage('attachment://country-map.svg')
        .setFooter({ text: 'Green = closest • Red = other guesses' })],
      files: [gameAttachment(countryMapSvg(target, results, 1), 'country-map.svg')],
    });
  } else {
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('⏱️ Time Up!').setDescription(`Nobody submitted a valid guess.\n\nThe country was **${flagEmoji(target.code)} ${target.name}**.`)],
    });
  }

  if (results.length) {
    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🏆  GUESS THE COUNTRY • SCOREBOARD')
        .setDescription(`**${flagEmoji(target.code)} ${target.name}** was the target.\n\nPoints are based on geographic distance.`)
        .setImage('attachment://country-points.svg')
        .setTimestamp()],
      files: [gameAttachment(countryPointsSvg(target, results, rewards), 'country-points.svg')],
    });
  }
}

async function mafiaActionDM(client: ChatInputCommandInteraction['client'], userId: string, title: string, description: string, targets: string[], session: string, action: string): Promise<string | null> {
  try {
    const user = await client.users.fetch(userId);
    if (!user) return null;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < targets.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...targets.slice(i, i + 5).map((id, j) => new ButtonBuilder()
          .setCustomId(`mafia:${session}:${action}:${id}`)
          .setLabel(`Choose ${i + j + 1}`)
          .setStyle(action === 'protect' ? ButtonStyle.Success : ButtonStyle.Primary))
      ));
    }
    const msg = await user.send({
      embeds: [new EmbedBuilder().setColor(action === 'kill' ? 0xef4444 : action === 'protect' ? 0x22c55e : 0x38bdf8)
        .setTitle(title).setDescription(description + '\n\nChoose a player below. You have **20 seconds**.')],
      components: rows,
    });
    const picked = await new Promise<string | null>(resolve => {
      const c = msg.createMessageComponentCollector({ time: 20_000, max: 1 });
      c.on('collect', async i => {
        if (i.user.id !== userId) { await i.reply({ content: 'This private action is not yours.', ephemeral: true }); return; }
        await i.update({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Choice locked').setDescription('Your action has been recorded.')], components: [] });
        resolve(i.customId.split(':').pop() ?? null);
        c.stop('picked');
      });
      c.once('end', () => resolve(null));
    });
    return picked;
  } catch { return null; }
}

async function runMafia(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const alive = new Set(ids);
  const roles = new Map<string, string>();
  const mafiaCount = ids.length >= 9 ? 2 : 1;
  const shuffled = shuffle(ids);
  shuffled.slice(0, mafiaCount).forEach(id => roles.set(id, 'Mafia'));
  let cursor = mafiaCount;
  if (ids.length >= 4) roles.set(shuffled[cursor++], 'Doctor');
  if (ids.length >= 6) roles.set(shuffled[cursor++], 'Detective');
  for (const id of ids) if (!roles.has(id)) roles.set(id, 'Civilian');

  const roleText: Record<string, [string,string]> = {
    Mafia: ['You are Mafia.', 'Eliminate the civilians before the town discovers you.'],
    Doctor: ['You are Doctor.', 'Protect one living player each night. You may protect yourself.'],
    Detective: ['You are Detective.', 'Investigate one living player each night to learn if they are Mafia.'],
    Civilian: ['You are Civilian.', 'Find the Mafia during the day and vote them out.'],
  };

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x7c3aed).setTitle('🕵️ MAFIA').setDescription(`Roles have been distributed to **${ids.length} players**.\n\n🌙 The first night will begin in a few seconds.\n\n**Mafia:** ${mafiaCount}\n**Doctor:** 1\n**Detective:** ${ids.length >= 6 ? '1' : 'none'}\n**Civilians:** ${ids.length - mafiaCount - 1 - (ids.length >= 6 ? 1 : 0)}`).setImage('attachment://mafia-roles.svg')],
    components: [],
    files: [gameAttachment(mafiaBoardSvg(ids, new Map(ids.map(id => [id, 'Player'])), 1), 'mafia-roles.svg')],
  });
  for (const id of ids) {
    try {
      const user = await interaction.client.users.fetch(id);
      const [title, objective] = roleText[roles.get(id)!];
      await user.send({
        embeds: [new EmbedBuilder().setColor(roles.get(id) === 'Mafia' ? 0xef4444 : roles.get(id) === 'Doctor' ? 0x22c55e : roles.get(id) === 'Detective' ? 0x38bdf8 : 0xa78bfa)
          .setTitle(`🎭 ${title}`).setDescription(objective).setImage('attachment://role-card.svg')],
        files: [gameAttachment(roleCardSvg(roles.get(id)!, objective), 'role-card.svg')],
      }).catch(() => undefined);
    } catch {}
  }

  let round = 1;
  while (alive.size > 0) {
    const aliveIds = [...alive];
    const livingMafia = aliveIds.filter(id => roles.get(id) === 'Mafia');
    if (!livingMafia.length) {
      const town = aliveIds.filter(id => roles.get(id) !== 'Mafia');
      const winner = town.length ? town[Math.floor(Math.random() * town.length)] : ids[0];
      addSparks(interaction.guild!.id, winner, game.reward);
      await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('🏆 MAFIA DEFEATED').setDescription(`The town exposed the Mafia!\n\n🎉 <@${winner}> receives **⚡ ${game.reward} Sparks**.`)] });
      return;
    }
    if (livingMafia.length >= aliveIds.length - livingMafia.length) {
      addSparks(interaction.guild!.id, livingMafia[0], game.reward);
      await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('☠️ MAFIA WINS').setDescription(`The Mafia has taken control of the town.\n\n🏆 <@${livingMafia[0]}> receives **⚡ ${game.reward} Sparks**.`)] });
      return;
    }

    await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle(`🌙 NIGHT ${round}`).setDescription(`🔪 The Mafia is choosing someone to kill...\n💊 The Doctor is choosing someone to protect...\n🔎 The Detective is investigating...\n\n⏱️ **20 seconds** for private actions.`)] });

    const actionPromises: Promise<{type:string,id:string|null}>[] = [];
    for (const id of aliveIds) {
      const role = roles.get(id);
      if (role === 'Mafia') actionPromises.push((async()=>({type:'kill',id:await mafiaActionDM(interaction.client, id,'🔪 Mafia — Choose a target','The Mafia is selecting tonight’s target.',aliveIds.filter(x=>roles.get(x)!=='Mafia'),`r${round}`,'kill')}))());
      if (role === 'Doctor') actionPromises.push((async()=>({type:'protect',id:await mafiaActionDM(interaction.client, id,'💊 Doctor — Choose protection','Choose one living player to protect tonight.',aliveIds,`r${round}`,'protect')}))());
      if (role === 'Detective') actionPromises.push((async()=>({type:'investigate',id:await mafiaActionDM(interaction.client, id,'🔎 Detective — Investigate','Choose one living player to inspect.',aliveIds.filter(x=>x!==id),`r${round}`,'investigate')}))());
    }
    const actions = await Promise.all(actionPromises);
    const kill = actions.find(a=>a.type==='kill')?.id;
    const protect = actions.find(a=>a.type==='protect')?.id;
    const investigate = actions.find(a=>a.type==='investigate')?.id;
    if (investigate) {
      const detective = aliveIds.find(id=>roles.get(id)==='Detective');
      if (detective) {
        const user = await interaction.client.users.fetch(detective).catch(()=>null);
        await user?.send(`🔎 Investigation result: <@${investigate}> is **${roles.get(investigate)==='Mafia'?'MAFIA 🔴':'NOT Mafia 🟢'}**.`).catch(()=>undefined);
      }
    }
    if (kill && kill !== protect) alive.delete(kill);

    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(kill && kill !== protect ? 0xef4444 : 0x22c55e)
        .setTitle(`🌅 DAWN ${round}`)
        .setDescription(kill && kill !== protect ? `☠️ <@${kill}> was eliminated during the night.` : '✨ The town survived the night. Nobody was eliminated.')
        .setFooter({ text: 'Discuss carefully. The Mafia may still be among you.' })]
    });

    if (alive.size <= 1) continue;

    const voteRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i=0;i<aliveIds.length;i+=5) {
      voteRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...aliveIds.slice(i,i+5).map(id=>new ButtonBuilder().setCustomId(`mafia-vote:r${round}:${id}`).setLabel(`Vote ${aliveIds.indexOf(id)+1}`).setStyle(ButtonStyle.Secondary))
      ));
    }
    const voteMsg = await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle(`☀️ DAY ${round} • VOTE`).setDescription(`The town has **30 seconds** to vote for the player they believe is Mafia.\n\n${aliveIds.map((id,i)=>`**${i+1}.** <@${id}>`).join('\n')}`)],
      components: voteRows,
      fetchReply: true,
    });
    const votes = new Map<string,string>();
    const collector = voteMsg.createMessageComponentCollector({time:30_000});
    collector.on('collect', async i => {
      if (!alive.has(i.user.id)) { await i.reply({content:'You are not alive in this game.',ephemeral:true}); return; }
      if (votes.has(i.user.id)) { await i.reply({content:'Your vote is already locked.',ephemeral:true}); return; }
      const target = i.customId.split(':').pop()!;
      if (!alive.has(target)) { await i.reply({content:'That player is no longer alive.',ephemeral:true}); return; }
      votes.set(i.user.id, target);
      await i.reply({content:'🗳️ Vote locked.',ephemeral:true});
      if (votes.size >= alive.size) collector.stop('all-voted');
    });
    await new Promise<void>(resolve=>collector.once('end',()=>resolve()));
    const counts = new Map<string,number>();
    for (const target of votes.values()) counts.set(target,(counts.get(target)??0)+1);
    const top = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
    const eliminated = top.length && (top.length===1 || top[0][1]>top[1][1]) ? top[0][0] : null;
    if (eliminated) alive.delete(eliminated);
    await voteMsg.edit({embeds:[new EmbedBuilder().setColor(eliminated?0xef4444:0x64748b).setTitle(`⚖️ DAY ${round} • RESULT`).setDescription(eliminated?`<@${eliminated}> was voted out.\n\nRole: **${roles.get(eliminated)}**`:'The vote was tied or no votes were cast. Nobody was eliminated.')],components:[]}).catch(()=>undefined);
    round++;
  }
}

async function runGuessDraw(interaction: ChatInputCommandInteraction, game: GameDef, ids: string[]): Promise<void> {
  const scene = rand(DRAW_SCENES);
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return;

  let winner: string | null = null;
  const answer = normalize(scene.name);
  const roundTimes = [5, 5, 5, 5, 5, 8];

  for (let round = 1; round <= 6; round++) {
    const revealWords = scene.words.slice(0, Math.max(0, round - 1));
    const description = round === 1
      ? `🖌️ A fresh mystery drawing is appearing.\n\n**No words. No hints.**\n\nYou have **${roundTimes[round-1]} seconds** to study it.`
      : `🖌️ The drawing is getting clearer.\n\n${revealWords.length ? `🔎 Revealed: **${revealWords.join(' • ')}**\n\n` : ''}You have **${roundTimes[round-1]} seconds** to guess.`;

    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0xa78bfa)
        .setTitle(`🎨 GUESS THE DRAW • ROUND ${round}/6`)
        .setDescription(description)
        .setImage('attachment://drawing.svg')
        .setFooter({ text: 'Every game uses a random drawing • First correct guess wins' })],
      files: [gameAttachment(drawChallengeSvg(scene, round), 'drawing.svg')],
    });

    const collected = await (ch as any).awaitMessages({
      filter: (m: any) => ids.includes(m.author.id) && normalize(m.content) === answer,
      time: roundTimes[round - 1] * 1000,
      max: 1,
    }).catch(() => null);

    const msg = collected?.first?.();
    if (msg) {
      winner = msg.author.id;
      break;
    }
  }

  if (winner) {
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('🏆 GUESS THE DRAW • SOLVED')
        .setDescription(`🎉 <@${winner}> solved the drawing!\n\nThe answer was **${scene.name}**.\n\n💰 Reward: **⚡ ${game.reward} Sparks**`)]
    });
    addSparks(interaction.guild!.id, winner, game.reward);
  } else {
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('⏱️ GUESS THE DRAW • TIME UP')
        .setDescription(`Nobody solved all six rounds.\n\nThe answer was **${scene.name}**.`)]
    });
  }
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
