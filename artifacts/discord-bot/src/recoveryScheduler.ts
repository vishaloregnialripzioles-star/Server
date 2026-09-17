import type { Client } from 'discord.js';
import { loadGuild, updateGuild } from './storage.js';
import { createRecoveryBackup } from './recovery.js';

const RUNNING = Symbol.for('sparxie.recovery.scheduler');

export function startRecoveryScheduler(client: Client): void {
  if ((client as any)[RUNNING]) return;
  (client as any)[RUNNING] = true;
  const tick = async () => {
    for (const guild of client.guilds.cache.values()) {
      const data = loadGuild(guild.id);
      if (!data.recovery.enabled) continue;
      const interval = Math.max(15, data.recovery.intervalMinutes || 360) * 60_000;
      if (Date.now() - (data.recovery.lastAutoBackupAt || 0) < interval) continue;
      try {
        const backup = await createRecoveryBackup(guild);
        updateGuild(guild.id, d => {
          d.recoveryBackups = [backup, ...(d.recoveryBackups ?? [])].slice(0, 25);
          d.recovery.lastAutoBackupAt = backup.createdAt;
        });
        console.log(`[Recovery] Automatic save created for ${guild.id}: ${backup.id}`);
      } catch (error) {
        console.error(`[Recovery] Automatic save failed for ${guild.id}:`, error);
      }
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}
