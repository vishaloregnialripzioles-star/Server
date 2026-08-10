import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';

const PAGE_SIZE = 8;
type ShopPage = 'roles' | 'colours';

function shopEmbed(interaction: ChatInputCommandInteraction, page: ShopPage, selected = 0): EmbedBuilder {
  const data = loadGuild(interaction.guild!.id);
  const items = page === 'roles' ? data.shop.roles : data.shop.colours;
  const title = page === 'roles' ? '🛍️ Server Shop — Roles' : '🎨 Server Shop — Colours';
  const description = page === 'roles'
    ? 'Spend your **⚡ sparks** to unlock server roles. Select an item below to purchase it.'
    : 'Spend your **⚡ sparks** to unlock a configured colour role. Buying a colour replaces your previous shop colour.';
  const start = Math.floor(selected / PAGE_SIZE) * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);
  const lines = visible.length
    ? visible.map((item, i) => `**${start + i + 1}. ${item.name}** — ⚡ **${item.price.toLocaleString()} sparks**`).join('\n')
    : 'No items have been configured yet.';

  return new EmbedBuilder()
    .setColor(page === 'roles' ? 0x5865F2 : 0xF47FFF)
    .setTitle(title)
    .setDescription(`${description}\n\n${lines}`)
    .addFields({ name: 'Your balance', value: `⚡ **${(data.sparks[interaction.user.id] ?? 0).toLocaleString()} sparks**`, inline: true })
    .setFooter({ text: `Page ${Math.floor(start / PAGE_SIZE) + 1} · ${items.length} item(s)` });
}

function shopComponents(items: Array<{ name: string; id: string; price: number }>, page: ShopPage, selected = 0): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  const start = Math.floor(selected / PAGE_SIZE) * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);

  if (visible.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shop:buy:${page}`)
      .setPlaceholder(page === 'roles' ? 'Choose a role to buy' : 'Choose a colour to buy')
      .addOptions(visible.map(item => ({ label: item.name.slice(0, 100), description: `⚡ ${item.price.toLocaleString()} sparks`, value: item.id })));
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const nav = new ActionRowBuilder<ButtonBuilder>();
  nav.addComponents(
    new ButtonBuilder().setCustomId('shop:prev').setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(start === 0),
    new ButtonBuilder().setCustomId('shop:roles').setLabel('👑 Roles').setStyle(page === 'roles' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:colours').setLabel('🎨 Colours').setStyle(page === 'colours' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(start + PAGE_SIZE >= items.length),
  );
  rows.push(nav);
  return rows;
}

function componentsFor(interaction: ChatInputCommandInteraction, page: ShopPage, selected: number) {
  const data = loadGuild(interaction.guild!.id);
  const items = page === 'roles' ? data.shop.roles : data.shop.colours;
  return shopComponents(items, page, selected);
}

function parseHex(value: string): number | null {
  const raw = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return Number.parseInt(raw, 16);
}

export const shop: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Open the ⚡ sparks server shop'),

  async execute(interaction) {
    if (!interaction.guild) return;
    let page: ShopPage = 'roles';
    let selected = 0;
    const message = await interaction.reply({ fetchReply: true, embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) });
    const collector = message.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: 'This shop menu belongs to the person who opened it.', ephemeral: true });
        return;
      }
      const parts = i.customId.split(':');
      if (i.customId === 'shop:roles' || i.customId === 'shop:colours') {
        page = i.customId.endsWith('roles') ? 'roles' : 'colours';
        selected = 0;
        await i.update({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) });
        return;
      }
      if (i.customId === 'shop:prev' || i.customId === 'shop:next') {
        const data = loadGuild(interaction.guild!.id);
        const items = page === 'roles' ? data.shop.roles : data.shop.colours;
        selected = i.customId.endsWith('next') ? Math.min(selected + PAGE_SIZE, Math.max(0, items.length - 1)) : Math.max(0, selected - PAGE_SIZE);
        await i.update({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) });
        return;
      }
      if (parts[0] === 'shop' && parts[1] === 'buy') {
        const itemId = i.isStringSelectMenu() ? i.values[0] : '';
        if (!itemId) { await i.reply({ content: 'Please choose an item.', ephemeral: true }); return; }
        const data = loadGuild(interaction.guild!.id);
        const items = page === 'roles' ? data.shop.roles : data.shop.colours;
        const item = items.find(x => x.id === itemId);
        if (!item) { await i.reply({ content: 'That shop item no longer exists.', ephemeral: true }); return; }
        const balance = data.sparks[interaction.user.id] ?? 0;
        if (balance < item.price) { await i.reply({ content: `❌ You need **⚡ ${item.price.toLocaleString()} sparks** but only have **⚡ ${balance.toLocaleString()}**.`, ephemeral: true }); return; }
        const role = await interaction.guild.roles.fetch(item.roleId).catch(() => null);
        if (!role) { await i.reply({ content: '❌ The shop role no longer exists. Ask the server owner to remove/reconfigure it.', ephemeral: true }); return; }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (page === 'roles' && member.roles.cache.has(role.id)) { await i.reply({ content: 'You already own this role.', ephemeral: true }); return; }
        if (page === 'colours') {
          for (const colour of data.shop.colours) {
            if (colour.roleId !== role.id) {
              const old = await interaction.guild.roles.fetch(colour.roleId).catch(() => null);
              if (old && member.roles.cache.has(old.id)) await member.roles.remove(old).catch(() => {});
            }
          }
        }
        try {
          await member.roles.add(role);
          updateGuild(interaction.guild!.id, d => { d.sparks[interaction.user.id] = (d.sparks[interaction.user.id] ?? 0) - item.price; });
          await i.reply({ content: `✅ Purchased **${item.name}** for **⚡ ${item.price.toLocaleString()} sparks**.`, ephemeral: true });
          await message.edit({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) }).catch(() => {});
        } catch {
          await i.reply({ content: '❌ I could not give you that role. Make sure my bot role is above the shop role and I have **Manage Roles**.', ephemeral: true });
        }
      }
    });
    collector.once('end', async () => { await message.edit({ components: [] }).catch(() => {}); });
  },
};

export function addColourSetup(subcommand: any) {
  return subcommand
    .addStringOption((o: any) => o.setName('colour').setDescription('Hex colour, e.g. #FF0000').setRequired(true))
    .addIntegerOption((o: any) => o.setName('coins').setDescription('⚡ sparks price').setRequired(true).setMinValue(0));
}

export async function setupShopRole(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) { await interaction.reply({ content: '❌ Only the server owner can configure the shop.', ephemeral: true }); return; }
  const name = interaction.options.getString('name', true);
  const position = interaction.options.getInteger('position', true);
  const price = interaction.options.getInteger('coins', true);
  await interaction.deferReply({ ephemeral: true });
  try {
    const role = await interaction.guild.roles.create({ name, reason: 'Sparks shop role' });
    const maxPosition = Math.max(1, interaction.guild.members.me?.roles.highest.position ?? 1);
    await role.setPosition(Math.min(position, Math.max(1, maxPosition - 1))).catch(() => {});
    updateGuild(interaction.guild.id, d => { d.shop.roles.push({ id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, roleId: role.id, position, price }); d.shop.roles.sort((a,b) => a.position - b.position); });
    await interaction.editReply(`✅ Added **${name}** to the shop for **⚡ ${price.toLocaleString()} sparks**.`);
  } catch { await interaction.editReply('❌ I could not create the role. Give the bot **Manage Roles** and place its bot role above the shop roles.'); }
}

export async function setupShopColour(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) { await interaction.reply({ content: '❌ Only the server owner can configure the shop.', ephemeral: true }); return; }
  const colourText = interaction.options.getString('colour', true);
  const price = interaction.options.getInteger('coins', true);
  const colour = parseHex(colourText);
  if (colour === null) { await interaction.reply({ content: '❌ Invalid colour. Use a 6-digit hex value such as `#FF0000`.', ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  try {
    const role = await interaction.guild.roles.create({ name: `Colour ${colourText.startsWith('#') ? colourText : `#${colourText}`}`, color: colour, reason: 'Sparks shop colour' });
    const position = Math.max(1, (interaction.guild.members.me?.roles.highest.position ?? 1) - 1);
    await role.setPosition(position).catch(() => {});
    updateGuild(interaction.guild.id, d => { d.shop.colours.push({ id: `colour-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `🎨 ${colourText.toUpperCase()}`, roleId: role.id, price }); });
    await interaction.editReply(`✅ Added **${role.name}** to the shop for **⚡ ${price.toLocaleString()} sparks**.`);
  } catch { await interaction.editReply('❌ I could not create the colour role. Give the bot **Manage Roles** and place its bot role above the shop roles.'); }
}
