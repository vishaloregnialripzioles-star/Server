import type { Command } from '../types.js';
import { setup } from './setup.js';
import { ban } from './ban.js';
import { kick } from './kick.js';
import { mute } from './mute.js';
import { unmute } from './unmute.js';
import { timeoutCommand } from './timeout.js';
import { warn } from './warn.js';
import { warnings } from './warnings.js';
import { clearwarns } from './clearwarns.js';
import { purge } from './purge.js';
import { purgebots } from './purgebots.js';
import { lock } from './lock.js';
import { unlock } from './unlock.js';
import { slowmode } from './slowmode.js';
import { chatban } from './chatban.js';
import { unchatban } from './unchatban.js';
import { jail } from './jail.js';
import { unjail } from './unjail.js';
import { nick } from './nick.js';
import { afk } from './afk.js';
import { remindme } from './remindme.js';
import { poll } from './poll.js';
import { snipe } from './snipe.js';
import { editsnipe } from './editsnipe.js';
import { userinfo } from './userinfo.js';
import { serverinfo } from './serverinfo.js';
import { temprole } from './temprole.js';
import { rank } from './rank.js';
import { leaderboard } from './leaderboard.js';
import { ticket } from './ticket.js';
import { closeticket } from './closeticket.js';
import { ticketpanel } from './ticketpanel.js';
import { roast } from './roast.js';
import { setprefix } from './setprefix.js';
import { gay } from './gay.js';
import { pro } from './pro.js';
import { noob } from './noob.js';
import { ship } from './ship.js';
import { autoresponder } from './autoresponder.js';
import { help } from './help.js';
import { levelconfig } from './levelconfig.js';
import { createrole } from './createrole.js';
import { roleassign } from './roleassign.js';
import { giveaway } from './giveaway.js';
import { music } from './music.js';
import { embedCmd } from './embed.js';
import { welcome } from './welcome.js';
import { greet } from './greet.js';
import { game, games } from './games.js';
import { coinLeaderboard } from './sparks.js';
import { shop } from './shop.js';
import { antinuke } from './antinuke.js';
import { extraowner } from './extraowner.js';

export const allCommands: Command[] = [
  setup,
  ban, kick, mute, unmute, timeoutCommand,
  warn, warnings, clearwarns,
  purge, purgebots,
  lock, unlock, slowmode,
  chatban, unchatban,
  jail, unjail,
  nick,
  afk, remindme, poll,
  snipe, editsnipe,
  userinfo, serverinfo,
  temprole,
  rank, leaderboard,
  ticket, closeticket, ticketpanel,
  roast, setprefix,
  gay, pro, noob, ship,
  autoresponder,
  help,
  levelconfig,
  createrole,
  roleassign,
  giveaway,
  music,
  embedCmd,
  welcome,
  greet,
  game, games,
  coinLeaderboard,
  shop,
  antinuke,
  extraowner,
];
