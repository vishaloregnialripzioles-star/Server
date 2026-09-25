import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction, type Interaction
} from 'discord.js';
import type { SavedEmbed } from './types.js';
import { buildEmbedPreview } from './welcomeUtils.js';
import { loadGuild, updateGuild } from './storage.js';

type Session={guildId:string;userId:string;name:string;draft:SavedEmbed};
const sessions=new Map<string,Session>();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const makeId=()=>Math.random().toString(36).slice(2,10);

export function createEmbedEditorSession(i:ChatInputCommandInteraction,name:string){
  const saved=loadGuild(i.guildId!).savedEmbeds?.[name];
  if(!saved)throw new Error('Embed not found');
  const id=makeId();
  sessions.set(id,{guildId:i.guildId!,userId:i.user.id,name,draft:clone(saved)});
  return id;
}
export function buildEmbedEditorSelection(guildId:string,page=0){
  const names=Object.keys(loadGuild(guildId).savedEmbeds??{}).sort((a,b)=>a.localeCompare(b));
  const totalPages=Math.max(1,Math.ceil(names.length/25));
  const current=Math.min(Math.max(page,0),totalPages-1);
  const pageNames=names.slice(current*25,current*25+25);
  const rows: any[]=[];
  if(pageNames.length){
    const select=new StringSelectMenuBuilder().setCustomId('embededit:select:'+current).setPlaceholder('Select an embed/command to edit');
    select.addOptions(pageNames.map(n=>({label:n.slice(0,100),value:n,description:'Edit '+n})));
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  if(totalPages>1){
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embededit:page:'+(current-1)).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current===0),
      new ButtonBuilder().setCustomId('embededit:page:'+(current+1)).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current>=totalPages-1),
    ));
  }
  return {content:names.length?'🛠️ **Embed Editor**\\nSelect the embed/command you want to edit.\\n📄 Page '+(current+1)+'/'+totalPages+' • '+names.length+' saved embeds':'📭 No saved embeds yet. Use \`/embed-create\` first.',embeds:[],components:rows};
}
function components(id:string,d:SavedEmbed){
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embededit:'+id+':basic').setLabel('Basic').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('embededit:'+id+':author').setLabel('Author').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embededit:'+id+':media').setLabel('Media').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embededit:'+id+':footer').setLabel('Footer').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embededit:'+id+':fields').setLabel('Fields ('+(d.fields?.length??0)+')').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embededit:'+id+':removefield').setLabel('Remove field').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('embededit:'+id+':done').setLabel('Done / Save').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('embededit:'+id+':cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    )
  ];
}
async function render(i:Interaction,id:string){
  const s=sessions.get(id);
  if(!s){if(i.isRepliable())await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true});return;}
  if(i.guildId!==s.guildId||i.user.id!==s.userId){if(i.isRepliable())await i.reply({content:'❌ This editor belongs to another user.',ephemeral:true});return;}
  try{
    const payload={
      content:'🛠️ **Editing: '+s.name+'**\\nChanges are staged. Click **Done / Save** to make them permanent.\\n\\nCustom emojis are supported in text fields.',
      embeds:[buildEmbedPreview(s.draft)],components:components(id,s.draft)
    };
    if(i.isButton()||i.isStringSelectMenu())await i.update(payload);
    else if(i.isRepliable())await i.editReply(payload);
  }catch(error){
    console.error('[EmbedEditor] Render failed:',error);
    const message='❌ I could not render this embed. One of its saved values (usually an image/icon URL) is invalid. Your saved data was not changed.';
    if(i.isButton()||i.isStringSelectMenu())await i.reply({content:message,ephemeral:true}).catch(()=>undefined);
    else if(i.isRepliable())await i.editReply({content:message,embeds:[],components:[]}).catch(()=>undefined);
  }
}
function input(id:string,label:string,value:string|undefined,style=TextInputStyle.Short,required=false,max=4000){
  return new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0,45)).setStyle(style).setRequired(required).setMaxLength(max).setValue((value??'').slice(0,max)));
}
function makeModal(s:Session,section:string){
  const m=new ModalBuilder().setCustomId('embededit:modal:'+section).setTitle((section[0].toUpperCase()+section.slice(1)+' - '+s.name).slice(0,45));
  const d=s.draft;
  if(section==='basic')m.addComponents(input('title','Title',d.title),input('description','Description',d.description,TextInputStyle.Paragraph,false,4000),input('color','Hex color',d.color===undefined?'':'#'+d.color.toString(16).padStart(6,'0')),input('timestamp','Timestamp on/off',d.timestamp===false?'off':'on'));
  if(section==='author')m.addComponents(input('author','Author name',d.authorName),input('author_icon','Author icon URL',d.authorIconUrl));
  if(section==='media')m.addComponents(input('thumbnail','Thumbnail URL',d.thumbnailUrl),input('image','Image URL',d.imageUrl));
  if(section==='footer')m.addComponents(input('footer','Footer text',d.footerText,TextInputStyle.Paragraph,false,2048),input('footer_icon','Footer icon URL',d.footerIconUrl));
  if(section==='fields')m.addComponents(input('index','Field number, blank to add','',TextInputStyle.Short,false,3),input('field_name','Field name','',TextInputStyle.Short,false,256),input('field_value','Field value','',TextInputStyle.Paragraph,false,1024),input('inline','Inline on/off','off'));
  if(section==='removefield')m.addComponents(input('index','Field number to remove','',TextInputStyle.Short,true,3));
  return m;
}
async function resolveEmojiIds(text:string,i:Interaction){
  if(!text)return text;
  let out=text;
  for(const match of text.matchAll(/(\d{17,20})/g)){
    const id=match[1];
    try{const e=await i.client.application.emojis.fetch(id);if(e)out=out.replaceAll(id,'<'+(e.animated?'a':'')+':'+e.name+':'+e.id+'>');}catch{}
  }
  return out;
}
async function normalize(s:SavedEmbed,i:Interaction){
  const keys=['title','description','authorName','authorIconUrl','thumbnailUrl','imageUrl','footerText','footerIconUrl'] as const;
  for(const k of keys)if(typeof s[k]==='string')(s as any)[k]=await resolveEmojiIds(s[k] as string,i);
  for(const f of s.fields??[]){f.name=await resolveEmojiIds(f.name,i);f.value=await resolveEmojiIds(f.value,i);}
}
export async function handleEmbedEditorInteraction(i:Interaction):Promise<boolean>{
  const customId=String((i as any).customId??'');
  if(customId.startsWith('embededit:page:')&&i.isButton()){
    if(!i.guildId){await i.reply({content:'❌ Server only.',ephemeral:true});return true;}
    const page=Number(customId.split(':')[2]);
    await i.update(buildEmbedEditorSelection(i.guildId,Number.isFinite(page)?page:0));
    return true;
  }
  const id=String((i as any).customId??'');
  if(id.startsWith('embededit:select:')&&i.isStringSelectMenu()){
    if(!i.guildId){await i.reply({content:'❌ Server only.',ephemeral:true});return true;}
    const name=i.values[0]?.toLowerCase().trim();
    if(!name||!loadGuild(i.guildId).savedEmbeds?.[name]){await i.reply({content:'❌ That embed no longer exists.',ephemeral:true});return true;}
    const sid=createEmbedEditorSession(i as any,name);await render(i,sid);return true;
  }
  if(!id.startsWith('embededit:'))return false;

  if(id.startsWith('embededit:modal:')&&i.isModalSubmit()){
    const section=id.split(':')[2];
    const entry=[...sessions.entries()].reverse().find(([,s])=>s.userId===i.user.id&&s.guildId===i.guildId);
    if(!entry){await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true});return true;}
    const [sid,s]=entry;
    if(section==='basic'){
      s.draft.title=i.fields.getTextInputValue('title').trim()||undefined;
      s.draft.description=i.fields.getTextInputValue('description').trim()||undefined;
      const c=i.fields.getTextInputValue('color').trim();
      if(c){const n=parseInt(c.replace('#',''),16);if(!Number.isInteger(n)||n<0||n>0xFFFFFF){await i.reply({content:'❌ Invalid hex color.',ephemeral:true});return true;}s.draft.color=n;}else s.draft.color=undefined;
      s.draft.timestamp=i.fields.getTextInputValue('timestamp').trim().toLowerCase()!=='off';
    }else if(section==='author'){
      s.draft.authorName=i.fields.getTextInputValue('author').trim()||undefined;s.draft.authorIconUrl=i.fields.getTextInputValue('author_icon').trim()||undefined;
    }else if(section==='media'){
      s.draft.thumbnailUrl=i.fields.getTextInputValue('thumbnail').trim()||undefined;s.draft.imageUrl=i.fields.getTextInputValue('image').trim()||undefined;
    }else if(section==='footer'){
      s.draft.footerText=i.fields.getTextInputValue('footer').trim()||undefined;s.draft.footerIconUrl=i.fields.getTextInputValue('footer_icon').trim()||undefined;
    }else if(section==='fields'){
      const raw=i.fields.getTextInputValue('index').trim(),name=i.fields.getTextInputValue('field_name').trim(),value=i.fields.getTextInputValue('field_value').trim(),inline=i.fields.getTextInputValue('inline').trim().toLowerCase()==='on';
      if(!name||!value){await i.reply({content:'❌ Field name and value are required.',ephemeral:true});return true;}
      s.draft.fields??=[];
      if(raw){const n=Number(raw)-1;if(!Number.isInteger(n)||n<0||n>=s.draft.fields.length){await i.reply({content:'❌ That field number does not exist.',ephemeral:true});return true;}s.draft.fields[n]={name,value,inline};}
      else{if(s.draft.fields.length>=25){await i.reply({content:'❌ Maximum 25 fields.',ephemeral:true});return true;}s.draft.fields.push({name,value,inline});}
    }else if(section==='removefield'){
      const n=Number(i.fields.getTextInputValue('index').trim())-1;if(!Number.isInteger(n)||n<0||n>=(s.draft.fields?.length??0)){await i.reply({content:'❌ That field number does not exist.',ephemeral:true});return true;}s.draft.fields!.splice(n,1);
    }
    await i.deferUpdate();await render(i,sid);return true;
  }

  const parts=id.split(':');const sid=parts[1],action=parts[2];const s=sessions.get(sid);
  if(!s){await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true});return true;}
  if(i.user.id!==s.userId||i.guildId!==s.guildId){await i.reply({content:'❌ This editor belongs to another user.',ephemeral:true});return true;}
  if(action==='done'&&i.isButton()){
    await normalize(s.draft,i);
    updateGuild(s.guildId,d=>{d.savedEmbeds??={};d.savedEmbeds[s.name]=clone(s.draft);});
    const saved=loadGuild(s.guildId).savedEmbeds[s.name];sessions.delete(sid);
    await i.update({content:'✅ '+s.name+' saved permanently. Any application emoji IDs were converted to Discord emoji tokens where available.',embeds:[buildEmbedPreview(saved)],components:[]});return true;
  }
  if(action==='cancel'&&i.isButton()){sessions.delete(sid);await i.update({content:'🗑️ Editor cancelled. No staged changes were saved.',embeds:[],components:[]});return true;}
  if(i.isButton()&&['basic','author','media','footer','fields','removefield'].includes(action)){await i.showModal(makeModal(s,action));return true;}
  return true;
}
