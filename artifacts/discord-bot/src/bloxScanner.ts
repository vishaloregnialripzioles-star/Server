import type { Client, Message, Attachment } from 'discord.js';
import { EmbedBuilder, Events, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { claimMessageEvent, loadGuild, updateGuild } from './storage.js';
import { BLOX_VALUES, findBloxValue } from './commands/bloxvalue.js';

type DetectedItem = { name: string; quantity: number; permanent: boolean; confidence: number };
type ScanResult = { left: DetectedItem[]; right: DetectedItem[] };
type StoredScreenshot = { url: string; messageId: string; createdAt: number };

const REGISTERED = Symbol.for('sparxie.bloxscanner.registered');
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const isImage = (a: Attachment) => Boolean(a.contentType?.startsWith('image/')) || IMAGE_EXT.test(a.name ?? '');
const isSs = (s: string) => /^(?:\.|!)?ss$/i.test(s.trim());

function parseValue(raw?: string): number | null {
  const m = String(raw ?? '').trim().toUpperCase().replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return Number.isFinite(n) ? n * mult : null;
}
function parseDemand(raw?: string): number | null {
  const m = String(raw ?? '').match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  return m ? Math.max(0, Math.min(10, Number(m[1]))) : null;
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
function catalogForVision(): string {
  return BLOX_VALUES.map((entry: any) => `${entry.name}${Array.isArray(entry.aliases) && entry.aliases.length ? ` | aliases: ${entry.aliases.join(', ')}` : ''}`).join('\n');
}
function cleanDetected(raw: unknown): DetectedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => ({
    name: typeof x?.name === 'string' ? x.name.trim() : '',
    quantity: Number.isFinite(Number(x?.quantity)) ? Math.max(1, Math.min(50, Math.round(Number(x.quantity)))) : 1,
    permanent: Boolean(x?.permanent),
    confidence: Number.isFinite(Number(x?.confidence)) ? Math.max(0, Math.min(1, Number(x.confidence))) : 0,
  })).filter(x => x.name);
}
function parseJson(text: string): ScanResult {
  const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision returned invalid JSON');
  const data = JSON.parse(clean.slice(start, end + 1)) as any;
  return { left: cleanDetected(data.left), right: cleanDetected(data.right) };
}
async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image too large');
  return { mime: response.headers.get('content-type')?.split(';')[0] || 'image/png', data: Buffer.from(bytes).toString('base64') };
}
async function callGemini(key: string, model: string, image: { mime: string; data: string }, prompt: string): Promise<ScanResult> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mime, data: image.data } }] }], generationConfig: { temperature: 0, maxOutputTokens: 2000, responseMimeType: 'application/json' } }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as any;
  const text = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned no scan result');
  return parseJson(text);
}
async function analyze(url: string): Promise<ScanResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const image = await downloadImage(url);
  const model = process.env.GEMINI_SCANNER_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const catalog = catalogForVision();
  const firstPrompt = `You are a high-accuracy Blox Fruits trade screenshot vision/OCR engine. Study the pixels carefully. Do not guess from general game knowledge.

Find the rectangular window titled TREASURE TRADE. Read ONLY occupied item slots inside that window. LEFT side is ALWAYS the person who uploaded the screenshot; RIGHT side is ALWAYS the other trader. Ignore Roblox background, hotbar/inventory, HUD, character, player names, money labels, buttons and every object outside the trade window. The large countdown number and cursor may cover an icon or letters, so inspect the remaining visible pixels around them. The '+' slot is empty and is never an item.

For EACH occupied slot, inspect its visible title text AND icon. Match OCR to the exact canonical catalog below. Correct obvious OCR mistakes using the icon and catalog. Special/skin variants are separate entries; preserve exact names such as Yellow Lightning and Green Lightning. Never silently convert a special variant to normal Lightning. Do not confuse visually similar fruits. Count duplicate slots independently. permanent=true ONLY when a permanent version is clearly shown. Never invent an item. If genuinely unreadable, omit it. Do not identify weapons/tools/background objects. Do not calculate W/F/L.

CANONICAL CATALOG:
${catalog}

Return JSON ONLY: {"left":[{"name":"Venom","quantity":1,"permanent":false,"confidence":0.99}],"right":[{"name":"Torment Pain","quantity":1,"permanent":false,"confidence":0.99}]}. Confidence must be 0..1.`;
  const first = await callGemini(key, model, image, firstPrompt);
  const verifyPrompt = `Perform a SECOND independent pixel-level verification of this Blox Fruits trade screenshot. First scan proposal:\n${JSON.stringify(first)}\n\nLocate ONLY the TREASURE TRADE window. LEFT = screenshot sender, RIGHT = other trader. Re-check every occupied slot one by one. Read the item title and icon again. Correct OCR errors and visually similar fruit mistakes using this exact catalog. Ignore countdown overlay, background, inventory and hotbar. Preserve special variants such as Yellow Lightning and Green Lightning. Count duplicates. permanent=true only when clearly visible. Never invent or add a background item. Do not identify weapons/tools.\n\nCANONICAL CATALOG:\n${catalog}\n\nReturn JSON ONLY: {"left":[{"name":"...","quantity":1,"permanent":false,"confidence":0.99}],"right":[{"name":"...","quantity":1,"permanent":false,"confidence":0.99}]}. Do not calculate W/F/L.`;
  try {
    const verified = await callGemini(key, model, image, verifyPrompt);
    return verified.left.length || verified.right.length ? verified : first;
  } catch (error) {
    console.warn('[BloxScanner] Verification pass failed; using primary scan:', error);
    return first;
  }
}
function resolve(item: DetectedItem) {
  const entry = findBloxValue(item.name);
  if (!entry) return null;
  const quantity = Math.max(1, Math.min(50, Math.round(Number(item.quantity ?? 1))));
  const permanent = Boolean(item.permanent);
  const unit = permanent && entry.perm && entry.perm !== '—' && entry.perm !== 'N/A' ? parseValue(entry.perm) : parseValue(entry.regular);
  if (unit === null) return null;
  return { entry, quantity, permanent, unit, demand: parseDemand(entry.demand), confidence: item.confidence ?? 0 };
}
function totals(items: DetectedItem[]) {
  const resolved: any[] = []; const unknown: string[] = []; let raw = 0; let demandScore = 0; let demandSum = 0; let demandCount = 0;
  for (const item of items) {
    const r = resolve(item); if (!r) { unknown.push(item.name); continue; }
    const value = r.unit * r.quantity;
    const multiplier = r.demand == null ? 1 : 0.80 + (0.02 * r.demand);
    raw += value; demandScore += value * multiplier;
    if (r.demand != null) { demandSum += r.demand; demandCount++; }
    resolved.push({ ...r, value });
  }
  return { resolved, unknown, raw, demandScore, avgDemand: demandCount ? demandSum / demandCount : null };
}
function classify(left: ReturnType<typeof totals>, right: ReturnType<typeof totals>): { label: 'W' | 'FAIR' | 'L'; ratio: number } {
  if (left.raw === 0 && right.raw === 0) return { label: 'FAIR', ratio: 1 };
  if (right.raw === 0) return { label: left.raw > 0 ? 'L' : 'FAIR', ratio: Infinity };
  if (left.raw === 0) return { label: 'W', ratio: 0 };
  const ratio = left.demandScore / right.demandScore;
  if (ratio >= 0.90 && ratio <= 1.10) return { label: 'FAIR', ratio };
  return ratio < 1 ? { label: 'W', ratio } : { label: 'L', ratio };
}
function buildEmbed(authorId: string, result: ScanResult, sourceId: string): EmbedBuilder {
  const left = totals(result.left); const right = totals(result.right); const verdict = classify(left, right);
  const list = (side: ReturnType<typeof totals>) => side.resolved.length ? side.resolved.map(x => `${x.quantity > 1 ? `${x.quantity}x ` : ''}${x.entry.name}${x.permanent ? ' (Perm)' : ''} — **${money(x.value)}** · Demand **${x.demand == null ? 'N/A' : `${x.demand}/10`}** · ${Math.round(x.confidence * 100)}%`).join('\n') : 'None detected';
  const ratio = Number.isFinite(verdict.ratio) ? `${(verdict.ratio * 100).toFixed(1)}%` : '∞';
  const embed = new EmbedBuilder().setTitle(`🔎 Trade Scanner — ${verdict.label}`).setDescription(`**<@${authorId}>** = screenshot sender. **LEFT is always their trade.** RIGHT is the other trader.\nDeep visual scan → exact catalog match → value + demand calculation.`).setColor(verdict.label === 'W' ? 0x2ecc71 : verdict.label === 'L' ? 0xe74c3c : 0xf1c40f).addFields(
    { name: '👈 LEFT — Screenshot Sender', value: `${list(left)}\n\n**Raw value:** ${money(left.raw)}\n**Demand-adjusted:** ${money(left.demandScore)}\n**Average demand:** ${left.avgDemand == null ? 'N/A' : `${left.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
    { name: '👉 RIGHT — Other Trader', value: `${list(right)}\n\n**Raw value:** ${money(right.raw)}\n**Demand-adjusted:** ${money(right.demandScore)}\n**Average demand:** ${right.avgDemand == null ? 'N/A' : `${right.avgDemand.toFixed(1)}/10`}`.slice(0, 1024) },
    { name: '🏆 FINAL VERDICT', value: `# **${verdict.label}**\nScore ratio: **${ratio}**\nRaw difference (Left − Right): **${money(left.raw - right.raw)}**\nDemand-adjusted difference: **${money(left.demandScore - right.demandScore)}**`, inline: false },
  ).setFooter({ text: `Sparxie Blox Fruits Deep Scanner • ${sourceId}` }).setTimestamp();
  const unknown = [...left.unknown, ...right.unknown];
  if (unknown.length) embed.addFields({ name: '⚠️ Unmatched — not counted', value: [...new Set(unknown)].slice(0, 10).map(x => `• ${x}`).join('\n').slice(0, 1024) });
  return embed;
}
function latest(guildId: string, userId: string): StoredScreenshot | null { return loadGuild(guildId).config.bloxScannerScreenshots?.[userId] ?? null; }
function saveScreenshot(message: Message, attachment: Attachment) { updateGuild(message.guild!.id, data => { data.config.bloxScannerScreenshots = data.config.bloxScannerScreenshots ?? {}; data.config.bloxScannerScreenshots[message.author.id] = { url: attachment.url, messageId: message.id, createdAt: Date.now() }; }); }
async function scanMessage(message: Message, url: string, sourceId: string) {
  const status = await message.reply('🔎 **Scanning screenshot...**\nDeep-reading both trade sides, identifying every fruit/skin, matching the catalog, and checking value + demand.');
  try {
    const result = await analyze(url); const left = totals(result.left); const right = totals(result.right);
    if (!left.resolved.length && !right.resolved.length) { await status.edit('❌ I could not confidently identify any supported trade items. Please upload the complete **TREASURE TRADE** window clearly.'); return; }
    await status.edit({ content: '', embeds: [buildEmbed(message.author.id, result, sourceId)] });
  } catch (error) {
    console.error('[BloxScanner]', error);
    const reason = error instanceof Error ? error.message : String(error);
    await status.edit(reason.includes('GEMINI_API_KEY') ? '❌ **GEMINI_API_KEY is missing in Render.**' : '❌ Deep scan failed. Please upload a clear full trade screenshot again.');
  }
}
export const bloxscanner: Command = {
  data: new SlashCommandBuilder().setName('bloxscanner').setDescription('Deep-scan a Blox Fruits trade screenshot for W/F/L').addSubcommand(s => s.setName('enable').setDescription('Enable automatic screenshot scanning in this channel')).addSubcommand(s => s.setName('disable').setDescription('Disable automatic screenshot scanning')).addSubcommand(s => s.setName('status').setDescription('Show the scanner status')).addSubcommand(s => s.setName('scan').setDescription('Deep-scan your latest saved screenshot')),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply({ content: '❌ Server only.', ephemeral: true }); return; }
    const sub = interaction.options.getSubcommand(); const configured = loadGuild(interaction.guildId).config.bloxScannerChannelId;
    if (sub === 'status') { await interaction.reply(configured ? `🔎 **Blox scanner:** enabled in <#${configured}>` : '🔎 **Blox scanner:** disabled.'); return; }
    const allowed = interaction.guild?.ownerId === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (sub === 'enable' || sub === 'disable') {
      if (!allowed) { await interaction.reply({ content: '❌ Manage Server required.', ephemeral: true }); return; }
      updateGuild(interaction.guildId, d => { d.config.bloxScannerChannelId = sub === 'enable' ? interaction.channelId : undefined; });
      await interaction.reply(sub === 'enable' ? `🔎 **Deep scanner enabled in <#${interaction.channelId}>.** Upload a trade screenshot and it will scan automatically.` : '🔎 **Scanner disabled.**');
      return;
    }
    if (configured && configured !== interaction.channelId) { await interaction.reply({ content: `❌ Use the scanner in <#${configured}>.`, ephemeral: true }); return; }
    const saved = latest(interaction.guildId, interaction.user.id);
    if (!saved) { await interaction.reply({ content: '❌ No screenshot saved yet. Upload one first.', ephemeral: true }); return; }
    await interaction.deferReply();
    try { const result = await analyze(saved.url); await interaction.editReply({ embeds: [buildEmbed(interaction.user.id, result, saved.messageId)] }); }
    catch { await interaction.editReply('❌ Deep scan failed. Check GEMINI_API_KEY and try again.'); }
  },
};
export function registerBloxScannerEvents(client: Client) {
  if ((client as any)[REGISTERED]) return;
  (client as any)[REGISTERED] = true;
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guild) return;
      const enabledChannel = loadGuild(message.guild.id).config.bloxScannerChannelId;
      if (!enabledChannel || enabledChannel !== message.channelId) return;
      if (isSs(message.content)) {
        if (!(await claimMessageEvent(`bloxscanner:ss:${message.id}`))) return;
        const saved = latest(message.guild.id, message.author.id);
        if (!saved) { await message.reply('❌ Upload a trade screenshot first.'); return; }
        await scanMessage(message, saved.url, saved.messageId);
        return;
      }
      const attachment = [...message.attachments.values()].find(isImage);
      if (!attachment) return;
      if (!(await claimMessageEvent(`bloxscanner:image:${message.id}`))) return;
      saveScreenshot(message, attachment);
      await scanMessage(message, attachment.url, message.id);
    } catch (error) {
      console.error('[BloxScanner messageCreate]', error);
    }
  });
}
