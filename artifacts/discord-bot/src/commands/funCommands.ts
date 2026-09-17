import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

const MODES = {
  cool: { emoji:'😎', title:'Cool Meter', color:0x3498DB, lines:['Certified cool. 😎','Coolness levels are off the charts.','Too cool for the normal meter.'] },
  aura: { emoji:'✨', title:'Aura Check', color:0x9B59B6, lines:['The aura is glowing.','Massive aura detected.','Aura status: legendary.'] },
  funny: { emoji:'😂', title:'Funny Check', color:0xF1C40F, lines:['Comedy energy detected.','That is dangerously funny.','The server may not recover from this one.'] },
  sad: { emoji:'🥲', title:'Sadness Check', color:0x5DADE2, lines:['A little sad energy detected.','Sending virtual good vibes.','The emotional soundtrack just started.'] },
  angry: { emoji:'😤', title:'Angry Check', color:0xE74C3C, lines:['Rage meter activated.','Someone woke up the angry mode.','Angry energy detected — breathe.'] },
  legend: { emoji:'👑', title:'Legend Check', color:0xF4D03F, lines:['Absolute legend status.','The server remembers this moment.','Legendary energy confirmed.'] },
} as const;

type Mode = keyof typeof MODES;
function command(mode:Mode):Command {
  const cfg=MODES[mode];
  return { data:new SlashCommandBuilder().setName(mode).setDescription(`Run a fun ${mode} check`).addUserOption(o=>o.setName('user').setDescription('User to check').setRequired(false)), async execute(interaction){
    const user=interaction.options.getUser('user')??interaction.user; const score=Math.floor(Math.random()*101); const line=cfg.lines[Math.floor(Math.random()*cfg.lines.length)];
    await interaction.reply({embeds:[new EmbedBuilder().setColor(cfg.color).setTitle(`${cfg.emoji} ${cfg.title}`).setDescription(`**${user}**\n\n${line}\n\n**Score:** \`${score}/100\``).setThumbnail(user.displayAvatarURL()).setFooter({text:'Sparxie • Just for fun'}).setTimestamp()]});
  }};
}
export const cool=command('cool'); export const aura=command('aura'); export const funny=command('funny'); export const sad=command('sad'); export const angry=command('angry'); export const legend=command('legend');
