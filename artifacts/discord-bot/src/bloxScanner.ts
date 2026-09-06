import type { Client, Message, Attachment } from 'discord.js';
import { EmbedBuilder, Events, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { claimMessageEvent, loadGuild, updateGuild } from './storage.js';
import { BLOX_VALUES, findBloxValue } from './commands/bloxvalue.js';

type Item = { name: string; quantity?: number; permanent?: boolean; confidence?: number };
type Result = { left: Item[]; right: Item[] };
type Saved = { url: string; messageId: string; createdAt: number };

const SCAN_KEY = Symbol.for('sparxie.bloxscanner.registered');
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const isImage = (a: Attachment) => Boolean(a.contentType?.startsWith('image/')) || /\.(png|jpe?g|webp)$/i.test(a.name ?? '');
const isSs = (s: string) => /^(?:\.|!)?ss$/i.test(s.trim());
const CATALOG = BLOX_VALUES.map((x: any) => x.name).filter(Boolean).join(', ');

function parseValue(raw: string): number | null {
  const m = raw.replace(/,/g, '').trim().toUpperCase().match(/^(\d+(?:\.\d+)?)([KMBT])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return Number.isFinite(n) ? n * mult : null;
}
function parseDemand(raw?: string): number | null {
  const m = String(raw ?? '').match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  return m ? Math.max(0, Math.min(10, Number(m[1]))) : null;
}
function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2).replace(/\.00$/, '')}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(n).toLocaleString('en-US');
}
function resolve(item: Item) {
  const entry = findBloxValue(item.name);
  if (!entry) return null;
  const quantity = Math.max(1, Math.min(50, Math.round(Number(item.quantity ?? 1))));
  const permanent = Boolean(item.permanent);
  const unit = permanent && entry.perm && entry.perm !== '—' && entry.perm !== 'N/A' ? parseValue(entry.perm) : parseValue(entry.regular);
  if (unit === null) return null;
  return { entry, quantity, permanent, unit, demand: parseDemand(entry.demand), confidence: item.confidence ?? 0 };
}
function totals(items: Item[]) {
  const rows: any[] = [], unknown: string[] = [];
  let raw = 0, score = 0, demandSum = 0, demandCount = 0;
  for (const item of items) {
    const r = resolve(item);
    if (!r) { unknown.push(item.name); continue; }
    const total = r.unit * r.quantity;
    const multiplier = r.demand == null ? 0.85 : 0.70 + 0.03 * r.demand;
    raw += total; score += total * multiplier;
    if (r.demand != null) { demandSum += r.demand; demandCount++; }
    rows.push({ ...r, total });
  }
  return { rows, unknown, raw, score, avgDemand: demandCount ? demandSum / demandCount : null };
}
function classify(left: number, right: number) {
  if (!left && !right) return { label: 'FAIR' as const, ratio: 1 };
  if (!right) return { label: left ? 'L' as const : 'FAIR' as const, ratio: Infinity };
  if (!left) return { label: 'W' as const, ratio: 0 };
  const ratio = left / right;
  if (ratio >= 0.90 && ratio <= 1.10) return { label: 'FAIR' as const, ratio };
  return ratio < 1 ? { label: 'W' as const, ratio } : { label: 'L' as const, ratio };
}
function buildEmbed(userId: string, result: Result): EmbedBuilder {
  const left = totals(result.left), right = totals(result.right), verdict = classify(left.score, right.score);
  const list = (x: ReturnType<typeof totals>) => x.rows.length ? x.rows.map((i: any) => `${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.entry.name}${i.permanent ? ' (Perm)' : ''} — **${money(i.total)}** · Demand **${i.demand == null ? 'N/A' : `${i.demand}/10`}**`).join('\n') : 'None detected';
  const ratio = Number.isFinite(verdict.ratio) ? `${(verdict.ratio * 100).toFixed(1)}%` : '∞';
  const embed = new EmbedBuilder()
    .setTitle(`🔎 Trade Scanner — ${verdict.label}`)
    .setColor(verdict.label === 'W' ? 0x2ecc71 : verdict.label === 'L' ? 0xe74c3c : 0xf1c40f)
    .setDescription(`**<@${userId}>** uploaded the screenshot. **Left = uploader. Right = other trader.**`)
    .addFields(
      { name: '👈 LEFT / YOUR TRADE', value: `${list(left)}\n\n**Raw value:** ${money(left.raw)}\n**Demand score:** ${money(left.score)}\n**Average demand:** ${left.avgDemand == null ? 'N/A' : `${left.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
      { name: '👉 RIGHT / OTHER TRADE', value: `${list(right)}\n\n**Raw value:** ${money(right.raw)}\n**Demand score:** ${money(right.score)}\n**Average demand:** ${right.avgDemand == null ? 'N/A' : `${right.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
      { name: '🏆 FINAL ANSWER', value: `# **${verdict.label}**\nRatio: **${ratio}**\nRaw difference: **${money(left.raw - right.raw)}**\nDemand difference: **${money(left.score - right.score)}**` },
    );
  const unknown = [...left.unknown, ...right.unknown];
  if (unknown.length) embed.addFields({ name: '⚠️ Unmatched / needs review', value: [...new Set(unknown)].slice(0, 10).map(x => `• ${x}`).join('\n').slice(0, 1024) });
  return embed;
}

async function downloadImage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Discord image ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image too large');
    const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return { mime: mime.startsWith('image/') ? mime : 'image/jpeg', data: Buffer.from(bytes).toString('base64') };
  } finally { clearTimeout(timer); }
}
function parseJson(text: string): Result {
  const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Invalid vision JSON');
  const data = JSON.parse(clean.slice(start, end + 1)) as any;
  const side = (v: unknown): Item[] => Array.isArray(v) ? v.map((x: any) => ({
    name: typeof x?.name === 'string' ? x.name.trim() : '',
    quantity: Number.isFinite(Number(x?.quantity)) ? Number(x.quantity) : 1,
    permanent: Boolean(x?.permanent),
    confidence: Number.isFinite(Number(x?.confidence)) ? Number(x.confidence) : 0,
  })).filter(x => x.name) : [];
  return { left: side(data.left), right: side(data.right) };
}

async function visionPass(image: { mime: string; data: string }, key: string, model: string, focus: string): Promise<Result> {
  const prompt = `Deeply inspect this Blox Fruits Treasure Trade screenshot. ${focus}
ONLY inspect the central TREASURE TRADE panel. Ignore inventory, hotbar, abilities, background, chat, avatars, decorative UI and countdown numbers. LEFT is ALWAYS the screenshot uploader; RIGHT is ALWAYS the other trader. Inspect EVERY occupied slot one by one. Read the green item-name text first and use the artwork as a cross-check. Count duplicate slots. Do not use the Beli price as trade value. Distinguish special variants such as Yellow Lightning, Green Lightning and Red Lightning. permanent=true only when clearly permanent. Never invent an item. If partly hidden, choose the closest canonical name and set confidence below 0.70.
Canonical catalog: ${CATALOG}
Return JSON ONLY: {"left":[{"name":"Kitsune","quantity":1,"permanent":false,"confidence":0.98}],"right":[]}. Do not calculate W/F/L.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.data } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1800, response_mime_type: 'application/json' },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${raw.slice(0, 350)}`);
  const body = JSON.parse(raw) as any;
  const text = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('').trim();
  if (!text) throw new Error(`Gemini returned no result: ${JSON.stringify(body.promptFeedback ?? '')}`);
  return parseJson(text);
}
function mergeResults(a: Result, b: Result): Result {
  const mergeSide = (items: Item[]) => {
    const out: Item[] = [];
    for (const item of items) {
      const entry = findBloxValue(item.name), name = entry?.name ?? item.name;
      const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1)));
      const existing = out.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (existing) { existing.quantity = (existing.quantity ?? 1) + quantity; existing.confidence = Math.max(existing.confidence ?? 0, item.confidence ?? 0); existing.permanent = Boolean(existing.permanent || item.permanent); }
      else out.push({ ...item, name, quantity });
    }
    return out;
  };
  return { left: mergeSide([...a.left, ...b.left]), right: mergeSide([...a.right, ...b.right]) };
}
async function analyze(url: string): Promise<Result> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const image = await downloadImage(url);
  const configured = process.env.GEMINI_SCANNER_MODEL?.trim() || process.env.GEMINI_MODEL?.trim();
  const models = [...new Set([configured, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean) as string[])];
  for (const model of models) {
    const passes = await Promise.allSettled([
      visionPass(image, key, model, 'Perform an OCR/text-first pass: read every visible item label and slot boundary.'),
      visionPass(image, key, model, 'Perform an artwork/layout-first pass: use each slot icon plus visible text to cross-check the identity.'),
    ]);
    const good = passes.filter((x): x is PromiseFulfilledResult<Result> => x.status === 'fulfilled').map(x => x.value);
    if (good.length) return good.length === 1 ? good[0] : mergeResults(good[0], good[1]);
    console.error(`[BloxScanner] ${model} failed`, passes.map(x => x.status === 'rejected' ? String(x.reason) : ''));
  }
  throw new Error('All Gemini vision models failed');
}
function latest(guildId: string, userId: string): Saved | null { return loadGuild(guildId).config.bloxScannerScreenshots?.[userId] ?? null; }
function saveScreenshot(message: Message, attachment: Attachment) { updateGuild(message.guild!.id, d => { d.config.bloxScannerScreenshots = d.config.bloxScannerScreenshots ?? {}; d.config.bloxScannerScreenshots[message.author.id] = { url: attachment.url, messageId: message.id, createdAt: Date.now() }; }); }
async function scan(message: Message, url: string) {
  const status = await message.reply('🔎 **Scanning screenshot...** Deep-identifying every trade slot and matching fruits with value + demand.');
  try {
    const result = await analyze(url);
    if (!result.left.length && !result.right.length) { await status.edit('❌ No trade items detected. Please upload the full Treasure Trade window.'); return; }
    await status.edit({ content: '', embeds: [buildEmbed(message.author.id, result)] });
  } catch (error) {
    console.error('[BloxScanner] scan failed:', error);
    await status.edit('❌ **Deep scan failed.** Please try the full screenshot again. If it keeps failing, check the bot Render logs for the Gemini error.');
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
      await interaction.reply(sub === 'enable' ? `🔎 **Scanner enabled in <#${interaction.channelId}>.** Upload a trade screenshot and it will scan automatically.` : '🔎 **Scanner disabled.**'); return;
    }
    const channel = loadGuild(interaction.guildId).config.bloxScannerChannelId;
    if (channel && channel !== interaction.channelId) { await interaction.reply({ content: `❌ Use <#${channel}>.`, ephemeral: true }); return; }
    const saved = latest(interaction.guildId, interaction.user.id);
    if (!saved) { await interaction.reply({ content: '❌ Upload a screenshot first.', ephemeral: true }); return; }
    await interaction.deferReply();
    try { await interaction.editReply({ embeds: [buildEmbed(interaction.user.id, await analyze(saved.url))] }); }
    catch (error) { console.error('[BloxScanner] slash scan failed:', error); await interaction.editReply('❌ Deep scan failed.'); }
  },
};

export function registerBloxScannerEvents(client: Client) {
  if ((client as any)[SCAN_KEY]) return;
  (client as any)[SCAN_KEY] = true;
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild) return;
      const channel = loadGuild(message.guild.id).config.bloxScannerChannelId;
      if (!channel || channel !== message.channelId) return;
      const attachment = message.attachments.find(isImage);
      if (attachment) {
        if (!(await claimMessageEvent(`bloxscanner:image:${message.id}`))) return;
        saveScreenshot(message, attachment);
        await scan(message, attachment.url);
        return;
      }
      if (isSs(message.content)) {
        if (!(await claimMessageEvent(`bloxscanner:ss:${message.id}`))) return;
        const saved = latest(message.guild.id, message.author.id);
        if (!saved) { await message.reply('❌ Upload a trade screenshot first.'); return; }
        await scan(message, saved.url);
      }
    } catch (error) { console.error('[BloxScanner] message handler failed:', error); }
  });
}
