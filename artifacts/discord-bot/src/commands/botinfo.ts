import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

function formatUptime(ms:number):string{
  let seconds=Math.floor(ms/1000);
  const days=Math.floor(seconds/86400); seconds%=86400;
  const hours=Math.floor(seconds/3600); seconds%=3600;
  const minutes=Math.floor(seconds/60); seconds%=60;
  const parts:string[]=[];
  if(days)parts.push(days+'d');
  if(hours)parts.push(hours+'h');
  if(minutes)parts.push(minutes+'m');
  if(seconds)parts.push(seconds+'s');
  return parts.join(' ')||'0s';
}

export const botinfo:Command={
  data:new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show Sparxie information, creators, stats and support'),
  async execute(interaction){
    const client=interaction.client;
    const guilds=client.guilds.cache;
    const totalMembers=guilds.reduce((total,guild)=>total+(guild.memberCount??0),0);
    const uptime=client.uptime??0;
    const latency=client.ws.ping;
    const startedAt=Math.max(0,Date.now()-uptime);
    const commandCount=client.commands.size;

    const embed=new EmbedBuilder()
      .setColor(0x0B0F19)
      .setAuthor({
        name:'SPARXIE',
        iconURL:client.user?.displayAvatarURL({size:128}),
      })
      .setTitle('Sparxie — Bot Information')
      .setDescription('A clean overview of Sparxie, its creators, live statistics and runtime.')
      .addFields(
        {
          name:'Creators',
          value:'[Vishalezz](https://discord.com/users/1504354088538869892)\n[Karanezz](https://discord.com/users/1323664778488582284)',
          inline:false,
        },
        {name:'Servers',value:guilds.size.toLocaleString(),inline:true},
        {name:'Members',value:totalMembers.toLocaleString(),inline:true},
        {name:'Commands',value:commandCount.toLocaleString(),inline:true},
        {name:'Uptime',value:`${formatUptime(uptime)}\n<t:${Math.floor(startedAt/1000)}:R>`,inline:true},
        {name:'Latency',value:latency>=0?`${latency} ms`:'Calculating',inline:true},
        {name:'Status',value:'Online',inline:true},
        {name:'Runtime',value:`Node.js ${process.version}`,inline:true},
      )
      .addFields({
        name:'Support Server',
        value:'[Join the Sparxie Support Server](https://discord.gg/UFvjK5Uy5e)',
        inline:false,
      })
      .setThumbnail(client.user?.displayAvatarURL({size:256})??'')
      .setFooter({text:'Sparxie | Vishalezz & Karanezz'})
      .setTimestamp();

    await interaction.reply({embeds:[embed]});
  },
};
