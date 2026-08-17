import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Client } from 'discord.js';
import { loadGuild, saveGuild } from './storage.js';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 1_000_000) reject(new Error('Request body too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export async function handleDashboardApi(req: IncomingMessage, res: ServerResponse, client: Client): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Used by the website server-selector to determine whether THIS bot is in a guild.
  // This intentionally exposes only presence, not bot token or guild data.
  const presenceMatch = url.pathname.match(/^\/dashboard\/bot-status\/(\d+)$/);
  if (presenceMatch) {
    const guildId = presenceMatch[1];
    const present = client.guilds.cache.has(guildId);
    json(res, 200, { present, guildId });
    return true;
  }

  const match = url.pathname.match(/^\/dashboard\/api\/guild\/(\d+)\/config$/);
  if (!match) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,OPTIONS', 'access-control-allow-headers': 'content-type,x-dashboard-secret,x-dashboard-user' });
    res.end();
    return true;
  }

  const expectedSecret = process.env.DASHBOARD_API_SECRET?.trim();
  const suppliedSecret = String(req.headers['x-dashboard-secret'] ?? '');
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    json(res, 401, { error: 'Invalid dashboard secret' });
    return true;
  }

  const guildId = match[1];
  try {
    const data = loadGuild(guildId);
    if (req.method === 'GET') {
      json(res, 200, { config: data.config, autoResponders: data.autoResponders });
      return true;
    }
    if (req.method !== 'PUT') {
      json(res, 405, { error: 'Method not allowed' });
      return true;
    }

    const body = JSON.parse(await readBody(req) || '{}') as Record<string, unknown>;
    const { prefix, logChannel, autoResponders, ...configPatch } = body;
    if (prefix !== undefined) data.config.prefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim().slice(0, 5) : undefined;
    if (logChannel !== undefined) data.config.logChannel = typeof logChannel === 'string' && logChannel.trim() ? logChannel.trim() : undefined;
    if (autoResponders !== undefined) {
      if (!Array.isArray(autoResponders)) throw new Error('autoResponders must be an array');
      data.autoResponders = autoResponders.filter((x): x is { trigger: string; response: string } => !!x && typeof x === 'object' && typeof (x as any).trigger === 'string' && typeof (x as any).response === 'string').slice(0, 100);
    }
    if (Object.keys(configPatch).length) Object.assign(data.config as unknown as Record<string, unknown>, configPatch);
    saveGuild(guildId, data);
    json(res, 200, { ok: true, config: data.config, autoResponders: data.autoResponders });
    return true;
  } catch (error) {
    console.error('[Dashboard API]', error);
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    return true;
  }
}
