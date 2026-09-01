import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Client,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { removeGlobalAfk, setGlobalAfk } from '../globalAfk.js';

type AfkMode = 'server' | 'global';
const BUTTON_PREFIX = 'afk_scope:';
const pendingReasons = new Map<string, string>();
const listenerClients = new WeakSet<Client>();

function pingRows(pings: Array<{ messageUrl: string }>) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(pings.length, 25); i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let j = i; j < Math.min(i + 5, pings.length, 25); j++) {
      row.addComponents(new ButtonBuilder().setLabel(`Jump #${j + 1}`).setStyle(ButtonStyle.Link).setURL(pings[j].messageUrl));
    }
    rows.push(row);
  }
  return rows;
}

async function finishAfk(button: ButtonInteraction): Promise<void> {
  const parts = button.customId.split(':');
  const mode = parts[1] as AfkMode;
  const userId = parts[2];
  if (!button.guild || !userId || button.user.id !== userId || (mode !== 'server' && mode !== 'global')) return;

  const key = `${button.guild.id}:${userId}`;
  const reason = pendingReasons.get(key) ?? 'AFK';
  pendingReasons.delete(key);

  if (mode === 'global') {
    await setGlobalAfk(userId, reason);
    updateGuild(button.guild.id, d => { delete d.afk[userId]; });
  } else {
    updateGuild(button.guild.id, d => { d.afk[userId] = { reason, timestamp: Date.now() }; });
  }

  const member = await button.guild.members.fetch(userId).catch(() => null);
  if (member?.manageable) {
    const name = member.nickname ?? member.user.username;
    if (!name.startsWith('[AFK] ')) await member.setNickname(`[AFK] ${name}`.slice(0, 32)).catch(() => undefined);
  }

  await button.update({
    embeds: [new EmbedBuilder().setColor(mode === 'global' ? 0x57F287 : 0x5865F2).setTitle(mode === 'global' ? '🌐 Global AFK Enabled' : '🏠 Server AFK Enabled').setDescription(`You're now **${mode === 'global' ? 'globally' : 'server'} AFK**.\n**Reason:** ${reason}\n\nI'll notify people when they mention you.`).setTimestamp()],
    components: [],
  });
}

function registerButtonListener(client: Client): void {
  if (listenerClients.has(client)) return;
  listenerClients.add(client);
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith(BUTTON_PREFIX)) return;
    try { await finishAfk(interaction); }
    catch (error) {
      console.error('[AFK button]', error);
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong while setting your AFK status.', ephemeral: true }).catch(() => undefined);
    }
  });
}

export const afk: Command = {
  data: new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status').addStringOption(o => o.setName('reason').setDescription('AFK reason (default: AFK)')),
  async execute(interaction) {
    if (!interaction.guild || !interaction.member) return;
    registerButtonListener(interaction.client);
    const reason = interaction.options.getString('reason') ?? 'AFK';
    const uid = interaction.user.id;
    pendingReasons.set(`${interaction.guild.id}:${uid}`, reason);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}server:${uid}`).setLabel('Server AFK').setEmoji('🏠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}global:${uid}`).setLabel('Global AFK').setEmoji('🌐').setStyle(ButtonStyle.Success),
    );

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('💤 Choose your AFK scope').setDescription(`**Reason:** ${reason}\n\n🏠 **Server AFK** — only this server will see your AFK status.\n🌐 **Global AFK** — every server where Sparxie is present will see it.`).setFooter({ text: 'Choose one option below • expires in 60 seconds' })],
      components: [row],
    });
  },
};

export function buildAfkReturnPayload(pings: Array<{ messageUrl: string; authorName: string }>) {
  const count = pings.length;
  const description = count
    ? `You were pinged **${count} time${count === 1 ? '' : 's'}** while AFK.\n\n${pings.slice(0, 25).map((p, i) => `**${i + 1}.** ${p.authorName} — [Click to jump](${p.messageUrl})`).join('\n')}`
    : 'You were not pinged while AFK.';
  return {
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('👋 Welcome back!').setDescription(description).setFooter({ text: count > 25 ? 'Showing the first 25 pings.' : 'AFK status removed.' }).setTimestamp()],
    components: pingRows(pings),
  };
}
