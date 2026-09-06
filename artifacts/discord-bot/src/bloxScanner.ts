import type { Client, Message, Attachment } from 'discord.js';
import { EmbedBuilder, Events, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { claimMessageEvent, loadGuild, updateGuild } from './storage.js';
import { BLOX_VALUES, findBloxValue } from './commands/bloxvalue.js';
import { getGuildPrefix } from './prefixHandler.js';

type DetectedItem = { name: string; quantity?: number; permanent?: boolean; confidence?: number };
type ScanResult = { left: DetectedItem[]; right: DetectedItem[] };
type StoredScreenshot = { url: string; messageId: string; createdAt: number };

const SCAN_KEY = Symbol.for('sparxie.bloxscanner.registered');
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_EXT = /\.(png|jpe?g|webp)$/i;

const isImage = (a: Attachment) => Boolean(a.contentType?.startsWith('image/')) || SUPPORTED_EXT.test(a.name ?? '');
const isSs = (s: string) => /^(?:\.|!)?ss$/i.test(s.trim());

function scannerCommand(content: string, prefix: string): string | undefined {
  const raw = content.trim();
  const candidates = [raw, raw.startsWith(prefix) ? raw.slice(prefix.length) : '', raw.startsWith('.') ? raw.slice(1) : ''];
  for (const value of candidates) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.startsWith('setbloxscanner')) return normalized.slice('setbloxscanner'.length).trim();
  }
  return undefined;
}

function parseValue(raw: string): number | null {
  const m = raw.trim().toUpperCase().replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

function parseDemand(raw?: string): number | null {
  const m = String(raw ?? '').match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (!m) return null;
  return Math.max(0, Math.min(10, Number(m[1])));
}

function money(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return '—';
  if (a >= 1e12) return `${(v / 1e12).toFixed(2).replace(/\.00$/, '')}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.00$/, '')}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e8 ? 0 : 2).replace(/\.00$/, '')}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return Math.round(v).toLocaleString('en-US');
}

function resolve(item: DetectedItem) {
  const entry = findBloxValue(item.name);
  if (!entry) return null;
  const quantity = Math.max(1, Math.min(50, Math.round(Number(item.quantity ?? 1))));
  const permanent = Boolean(item.permanent);
  const raw = permanent && entry.perm && entry.perm !== '—' && entry.perm !== 'N/A' ? parseValue(entry.perm) : parseValue(entry.regular);
  if (raw === null) return null;
  const demand = parseDemand(entry.demand);
  return { entry, quantity, permanent, unit: raw, demand, confidence: item.confidence ?? 0 };
}

function totals(items: DetectedItem[]) {
  const resolved: any[] = [];
  const unknown: string[] = [];
  let raw = 0;
  let score = 0;
  let demandSum = 0;
  let demandCount = 0;
  for (const item of items) {
    const r = resolve(item);
    if (!r) { unknown.push(item.name); continue; }
    const value = r.unit * r.quantity;
    const demandMultiplier = r.demand == null ? 0.85 : 0.70 + (0.03 * r.demand);
    raw += value;
    score += value * demandMultiplier;
    if (r.demand != null) { demandSum += r.demand; demandCount++; }
    resolved.push({ ...r, value });
  }
  return { resolved, unknown, raw, score, avgDemand: demandCount ? demandSum / demandCount : null };
}

function classify(leftScore: number, rightScore: number): { label: 'W' | 'FAIR' | 'L'; ratio: number } {
  if (leftScore === 0 && rightScore === 0) return { label: 'FAIR', ratio: 1 };
  if (rightScore === 0) return { label: leftScore > 0 ? 'L' : 'FAIR', ratio: Infinity };
  if (leftScore === 0) return { label: 'W', ratio: 0 };
  const ratio = leftScore / rightScore;
  if (ratio >= 0.90 && ratio <= 1.10) return { label: 'FAIR', ratio };
  return ratio < 1 ? { label: 'W', ratio } : { label: 'L', ratio };
}

function buildEmbed(authorId: string, result: ScanResult, sourceId: string): EmbedBuilder {
  const left = totals(result.left);
  const right = totals(result.right);
  const verdict = classify(left.score, right.score);
  const list = (s: ReturnType<typeof totals>) => s.resolved.length
    ? s.resolved.map(x => `${x.quantity > 1 ? `${x.quantity}x ` : ''}${x.entry.name}${x.permanent ? ' (Perm)' : ''} — **${money(x.value)}** · ${x.demand == null ? 'N/A' : `${x.demand}/10`}`).join('\n')
    : 'None detected';
  const ratio = Number.isFinite(verdict.ratio) ? `${(verdict.ratio * 100).toFixed(1)}%` : '∞';
  const embed = new EmbedBuilder()
    .setTitle(`🔎 Trade Scanner — ${verdict.label}`)
    .setColor(verdict.label === 'W' ? 0x2ecc71 : verdict.label === 'L' ? 0xe74c3c : 0xf1c40f)
    .setDescription(`**<@${authorId}>** is the screenshot sender. **Left = their trade.** Right = the other trader.`)
    .addFields(
      { name: '👈 Your / Left Side', value: `${list(left)}\n\n**Value:** ${money(left.raw)}\n**Demand score:** ${money(left.score)}\n**Avg demand:** ${left.avgDemand == null ? 'N/A' : `${left.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
      { name: '👉 Other / Right Side', value: `${list(right)}\n\n**Value:** ${money(right.raw)}\n**Demand score:** ${money(right.score)}\n**Avg demand:** ${right.avgDemand == null ? 'N/A' : `${right.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
      { name: '📊 Final Result', value: `# **${verdict.label}**\nScore ratio: **${ratio}**\nValue difference: **${money(left.raw - right.raw)}**\nDemand-adjusted difference: **${money(left.score - right.score)}**`, inline: false },
    )
    .setFooter({ text: `Blox Fruits W/F/L Scanner • ${sourceId}` })
    .setTimestamp();
  const unknown = [...left.unknown, ...right.unknown];
  if (unknown.length) embed.addFields({ name: '⚠️ Not Counted', value: [...new Set(unknown)].slice(0, 10).map(x => `• ${x}`).join('\n').slice(0, 1024) });
  return embed;
}

async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image too large');
  return { mime: response.headers.get('content-type')?.split(';')[0] || 'image/png', data: Buffer.from(bytes).toString('base64') };
}

function parseJson(text: string): ScanResult {
  const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Invalid vision response');
  const data = JSON.parse(clean.slice(start, end + 1)) as any;
  const side = (v: unknown): DetectedItem[] => Array.isArray(v) ? v.map((x: any) => ({
    name: typeof x?.name === 'string' ? x.name.trim() : '',
    quantity: Number.isFinite(Number(x?.quantity)) ? Number(x.quantity) : 1,
    permanent: Boolean(x?.permanent),
    confidence: Number.isFinite(Number(x?.confidence)) ? Number(x.confidence) : 0,
  })).filter(x => x.name) : [];
  return { left: side(data.left), right: side(data.right) };
}

async function analyze(url: string): Promise<ScanResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const image = await downloadImage(url);
  const model = process.env.GEMINI_SCANNER_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const prompt = `Read this Blox Fruits trade screenshot. Identify ONLY items inside the actual TRADE window, never inventory/hotbar/background. LEFT side is ALWAYS the person who sent this screenshot; RIGHT side is the other trader. Return JSON only: {"left":[{"name":"Kitsune","quantity":2,"permanent":false,"confidence":0.99}],"right":[]}. Count duplicate slots. Preserve special/skin names exactly when visible, including Yellow Lightning and Green Lightning. permanent=true only if clearly permanent. Never invent an item. If uncertain, keep the visible name and confidence below 0.70. Do not calculate W/F/L yourself.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mime, data: image.data } }] }], generationConfig: { temperature: 0, maxOutputTokens: 1200, responseMimeType: 'application/json' } }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as any;
  const text = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned no scan result');
  return parseJson(text);
}

function latest(guildId: string, userId: string): StoredScreenshot | null {
  return loadGuild(guildId).config.bloxScannerScreenshots?.[userId] ?? null;
}

function saveScreenshot(message: Message, attachment: Attachment) {
  updateGuild(message.guild!.id, data => {
    data.config.bloxScannerScreenshots = data.config.bloxScannerScreenshots ?? {};
    data.config.bloxScannerScreenshots[message.author.id] = { url: attachment.url, messageId: message.id, createdAt: Date.now() };
  });
}

async function scan(message: Message, url: string, sourceId: string) {
  const status = await message.reply('🔎 **Scanning screenshot...** Reading both trade sides, values and demand.');
  try {
    const result = await analyze(url);
    const left = totals(result.left), right = totals(result.right);
    if (!left.resolved.length && !right.resolved.length) {
      await status.edit('❌ I could not confidently detect supported trade items. Please send the full trade window clearly.');
      return;
    }
    await status.edit({ content: '', embeds: [buildEmbed(message.author.id, result, sourceId)] });
  } catch (err) {
    console.error('[BloxScanner]', err);
    const reason = err instanceof Error ? err.message : String(err);
    await status.edit(reason.includes('GEMINI_API_KEY') ? '❌ Scanner needs **GEMINI_API_KEY** in Render.' : '❌ Scan failed. Please try a clear full trade screenshot again.');
  }
}

export const bloxscanner: Command = {
  data: new SlashCommandBuilder().setName('bloxscanner').setDescription('Blox Fruits W/F/L screenshot scanner')
    .addSubcommand(s => s.setName('enable').setDescription('Enable scanner in this channel'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable scanner'))
    .addSubcommand(s => s.setName('status').setDescription('Show scanner channel'))
    .addSubcommand(s => s.setName('scan').setDescription('Scan your latest screenshot')),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply({ content: '❌ Server only.', ephemeral: true }); return; }
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') { const id = loadGuild(interaction.guildId).config.bloxScannerChannelId; await interaction.reply(id ? `🔎 Scanner: <#${id}>` : '🔎 Scanner is disabled.'); return; }
    const allowed = interaction.guild?.ownerId === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (sub === 'enable' || sub === 'disable') {
      if (!allowed) { await interaction.reply({ content: '❌ Manage Server required.', ephemeral: true }); return; }
      updateGuild(interaction.guildId, d => { d.config.bloxScannerChannelId = sub === 'enable' ? interaction.channelId : undefined; });
      await interaction.reply(sub === 'enable' ? `🔎 **Scanner enabled in <#${interaction.channelId}>.** Upload a trade screenshot and it will scan automatically.` : '🔎 **Scanner disabled.**');
      return;
    }
    const channel = loadGuild(interaction.guildId).config.bloxScannerChannelId;
    if (channel && channel !== interaction.channelId) { await interaction.reply({ content: `❌ Use the scanner in <#${channel}>.`, ephemeral: true }); return; }
    const saved = latest(interaction.guildId, interaction.user.id);
    if (!saved) { await interaction.reply({ content: '❌ No screenshot saved yet. Upload one first.', ephemeral: true }); return; }
    await interaction.deferReply();
    try { const result = await analyze(saved.url); await interaction.editReply({ embeds: [buildEmbed(interaction.user.id, result, saved.messageId)] }); }
    catch { await interaction.editReply('❌ Scan failed. Check GEMINI_API_KEY and try again.'); }
  },
};

export function registerBloxScannerEvents(client: Client) {
  if ((client as any)[SCAN_KEY]) return;
  (client as any)[SCAN_KEY] = true;
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild) return;
      const enabledChannel = loadGuild(message.guild.id).config.bloxScannerChannelId;
      if (!enabledChannel || enabledChannel !== message.channelId) return;
      const prefix = getGuildPrefix(message.guild.id);
      const setup = scannerCommand(message.content, prefix);
      if (setup !== undefined) {
        if (!(await claimMessageEvent(`bloxscanner:setup:${message.id}`))) return;
        const allowed = canManageMessage(message);
        if (!allowed) { await message.reply('❌ Manage Server required.'); return; }
        const action = setup.split(/\s+/)[0] || 'status';
        if (action === 'enable') { updateGuild(message.guild.id, d => { d.config.bloxScannerChannelId = message.channelId; }); await message.reply('🔎 Scanner enabled. Upload a screenshot and it will scan automatically.'); }
        else if (action === 'disable') { updateGuild(message.guild.id, d => { d.config.bloxScannerChannelId = undefined; }); await message.reply('🔎 Scanner disabled.'); }
        else await message.reply(`🔎 Scanner is enabled in <#${enabledChannel}>.`);
        return;
      }
      const attachment = message.attachments.find(isImage);
      if (attachment) {
        if (!(await claimMessageEvent(`bloxscanner:image:${message.id}`))) return;
        saveScreenshot(message, attachment);
        await scan(message, attachment.url, message.id);
        return;
      }
      if (!isSs(message.content)) return;
      if (!(await claimMessageEvent(`bloxscanner:ss:${message.id}`))) return;
      const saved = latest(message.guild.id, message.author.id);
      if (!saved) { await message.reply('❌ No screenshot saved for you. Upload a trade screenshot first.'); return; }
      await scan(message, saved.url, saved.messageId);
    } catch (err) { console.error('[BloxScanner message]', err); }
  });
}

function canManageMessage(message: Message) {
  return Boolean(message.guild?.ownerId === message.author.id || message.member?.permissions.has(PermissionFlagsBits.ManageGuild) || message.member?.permissions.has(PermissionFlagsBits.Administrator));
}
