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

function isImageAttachment(a: Attachment): boolean {
  return Boolean(a.contentType?.startsWith('image/')) || SUPPORTED_EXT.test(a.name ?? '');
}

function isSs(content: string): boolean {
  return /^(?:\.|!)?ss$/i.test(content.trim());
}

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
  const s = raw.trim().toUpperCase().replace(/,/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

function parseDemand(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(abs >= 1e13 ? 0 : 2).replace(/\.00$/, '')}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 2).replace(/\.00$/, '')}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 2).replace(/\.00$/, '')}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return Math.round(value).toLocaleString('en-US');
}

function resolveDetectedItem(item: DetectedItem) {
  const quantity = Math.max(1, Math.min(50, Math.round(Number(item.quantity ?? 1))));
  const entry = findBloxValue(item.name);
  if (!entry) return null;

  // Unsupported item categories are never guessed or assigned a value.
  if (entry.name.toLowerCase().includes('blade') && entry.name !== 'Blade') return null;
  return { entry, quantity, permanent: Boolean(item.permanent) };
}

function itemUnitValue(entry: (typeof BLOX_VALUES)[number], permanent: boolean): number | null {
  if (permanent && entry.perm && entry.perm !== '—' && entry.perm !== 'N/A') return parseValue(entry.perm);
  if (entry.regular && entry.regular !== '—' && entry.regular !== 'N/A') return parseValue(entry.regular);
  return null;
}

function sideTotals(items: DetectedItem[]) {
  const resolved: { entry: (typeof BLOX_VALUES)[number]; quantity: number; permanent: boolean; value: number; demand: number | null }[] = [];
  const unsupported: string[] = [];
  let raw = 0;
  let demandAdjusted = 0;

  for (const item of items) {
    const r = resolveDetectedItem(item);
    if (!r) {
      unsupported.push(item.name);
      continue;
    }
    const unit = itemUnitValue(r.entry, r.permanent);
    if (unit === null) {
      unsupported.push(item.name);
      continue;
    }
    const demand = parseDemand(r.entry.demand);
    const value = unit * r.quantity;
    raw += value;
    // Demand modifies liquidity/quality without being added as a second value.
    // 1/10 = 0.676x, 10/10 = 1.00x.
    const demandMultiplier = demand === null ? 0.82 : 0.64 + (0.36 * demand / 10);
    demandAdjusted += value * demandMultiplier;
    resolved.push({ ...r, value, demand });
  }
  return { resolved, unsupported, raw, demandAdjusted };
}

function classify(left: number, right: number, leftAdjusted: number, rightAdjusted: number): { label: 'W' | 'FAIR' | 'L'; ratio: number } {
  if (left === 0 && right === 0) return { label: 'FAIR', ratio: 1 };
  if (right === 0) return { label: left > 0 ? 'L' : 'FAIR', ratio: left > 0 ? Infinity : 1 };
  if (left === 0) return { label: 'W', ratio: 0 };
  const adjustedRatio = leftAdjusted / rightAdjusted;
  if (adjustedRatio >= 0.90 && adjustedRatio <= 1.10) return { label: 'FAIR', ratio: adjustedRatio };
  // Left is always the screenshot sender. Receiving more value = W; giving more = L.
  return adjustedRatio < 1 ? { label: 'W', ratio: adjustedRatio } : { label: 'L', ratio: adjustedRatio };
}

function resultColor(label: 'W' | 'FAIR' | 'L'): number {
  if (label === 'W') return 0x2ecc71;
  if (label === 'L') return 0xe74c3c;
  return 0xf1c40f;
}

function buildScanEmbed(authorId: string, result: ScanResult, sourceMessageId: string): EmbedBuilder {
  const left = sideTotals(result.left);
  const right = sideTotals(result.right);
  const verdict = classify(left.raw, right.raw, left.demandAdjusted, right.demandAdjusted);

  const list = (side: ReturnType<typeof sideTotals>) => side.resolved.length
    ? side.resolved.map(x => `${x.quantity > 1 ? `${x.quantity}x ` : ''}${x.entry.name}${x.permanent ? ' (Perm)' : ''} — **${money(x.value)}** · ${x.demand === null ? 'N/A' : `${x.demand}/10`}`).join('\n')
    : 'None detected';

  const rawDiff = left.raw - right.raw;
  const adjustedDiff = left.demandAdjusted - right.demandAdjusted;
  const ratioText = Number.isFinite(verdict.ratio) ? `${(verdict.ratio * 100).toFixed(1)}%` : '∞';

  const embed = new EmbedBuilder()
    .setTitle(`🔎 Trade Scanner — ${verdict.label}`)
    .setColor(resultColor(verdict.label))
    .setDescription(`**<@${authorId}>** sent this screenshot. **Left = their trade**; right = the other trader.`)
    .addFields(
      { name: '👈 Left / Their Trade', value: `${list(left)}\n\n**Total Value:** ${money(left.raw)}\n**Demand-Adjusted:** ${money(left.demandAdjusted)}`.slice(0, 1024) },
      { name: '👉 Right / Other Trade', value: `${list(right)}\n\n**Total Value:** ${money(right.raw)}\n**Demand-Adjusted:** ${money(right.demandAdjusted)}`.slice(0, 1024) },
      { name: '📊 Result', value: `**${verdict.label}**\nLeft ÷ Right (demand-adjusted): **${ratioText}**\nRaw difference: **${money(rawDiff)}**\nDemand-adjusted difference: **${money(adjustedDiff)}**`, inline: false },
    )
    .setFooter({ text: `Blox Fruits W/F/L Scanner • Screenshot ${sourceMessageId}` })
    .setTimestamp();

  const unsupported = [...left.unsupported, ...right.unsupported];
  if (unsupported.length) {
    embed.addFields({
      name: '⚠️ Not Counted',
      value: [...new Set(unsupported)].slice(0, 10).map(x => `• ${x}`).join('\n').slice(0, 1024),
      inline: false,
    });
    embed.setDescription(`${embed.data.description ?? ''}\n⚠️ Some items could not be matched confidently, so I did not guess their value.`);
  }
  return embed;
}

async function getImageData(url: string): Promise<{ mime: string; data: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  const mime = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image is too large');
  return { mime, data: Buffer.from(arrayBuffer).toString('base64') };
}

function extractJson(text: string): ScanResult {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision model did not return JSON');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ScanResult>;
  const cleanSide = (value: unknown): DetectedItem[] => Array.isArray(value) ? value.map((x: any) => ({
    name: typeof x?.name === 'string' ? x.name.trim() : '',
    quantity: Number.isFinite(Number(x?.quantity)) ? Number(x.quantity) : 1,
    permanent: Boolean(x?.permanent),
    confidence: Number.isFinite(Number(x?.confidence)) ? Number(x.confidence) : undefined,
  })).filter(x => x.name) : [];
  return { left: cleanSide(parsed.left), right: cleanSide(parsed.right) };
}

async function analyzeTradeImage(imageUrl: string): Promise<ScanResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const image = await getImageData(imageUrl);
  const model = process.env.GEMINI_SCANNER_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const prompt = `You are a strict Blox Fruits trade screenshot parser. Read ONLY the actual trade window in the image. Ignore inventory slots, hotbar, player UI, background, wanted posters, chat UI, and any text outside the trade window.
The LEFT player/column is always the person who submitted the screenshot. The RIGHT player/column is the other trader.
Return JSON only, exactly: {"left":[{"name":"Kitsune","quantity":2,"permanent":false,"confidence":0.99}],"right":[]}
Rules:
- Identify every visible item currently placed inside the trade slots on each side.
- Count duplicate items using quantity.
- Preserve special/skin names when visible (for example Yellow Lightning, Green Lightning).
- Set permanent=true only when the screenshot clearly shows a permanent item.
- Never infer an item from nearby inventory or from the Beli price.
- If a slot is empty, do not include it.
- If you are not confident about an item name, return the visible text with confidence below 0.70 instead of inventing a different item.
- Do not decide W/F/L yourself; only identify trade items.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mime, data: image.data } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1200, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) throw new Error(`Gemini scanner ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini scanner returned no result');
  return extractJson(text);
}

function latestScreenshot(guildId: string, userId: string): StoredScreenshot | null {
  return loadGuild(guildId).config.bloxScannerScreenshots?.[userId] ?? null;
}

function rememberScreenshot(message: Message, attachment: Attachment): void {
  updateGuild(message.guild!.id, data => {
    data.config.bloxScannerScreenshots = data.config.bloxScannerScreenshots ?? {};
    data.config.bloxScannerScreenshots[message.author.id] = { url: attachment.url, messageId: message.id, createdAt: Date.now() };
  });
}

function canManage(message: Message): boolean {
  return Boolean(message.guild?.ownerId === message.author.id || message.member?.permissions.has(PermissionFlagsBits.ManageGuild) || message.member?.permissions.has(PermissionFlagsBits.Administrator));
}

async function scanForMessage(message: Message, imageUrl: string, sourceMessageId: string): Promise<void> {
  const scanning = await message.reply({ content: '🔎 **Scanning image...** Please wait while I read both trade sides and calculate value + demand.' });
  try {
    const result = await analyzeTradeImage(imageUrl);
    const left = sideTotals(result.left);
    const right = sideTotals(result.right);
    if (!left.resolved.length && !right.resolved.length) {
      await scanning.edit('❌ I could not confidently detect any supported trade items in that screenshot. Make sure the full trade window is visible.');
      return;
    }
    await scanning.edit({ content: '', embeds: [buildScanEmbed(message.author.id, result, sourceMessageId)] });
  } catch (error) {
    console.error('[BloxScanner] Scan failed:', error);
    const reason = error instanceof Error ? error.message : String(error);
    const text = reason.includes('GEMINI_API_KEY')
      ? '❌ Scanner is not configured yet. Set **GEMINI_API_KEY** in Render.'
      : '❌ I could not scan that image. Please send a clear screenshot with the whole trade window visible and try `ss` again.';
    await scanning.edit({ content: text }).catch(() => undefined);
  }
}

export const bloxscanner: Command = {
  data: new SlashCommandBuilder()
    .setName('bloxscanner')
    .setDescription('Enable and manage the Blox Fruits W/F/L screenshot scanner')
    .addSubcommand(s => s.setName('enable').setDescription('Enable the scanner in this channel'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the scanner'))
    .addSubcommand(s => s.setName('status').setDescription('Show the current scanner channel'))
    .addSubcommand(s => s.setName('scan').setDescription('Scan the latest trade screenshot')),
  async execute(interaction) {
    if (!interaction.guildId) { await interaction.reply({ content: '❌ This command only works in a server.', ephemeral: true }); return; }
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      const id = loadGuild(interaction.guildId).config.bloxScannerChannelId;
      await interaction.reply(id ? `🔎 Blox W/F/L scanner is **enabled** in <#${id}>.` : '🔎 Blox W/F/L scanner is **disabled**.');
      return;
    }
    const canManage = interaction.guild?.ownerId === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!canManage) { await interaction.reply({ content: '❌ You need **Manage Server** to change the scanner setting.', ephemeral: true }); return; }
    if (sub === 'enable') {
      updateGuild(interaction.guildId, data => { data.config.bloxScannerChannelId = interaction.channelId; });
      await interaction.reply(`🔎 **Blox W/F/L scanner enabled** in <#${interaction.channelId}>.\nSend the trade screenshot first, then send **ss**.`);
      return;
    }
    if (sub === 'disable') {
      updateGuild(interaction.guildId, data => { data.config.bloxScannerChannelId = undefined; });
      await interaction.reply('🔎 **Blox W/F/L scanner disabled.**');
      return;
    }
    const enabledChannel = loadGuild(interaction.guildId).config.bloxScannerChannelId;
    if (enabledChannel && enabledChannel !== interaction.channelId) {
      await interaction.reply({ content: `❌ Scanner is enabled in <#${enabledChannel}>. Use it there.`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const saved = latestScreenshot(interaction.guildId, interaction.user.id);
    if (!saved) { await interaction.editReply('❌ No saved screenshot found for you. Send the trade screenshot first, then use **ss**.'); return; }
    try {
      const result = await analyzeTradeImage(saved.url);
      await interaction.editReply({ content: '', embeds: [buildScanEmbed(interaction.user.id, result, saved.messageId)] });
    } catch (error) {
      console.error('[BloxScanner] Slash scan failed:', error);
      await interaction.editReply('❌ I could not scan that screenshot. Check **GEMINI_API_KEY** and try again.');
    }
  },
};

export function registerBloxScannerEvents(client: Client): void {
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
        if (!canManage(message)) { await message.reply('❌ You need **Manage Server** to change the Blox scanner setting.'); return; }
        const action = setup.split(/\s+/)[0] || 'status';
        if (action === 'enable') {
          updateGuild(message.guild.id, d => { d.config.bloxScannerChannelId = message.channelId; });
          await message.reply(`🔎 Scanner enabled in <#${message.channelId}>. Send a screenshot, then **ss**.`);
        } else if (action === 'disable') {
          updateGuild(message.guild.id, d => { d.config.bloxScannerChannelId = undefined; });
          await message.reply('🔎 Scanner disabled.');
        } else {
          await message.reply(`🔎 Scanner is enabled in <#${enabledChannel}>.`);
        }
        return;
      }

      const attachment = message.attachments.find(isImageAttachment);
      if (attachment) {
        if (!(await claimMessageEvent(`bloxscanner:image:${message.id}`))) return;
        rememberScreenshot(message, attachment);
        await message.reply('📸 **Trade screenshot saved.** Now send **ss** and I’ll scan the left/right trade, total the values, factor in demand, and give you **W / FAIR / L**.');
        return;
      }

      if (!isSs(message.content)) return;
      if (!(await claimMessageEvent(`bloxscanner:ss:${message.id}`))) return;
      const directAttachment = message.attachments.find(isImageAttachment);
      if (directAttachment) { await scanForMessage(message, directAttachment.url, message.id); return; }
      const saved = latestScreenshot(message.guild.id, message.author.id);
      if (!saved) { await message.reply('❌ No saved screenshot found for you. Send the trade screenshot in this scanner channel first, then send **ss**.'); return; }
      await scanForMessage(message, saved.url, saved.messageId);
    } catch (error) {
      console.error('[BloxScanner] Message handler failed:', error);
    }
  });
}
