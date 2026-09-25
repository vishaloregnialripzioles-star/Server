import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { buildEmbedEditorSelection, isEmbedEditorOwner } from '../embedEditor.js';

export const embedEdit:Command={
  data:new SlashCommandBuilder().setName('embed-edit').setDescription('Open the private permanent command embed editor') as any,
  async execute(i){
    if(!i.guild)return;
    if(!isEmbedEditorOwner(i.user.id)){
      await i.reply({content:'🔒 This command is private. Only the two authorized bot developers can use the embed editor.',ephemeral:true});
      return;
    }
    try{
      await i.deferReply({ephemeral:true});
      await i.editReply(buildEmbedEditorSelection(i.guild.id,i.client));
    }catch(error){
      console.error('[embed-edit] command failed:',error);
      const message='❌ Embed editor could not be opened. Check the bot logs for the exact error.';
      if(i.deferred||i.replied)await i.editReply({content:message,embeds:[],components:[]}).catch(()=>undefined);
      else await i.reply({content:message,ephemeral:true}).catch(()=>undefined);
    }
  }
};
