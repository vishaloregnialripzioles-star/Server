import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command, ShopColourItem, ShopRoleItem } from '../types.js';
import { loadGuild, updateGuild } from '../storage.js';
import { isOwnerOrExtraOwner } from '../security.js';

const PAGE_SIZE = 8;
type ShopPage = 'roles' | 'colours';

function shopEmbed(interaction: ChatInputCommandInteraction, page: ShopPage, selected = 0): EmbedBuilder {
  const data = loadGuild(interaction.guild!.id);
  const items = page === 'roles' ? data.shop.roles : data.shop.colours;
  const title = page === 'roles' ? '🛍️ Server Shop — Roles' : '🎨 Server Shop — Colours';
  const description = page === 'roles'
    ? 'Spend your **⚡ sparks** to unlock server roles. Buying a role gives you the **exact role configured by the server owner/extra owner**.'
    : 'Spend your **⚡ sparks** on a colour, then choose one of your purchased shop roles. The bot creates a new role with the **same name and settings**, changes only its colour, gives it to you, and replaces the old version.';
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
      .addOptions(visible.map(item => ({
        label: item.name.slice(0, 100),
        description: `⚡ ${item.price.toLocaleString()} sparks`,
        value: item.id,
      })));
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

function colourTargetComponents(roles: ShopRoleItem[]): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop:colour-target')
    .setPlaceholder('Choose the shop role to colour')
    .addOptions(roles.slice(0, 25).map(item => ({
      label: item.name.slice(0, 100),
      description: 'Use this purchased shop role',
      value: item.id,
    })));
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('shop:cancel-colour').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ),
  ];
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
    let pendingColourId: string | null = null;
    const message = await interaction.reply({
      fetchReply: true,
      embeds: [shopEmbed(interaction, page, selected)],
      components: componentsFor(interaction, page, selected),
    });
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
        pendingColourId = null;
        await i.update({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) });
        return;
      }

      if (i.customId === 'shop:prev' || i.customId === 'shop:next') {
        const data = loadGuild(interaction.guild!.id);
        const items = page === 'roles' ? data.shop.roles : data.shop.colours;
        selected = i.customId.endsWith('next')
          ? Math.min(selected + PAGE_SIZE, Math.max(0, items.length - 1))
          : Math.max(0, selected - PAGE_SIZE);
        pendingColourId = null;
        await i.update({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) });
        return;
      }

      if (i.customId === 'shop:cancel-colour') {
        pendingColourId = null;
        await i.update({ embeds: [shopEmbed(interaction, 'colours', selected)], components: componentsFor(interaction, 'colours', selected) });
        return;
      }

      if (parts[0] === 'shop' && parts[1] === 'colour-target' && i.isStringSelectMenu()) return;
      if (parts[0] !== 'shop' || parts[1] !== 'buy' || !i.isStringSelectMenu()) {
        await i.deferUpdate().catch(() => undefined);
        return;
      }

      const itemId = i.values[0];
      const data = loadGuild(interaction.guild!.id);
      const items = page === 'roles' ? data.shop.roles : data.shop.colours;
      const item = items.find(x => x.id === itemId);
      if (!item) { await i.reply({ content: 'That shop item no longer exists.', ephemeral: true }); return; }

      const balance = data.sparks[interaction.user.id] ?? 0;
      if (balance < item.price) {
        await i.reply({ content: `❌ You need **⚡ ${item.price.toLocaleString()} sparks** but only have **⚡ ${balance.toLocaleString()}**.`, ephemeral: true });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (page === 'roles') {
        const shopRole = item as ShopRoleItem;
        const custom = data.shop.customRoles.find(x => x.userId === interaction.user.id && x.shopRoleId === shopRole.id);
        const alreadyOwns = member.roles.cache.has(shopRole.roleId) || !!(custom && member.roles.cache.has(custom.roleId));
        if (alreadyOwns) {
          await i.reply({ content: 'You already own this shop role.', ephemeral: true });
          return;
        }
        const role = await interaction.guild.roles.fetch(shopRole.roleId).catch(() => null);
        if (!role) {
          await i.reply({ content: '❌ The configured shop role no longer exists. Ask the owner to reconfigure it.', ephemeral: true });
          return;
        }
        if (!role.editable) {
          await i.reply({ content: '❌ I cannot manage this shop role. Move my bot role above it and give me **Manage Roles**.', ephemeral: true });
          return;
        }
        try {
          await member.roles.add(role, `Purchased from sparks shop for ${item.price} sparks`);
          updateGuild(interaction.guild!.id, d => {
            d.sparks[interaction.user.id] = (d.sparks[interaction.user.id] ?? 0) - item.price;
          });
          await i.reply({ content: `✅ Purchased **${role.name}** for **⚡ ${item.price.toLocaleString()} sparks**. The exact shop role has been added to you.`, ephemeral: true });
          await message.edit({ embeds: [shopEmbed(interaction, page, selected)], components: componentsFor(interaction, page, selected) }).catch(() => {});
        } catch {
          await i.reply({ content: '❌ I could not give you that role. Make sure my bot role is above the shop role and I have **Manage Roles**.', ephemeral: true });
        }
        return;
      }

      const colour = item as ShopColourItem;
      let colourValue = colour.color;
      if (typeof colourValue !== 'number' && colour.roleId) {
        const legacyRole = await interaction.guild.roles.fetch(colour.roleId).catch(() => null);
        colourValue = legacyRole?.color;
      }
      if (typeof colourValue !== 'number') {
        await i.reply({ content: '❌ This colour item is invalid. Ask the owner to configure it again.', ephemeral: true });
        return;
      }

      const ownedRoles: ShopRoleItem[] = [];
      for (const shopRole of data.shop.roles) {
        const custom = data.shop.customRoles.find(x => x.userId === interaction.user.id && x.shopRoleId === shopRole.id);
        if (custom) {
          const customRole = await interaction.guild.roles.fetch(custom.roleId).catch(() => null);
          if (customRole && member.roles.cache.has(customRole.id)) ownedRoles.push(shopRole);
          else if (!customRole) {
            updateGuild(interaction.guild!.id, d => {
              d.shop.customRoles = d.shop.customRoles.filter(x => x.id !== custom.id);
            });
          }
        } else if (member.roles.cache.has(shopRole.roleId)) {
          ownedRoles.push(shopRole);
        }
      }

      if (!ownedRoles.length) {
        await i.reply({ content: '❌ You need to buy at least one role from the **Roles** page before you can apply a colour.', ephemeral: true });
        return;
      }

      pendingColourId = colour.id;
      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor(colourValue)
            .setTitle('🎨 Choose a shop role')
            .setDescription(`You selected **${colour.name}** for **⚡ ${colour.price.toLocaleString()} sparks**.\n\nSelect **which purchased shop role** should receive this colour.\n\nThe bot will keep the role's **same name, permissions, position, hoist and mentionable settings**, create the coloured replacement, give it to you, and remove the previous version.`),
        ],
        components: colourTargetComponents(ownedRoles),
      });
      return;
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id || i.customId !== 'shop:colour-target' || !i.isStringSelectMenu()) return;
      const shopRoleId = i.values[0];
      const data = loadGuild(interaction.guild!.id);
      const colour = pendingColourId ? data.shop.colours.find(x => x.id === pendingColourId) : null;
      const shopRole = data.shop.roles.find(x => x.id === shopRoleId);
      if (!colour || !shopRole) {
        await i.reply({ content: '❌ That colour selection is no longer available.', ephemeral: true });
        return;
      }
      let colourValue = colour.color;
      if (typeof colourValue !== 'number' && colour.roleId) {
        const legacyRole = await interaction.guild!.roles.fetch(colour.roleId).catch(() => null);
        colourValue = legacyRole?.color;
      }
      if (typeof colourValue !== 'number') {
        await i.reply({ content: '❌ This colour item is invalid. Ask the owner to configure it again.', ephemeral: true });
        return;
      }
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      const custom = data.shop.customRoles.find(x => x.userId === interaction.user.id && x.shopRoleId === shopRole.id);
      const sourceRole = custom
        ? await interaction.guild!.roles.fetch(custom.roleId).catch(() => null)
        : await interaction.guild!.roles.fetch(shopRole.roleId).catch(() => null);
      if (!sourceRole || !member.roles.cache.has(sourceRole.id)) {
        await i.reply({ content: '❌ You no longer have that purchased shop role.', ephemeral: true });
        return;
      }
      const balance = data.sparks[interaction.user.id] ?? 0;
      if (balance < colour.price) {
        await i.reply({ content: `❌ You need **⚡ ${colour.price.toLocaleString()} sparks** but only have **⚡ ${balance.toLocaleString()}**.`, ephemeral: true });
        return;
      }
      const botHighest = interaction.guild!.members.me?.roles.highest.position ?? 1;
      if (!sourceRole.editable || botHighest <= sourceRole.position) {
        await i.reply({ content: '❌ I cannot replace that role because it is at or above my highest role. Move my bot role above the shop role.', ephemeral: true });
        return;
      }

      let replacement: Awaited<ReturnType<typeof interaction.guild.roles.create>> | null = null;
      try {
        replacement = await interaction.guild!.roles.create({
          name: sourceRole.name,
          color: colourValue,
          hoist: sourceRole.hoist,
          mentionable: sourceRole.mentionable,
          permissions: sourceRole.permissions.bitfield,
          reason: `Sparks shop colour purchase by ${interaction.user.tag}`,
        });
        const targetPosition = Math.min(sourceRole.position, Math.max(1, botHighest - 1));
        await replacement.setPosition(targetPosition).catch(() => undefined);
        await member.roles.add(replacement, 'Sparks shop colour replacement');
        await member.roles.remove(sourceRole, 'Replaced by coloured sparks shop role');
        if (custom) await sourceRole.delete('Removed previous coloured sparks shop role').catch(() => undefined);

        updateGuild(interaction.guild!.id, d => {
          d.sparks[interaction.user.id] = (d.sparks[interaction.user.id] ?? 0) - colour.price;
          d.shop.customRoles = d.shop.customRoles.filter(x => !(x.userId === interaction.user.id && x.shopRoleId === shopRole.id));
          d.shop.customRoles.push({
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: interaction.user.id,
            shopRoleId: shopRole.id,
            roleId: replacement!.id,
          });
        });

        pendingColourId = null;
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setColor(colourValue)
              .setTitle('✅ Role colour updated')
              .setDescription(`**${replacement.name}** is now **${colour.name}**.\n\n⚡ **${colour.price.toLocaleString()} sparks** spent.\n\nThe replacement role keeps the same name and role settings; only its colour was changed.`),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId('shop:roles').setLabel('👑 Back to Roles').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('shop:colours').setLabel('🎨 More Colours').setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } catch {
        if (replacement) await replacement.delete('Rollback failed sparks shop colour purchase').catch(() => undefined);
        await i.reply({ content: '❌ I could not create the coloured replacement role. Make sure I have **Manage Roles** and my bot role is above the purchased role.', ephemeral: true });
      }
    });
  },
};

export function addColourSetup(subcommand: any) {
  return subcommand
    .addStringOption((o: any) => o.setName('colour').setDescription('Hex colour, e.g. #FF0000').setRequired(true))
    .addIntegerOption((o: any) => o.setName('coins').setDescription('⚡ sparks price').setRequired(true).setMinValue(0));
}

export async function setupShopRole(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
    await interaction.reply({ content: '❌ Only the server owner or an extra owner can configure the shop.', ephemeral: true });
    return;
  }
  const name = interaction.options.getString('name', true);
  const position = interaction.options.getInteger('position', true);
  const price = interaction.options.getInteger('coins', true);
  await interaction.deferReply({ ephemeral: true });
  try {
    const role = await interaction.guild.roles.create({ name, reason: 'Sparks shop role' });
    const maxPosition = Math.max(1, interaction.guild.members.me?.roles.highest.position ?? 1);
    await role.setPosition(Math.min(position, Math.max(1, maxPosition - 1))).catch(() => {});
    updateGuild(interaction.guild.id, d => {
      d.shop.roles.push({ id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, roleId: role.id, position, price });
      d.shop.roles.sort((a, b) => a.position - b.position);
    });
    await interaction.editReply(`✅ Created the exact shop role **${name}** and added it to the shop for **⚡ ${price.toLocaleString()} sparks**.`);
  } catch {
    await interaction.editReply('❌ I could not create the role. Give the bot **Manage Roles** and place its bot role above the shop roles.');
  }
}

export async function setupShopColour(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !isOwnerOrExtraOwner(interaction.guild, interaction.user.id)) {
    await interaction.reply({ content: '❌ Only the server owner or an extra owner can configure the shop.', ephemeral: true });
    return;
  }
  const colourText = interaction.options.getString('colour', true);
  const price = interaction.options.getInteger('coins', true);
  const colour = parseHex(colourText);
  if (colour === null) {
    await interaction.reply({ content: '❌ Invalid colour. Use a 6-digit hex value such as `#FF0000`.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const displayColour = colourText.startsWith('#') ? colourText.toUpperCase() : `#${colourText.toUpperCase()}`;
    updateGuild(interaction.guild.id, d => {
      d.shop.colours.push({
        id: `colour-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: displayColour,
        color: colour,
        price,
      });
    });
    await interaction.editReply(`✅ Added colour **${displayColour}** to the shop for **⚡ ${price.toLocaleString()} sparks**. No colour-named Discord role is created; members choose a purchased shop role when they buy it.`);
  } catch {
    await interaction.editReply('❌ I could not save this colour shop item.');
  }
}
