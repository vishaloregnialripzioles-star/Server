import { EmbedBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { findBloxValue } from './bloxvalue.js';

function parseAmount(value: string): number | null {
  const m = value.trim().toUpperCase().replace(/,/g, '').match(/^([0-9]+(?:\.[0-9]+)?)([KMBT])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return n * mult;
}

function money(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2).replace(/\.00$/, '')}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(v).toLocaleString('en-US');
}

type Parsed = { name: string; qty: number; value: number };

function parseOffer(raw: string): { items: Parsed[]; unknown: string[] } {
  const items: Parsed[] = [];
  const unknown: string[] = [];
  for (const chunk of raw.split(/[,\n+]+/).map(x => x.trim()).filter(Boolean)) {
    const match = chunk.match(/^(?:(\d+)\s*[x×*]\s*)?(.+?)$/i);
    const qty = Math.max(1, Math.min(50, Number(match?.[1] ?? 1)));
    const name = (match?.[2] ?? chunk).trim();
    const entry = findBloxValue(name);
    if (!entry) { unknown.push(name); continue; }
    const value = parseAmount(entry.regular);
    if (value == null) { unknown.push(name); continue; }
    items.push({ name: entry.name, qty, value: value * qty });
  }
  return { items, unknown };
}

function buildResult(userId: string, yourRaw: string, oppositeRaw: string): EmbedBuilder {
  const your = parseOffer(yourRaw);
  const opposite = parseOffer(oppositeRaw);
  const yourTotal = your.items.reduce((s, x) => s + x.value, 0);
  const oppositeTotal = opposite.items.reduce((s, x) => s + x.value, 0);
  const difference = oppositeTotal - yourTotal;
  const ratio = yourTotal === 0 ? 0 : oppositeTotal / yourTotal;
  let verdict: 'W' | 'FAIR' | 'L' = 'FAIR';
  if (yourTotal === 0 && oppositeTotal > 0) verdict = 'L';
  else if (oppositeTotal === 0 && yourTotal > 0) verdict = 'W';
  else if (ratio >= 1.10) verdict = 'W';
  else if (ratio <= 0.90) verdict = 'L';

  const lines = (items: Parsed[]) => items.length
    ? items.map(x => `• ${x.qty > 1 ? `${x.qty}x ` : ''}${x.name} — **${money(x.value)}**`).join('\n')
    : 'None';

  const embed = new EmbedBuilder()
    .setTitle(`⚖️ Trade Calculator — ${verdict}`)
    .setColor(verdict === 'W' ? 0x2ecc71 : verdict === 'L' ? 0xe74c3c : 0xf1c40f)
    .setDescription(`**<@${userId}>** — values are calculated from Sparxie's current Blox value list.\n**10% range = FAIR**; outside it is W/L.`)
    .addFields(
      { name: '👈 Your Offer', value: `${lines(your.items)}\n\n**Total: ${money(yourTotal)}**` .slice(0, 1024) },
      { name: '👉 Opposite Offer', value: `${lines(opposite.items)}\n\n**Total: ${money(oppositeTotal)}**`.slice(0, 1024) },
      { name: '📊 Result', value: `# **${verdict}**\nYou give: **${money(yourTotal)}**\nYou receive: **${money(oppositeTotal)}**\nDifference: **${difference >= 0 ? '+' : ''}${money(difference)}**\nRatio: **${yourTotal ? `${(ratio * 100).toFixed(1)}%` : 'N/A'}**` },
    )
    .setFooter({ text: 'Blox Fruits Trade Calculator' })
    .setTimestamp();

  const unknown = [...your.unknown, ...opposite.unknown];
  if (unknown.length) embed.addFields({ name: '⚠️ Not Recognized', value: [...new Set(unknown)].map(x => `• ${x}`).join('\n').slice(0, 1024) });
  return embed;
}

export const trade: Command = {
  data: new SlashCommandBuilder().setName('trade').setDescription('Calculate a Blox Fruits trade as W, FAIR or L'),
  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId(`tradecalc:${interaction.user.id}:${Date.now()}`).setTitle('Blox Fruits Trade Calculator');
    const your = new TextInputBuilder().setCustomId('your_offer').setLabel('Your offer').setPlaceholder('Kitsune, Control').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
    const opposite = new TextInputBuilder().setCustomId('opposite_offer').setLabel('Opposite offer').setPlaceholder('Control, Dragon').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(your), new ActionRowBuilder<TextInputBuilder>().addComponents(opposite));
    await interaction.showModal(modal);
  },
};

export async function handleTradeModal(interaction: any) {
  if (!interaction.isModalSubmit?.() || !String(interaction.customId).startsWith('tradecalc:')) return false;
  const ownerId = String(interaction.customId).split(':')[1];
  if (ownerId !== interaction.user.id) return false;
  const your = interaction.fields.getTextInputValue('your_offer');
  const opposite = interaction.fields.getTextInputValue('opposite_offer');
  await interaction.reply({ embeds: [buildResult(interaction.user.id, your, opposite)] });
  return true;
}
