import type { Client, BaseGuildTextChannel } from 'discord.js';
import { loadGuild, saveGuild } from './storage.js';
import { endGiveaway } from './giveawayUtils.js';

const DAILY_MS = 24 * 60 * 60 * 1000;

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
        if (channel?.isTextBased()) await (channel as BaseGuildTextChannel).send({ content: `⏰ <@${reminder.userId}> Reminder: **${reminder.message}**` });
      } catch { /* inaccessible */ }
    }
  }
}

async function checkGiveaways(client: Client): Promise<void> {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const data = loadGuild(guild.id);
    const daily = data.config.giveawayDaily;
    let changed = false;

    if (daily?.enabled && daily.channelId && daily.message) {
      for (const giveaway of data.giveaways) {
        if (giveaway.ended || giveaway.endsAt <= now) continue;
        const last = (giveaway as any).dailyReminderLastAt as number | undefined;
        if (last && now - last < DAILY_MS) continue;
        try {
          const channel = await guild.channels.fetch(daily.channelId);
          if (channel?.isTextBased()) {
            const remaining = Math.max(0, giveaway.endsAt - now);
            const hours = Math.floor(remaining / 3_600_000);
            const minutes = Math.floor((remaining % 3_600_000) / 60_000);
            const text = daily.message.replaceAll('{prize}', giveaway.prize).replaceAll('{time}', `${hours}h ${minutes}m`);
            await (channel as BaseGuildTextChannel).send({ content: `🎁 ${text}\n👉 <#${giveaway.channelId}>` });
            (giveaway as any).dailyReminderLastAt = now;
            changed = true;
          }
        } catch { /* channel inaccessible */ }
      }
    }

    const due = data.giveaways.filter(g => !g.ended && g.endsAt <= now);
    for (const giveaway of due) await endGiveaway(guild, giveaway).catch(() => undefined);
    if (changed) saveGuild(guild.id, data);
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
      } catch { /* Member left or role deleted */ }
    }
  }
}
