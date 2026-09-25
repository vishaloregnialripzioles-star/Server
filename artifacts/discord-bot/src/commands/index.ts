import type { Command } from '../types.js';

/**
 * Load commands one module at a time so one broken/optional command cannot
 * prevent the rest of the slash commands from being registered.
 */
async function load(path: string, exportName: string): Promise<Command | null> {
  try {
    const module = await import(path) as Record<string, unknown>;
    const command = module[exportName] as Command | undefined;
    if (!command?.data?.toJSON) {
      console.error(`[Command loader] ${path} does not export ${exportName}`);
      return null;
    }
    return command;
  } catch (error) {
    console.error(`[Command loader] Failed to load ${path} (${exportName})`, error);
    return null;
  }
}

const definitions: Array<[string, string]> = [
  ['./setup.js', 'setup'], ['./invitelog.js', 'invitelog'], ['./ban.js', 'ban'], ['./kick.js', 'kick'],
  ['./mute.js', 'mute'], ['./unmute.js', 'unmute'], ['./timeout.js', 'timeoutCommand'], ['./warn.js', 'warn'],
  ['./warnings.js', 'warnings'], ['./clearwarns.js', 'clearwarns'], ['./warnsleaderboard.js', 'warnsLeaderboard'],
  ['./invites.js', 'invites'], ['./inviterole.js', 'inviterole'], ['./purge.js', 'purge'], ['./purgebots.js', 'purgebots'],
  ['./lock.js', 'lock'], ['./unlock.js', 'unlock'], ['./slowmode.js', 'slowmode'], ['./chatban.js', 'chatban'],
  ['./unchatban.js', 'unchatban'], ['./jail.js', 'jail'], ['./unjail.js', 'unjail'], ['./nick.js', 'nick'],
  ['./afk.js', 'afk'], ['./remindme.js', 'remindme'], ['./poll.js', 'poll'], ['./snipe.js', 'snipe'],
  ['./editsnipe.js', 'editsnipe'], ['./userinfo.js', 'userinfo'], ['./serverinfo.js', 'serverinfo'], ['./temprole.js', 'temprole'],
  ['./rank.js', 'rank'], ['./leaderboard.js', 'leaderboard'], ['./ticket.js', 'ticket'], ['./closeticket.js', 'closeticket'], ['./reopen.js', 'reopen'], ['./transcripts.js', 'transcripts'],
  ['./ticketpanel.js', 'ticketpanel'], ['./roast.js', 'roast'], ['./setprefix.js', 'setprefix'], ['./gay.js', 'gay'],
  ['./pro.js', 'pro'], ['./noob.js', 'noob'], ['./ship.js', 'ship'], ['./autoresponder.js', 'autoresponder'],
  ['./help.js', 'help'], ['./levelconfig.js', 'levelconfig'], ['./createrole.js', 'createrole'], ['./roleassign.js', 'roleassign'],
  ['./giveaway.js', 'giveaway'], ['./giveawaydaily.js', 'giveawayDaily'], ['./automod.js', 'automod'], ['./music.js', 'music'],
  ['./embed.js', 'embedCmd'], ['./welcome.js', 'welcome'], ['./greet.js', 'greet'], ['./gamePolicy.js', 'gamePolicy'],
  ['./games.js', 'game'], ['./gamesInfo.js', 'games'], ['./sparks.js', 'coinLeaderboard'], ['./shop.js', 'shop'],
  ['./removeshop.js', 'removeshop'], ['./antinuke.js', 'antinuke'], ['./extraowner.js', 'extraowner'], ['./recovery.js', 'recovery'],
  ['./joinrole.js', 'joinrole'], ['./reactionrole.js', 'reactionrole'], ['./socialnotification.js', 'socialnotification'],
  ['./roleconnection.js', 'roleconnection'], ['./ytnotify.js', 'ytnotify'], ['./ai.js', 'ai'], ['./autosetup.js', 'autosetup'], ['./clearchannels.js', 'clearchannels'],
  ['./trade.js', 'trade'], ['./uploademoji.js', 'uploademoji'], ['./bloxemoji.js', 'bloxemoji'], ['./setbloxemojis.js', 'setbloxemojis'],
  ['../bloxScanner.js', 'bloxscanner'], ['./av.js', 'av'], ['./banner.js', 'banner'], ['./ping.js', 'ping'], ['./uptime.js', 'uptime'],
  ['./funCommands.js', 'cool'], ['./funCommands.js', 'aura'], ['./funCommands.js', 'funny'], ['./funCommands.js', 'sad'],
  ['./funCommands.js', 'angry'], ['./funCommands.js', 'legend'], ['./memberactivity.js', 'memberactivity'], ['./memberactivity.js', 'activity'],
];

const loaded: Command[] = [];
for (const [path, exportName] of definitions) {
  const command = await load(path, exportName);
  if (command) loaded.push(command);
}

// De-duplicate command names in case a module is intentionally loaded twice.
const seen = new Set<string>();
export const allCommands: Command[] = loaded.filter(command => {
  const name = command.data.name;
  if (seen.has(name)) return false;
  seen.add(name);
  return true;
});

const helpCommand = allCommands.find(command => command.data.name === 'help');
if (helpCommand) {
  const { setHelpCommandRegistry } = await import('./help.js');
  setHelpCommandRegistry(allCommands);
}

console.log(`📦 Command loader ready: ${allCommands.length}/${definitions.length} commands loaded`);
