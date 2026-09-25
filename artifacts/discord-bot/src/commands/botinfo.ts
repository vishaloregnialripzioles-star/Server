import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

function formatUptime(ms:number):string{
  let seconds=Math.floor(ms/1000);
  const days=Math.floor(seconds/86400); seconds%=86400;
  const hours=Math.floor(seconds/3600); seconds%=3600;
  const minutes=Math.floor(seconds/60); seconds%=60;
  return [days?days+'d':'',hours?hours+'h':'',minutes?minutes+'m':'',seconds+'s'].filter(Boolean).join(' ')||'0s';
}

export const botinfo:Command={
  data:new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show Sparxie bot information, creators, stats and support'),
  async execute(interaction){
    const client=interaction.client;
    const guilds=client.guilds.cache;
    const totalMembers=guilds.reduce((total,guild)=>total+(guild.memberCount??0),0);
    const totalChannels=guilds.reduce((total,guild)=>total+guild.channels.cache.size,0);
    const uptime=client.uptime??0;
    const latency=client.ws.ping;

    const embed=new EmbedBuilder()
      .setColor(0x12d9d3)
      .setAuthor({name:'Sparxie Bot Information',iconURL:client.user?.displayAvatarURL()})
      .setTitle('✨ Sparxie')
      .setDescription('A feature-packed Discord bot built for moderation, security, utility, tickets, games and community tools.')
      .addFields(
        {name:'👑 Creators',value:'[Vishalezz](https://discord.com/users/1504354088538869892)\n[Karanezz](https://discord.com/users/1323664778488582284)',inline:true},
        {name:'🌐 Servers',value:'**'+guilds.size.toLocaleString()+'**',inline:true},
        {name:'👥 Total Members',value:'**'+totalMembers.toLocaleString()+'**',inline:true},
        {name:'📡 Latency',value:'**'+(latency>=0?latency+'ms':'Calculating')+'**',inline:true},
        {name:'⏱️ Uptime',value:'**'+formatUptime(uptime)+'**\nStarted <t:'+Math.floor((Date.now()-uptime)/1000)+':R>',inline:true},
        {name:'💬 Channels',value:'**'+totalChannels.toLocaleString()+'**',inline:true},
        {name:'🧩 Commands',value:'**'+client.commands.size.toLocaleString()+'** loaded',inline:true},
        {name:'🟢 Status',value:'**Online**',inline:true},
        {name:'🛠️ Runtime',value:'Node.js **'+process.version+'**',inline:true},
      )
      .addFields({
        name:'💙 Support',
        value:'Need help or want to report something? [Join the Sparxie Support Server](https://discord.gg/UFvjK5Uy5e)',
        inline:false,
      })
      .setThumbnail(client.user?.displayAvatarURL({size:256})??null)
      .setFooter({text:'Sparxie • Built with ❤️ by Vishalezz & Karanezz'})
      .setTimestamp();

    await interaction.reply({embeds:[embed]});
  },
};
