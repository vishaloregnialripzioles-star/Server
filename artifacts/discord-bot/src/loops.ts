import type { Client, BaseGuildTextChannel } from 'discord.js';
import { loadGuild, saveGuild } from './storage.js';
import { endGiveaway } from './giveawayUtils.js';

export function startLoops(client: Client): void {
  setInterval(() => {
    void checkReminders(client);
    void checkTempRoles(client);
    void checkGiveaways(client);
  }, 30_000);
}

async function checkReminders(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const data = loadGuild(guild.id);
    const due = data.reminders.filter(r => r.due <= now);
    if (due.length === 0) continue;
    data.reminders = data.reminders.filter(r => r.due > now);
    saveGuild(guild.id, data);

    for (const reminder of due) {
      try {
        const channel = await client.channels.fetch(reminder.channelId);
        if (channel?.isTextBased()) {
          await (channel as BaseGuildTextChannel).send({
            content: `⏰ <@${reminder.userId}> Reminder: **${reminder.message}**`,
          });
        }
      } catch {
        // Channel deleted or inaccessible
      }
    }
  }
}

async function checkGiveaways(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const data = loadGuild(guild.id);
    const due = data.giveaways.filter(g => !g.ended && g.endsAt <= now);
    if (due.length === 0) continue;
    for (const giveaway of due) {
      await endGiveaway(guild, giveaway).catch(() => undefined);
    }
  }
}

async function checkTempRoles(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const data = loadGuild(guild.id);
    const expired = data.tempRoles.filter(r => r.expiresAt <= now);
    if (expired.length === 0) continue;
    data.tempRoles = data.tempRoles.filter(r => r.expiresAt > now);
    saveGuild(guild.id, data);

    for (const tr of expired) {
      try {
        const member = await guild.members.fetch(tr.userId);
        await member.roles.remove(tr.roleId, 'Temporary role expired');
      } catch {
        // Member left or role deleted
      }
    }
  }
}
