import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Command } from '../types.js';
import { updateGuild } from '../storage.js';
import { setGlobalAfk } from '../globalAfk.js';

export const afk: Command = {
  data: new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status').addStringOption(o=>o.setName('reason').setDescription('AFK reason (default: AFK)')),
  async execute(interaction) {
    if(!interaction.guild||!interaction.member)return;
    const reason=interaction.options.getString('reason')??'AFK'; const uid=interaction.user.id;
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`afk:server:${uid}`).setLabel('Server AFK').setEmoji('🏠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`afk:global:${uid}`).setLabel('Global AFK').setEmoji('🌐').setStyle(ButtonStyle.Success),
    );
    await interaction.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('💤 Choose your AFK scope').setDescription(`**Reason:** ${reason}\n\n🏠 **Server AFK** — only this server will see your AFK status.\n🌐 **Global AFK** — every server where Sparxie is present will see it.`).setFooter({text:'Choose one option below • expires in 30 seconds'})],components:[row]});
    try{
      const chosen:any=await interaction.awaitMessageComponent({time:30_000,filter:(i:any)=>i.user.id===uid&&i.customId.startsWith(`afk:`)});
      const mode=chosen.customId.split(':')[1] as 'server'|'global';
      if(mode==='global') await setGlobalAfk(uid,reason); else updateGuild(interaction.guild.id,d=>{d.afk[uid]={reason,timestamp:Date.now(),mode:'server',pings:[]};});
      const member=interaction.guild.members.cache.get(uid); if(member?.manageable){const name=member.nickname??member.user.username;if(!name.startsWith('[AFK] '))await member.setNickname(`[AFK] ${name}`.slice(0,32)).catch(()=>undefined);}
      await chosen.update({embeds:[new EmbedBuilder().setColor(mode==='global'?0x57F287:0x5865F2).setTitle(mode==='global'?'🌐 Global AFK Enabled':'🏠 Server AFK Enabled').setDescription(`You're now **${mode==='global'?'globally':'server'} AFK**.\n**Reason:** ${reason}\n\nI'll notify people when they mention you.`).setTimestamp()],components:[]});
    }catch{await interaction.editReply({components:[]}).catch(()=>undefined);}
  },
};
