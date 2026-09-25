import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction, type Interaction
} from 'discord.js';
import type { SavedEmbed } from './types.js';
import { buildEmbedPreview } from './welcomeUtils.js';
import { loadGuild, updateGuild } from './storage.js';
import { buildCurrentEditableEmbed, getEditableEmbedDefinitions, savedFromDraft } from './commandEmbedRegistry.js';

const AUTHORIZED_USERS=new Set(['1504354088538869892','1323664778488582284']);
type Session={guildId:string;userId:string;name:string;sourceKey:string;original:SavedEmbed;draft:SavedEmbed};
const sessions=new Map<string,Session>();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const makeId=()=>Math.random().toString(36).slice(2,10);

export function isEmbedEditorOwner(userId:string):boolean{return AUTHORIZED_USERS.has(userId);}

export async function createEmbedEditorSession(i:ChatInputCommandInteraction,name:string){
  const current=await buildCurrentEditableEmbed(i,name);
  if(!current)throw new Error('Embed not found');
  const id=makeId();
  sessions.set(id,{guildId:i.guildId!,userId:i.user.id,name,sourceKey:current.sourceKey,original:clone(current.original),draft:clone(current.draft)});
  return id;
}

export function buildEmbedEditorSelection(guildId:string,client:ChatInputCommandInteraction['client'],page=0){
  const saved=loadGuild(guildId).savedEmbeds??{};
  const definitions=getEditableEmbedDefinitions(client);
  const savedNames=Object.keys(saved).filter(name=>name.toLowerCase()!=='welcome'&&saved[name]?.sourceKey!=='welcome');
  const names=[...new Set([...definitions.map(x=>x.name),...savedNames])].sort((a,b)=>a.localeCompare(b));
  const totalPages=Math.max(1,Math.ceil(names.length/25));
  const current=Math.min(Math.max(page,0),totalPages-1);
  const pageNames=names.slice(current*25,current*25+25);
  const rows:any[]=[];
  if(pageNames.length){
    const select=new StringSelectMenuBuilder().setCustomId('embededit:select:'+current).setPlaceholder('Select an embed/command to edit');
    select.addOptions(pageNames.map(n=>({label:n.slice(0,100),value:n,description:(definitions.find(x=>x.name===n)?.description??'Saved command embed').slice(0,100)})));
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  if(totalPages>1){
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embededit:page:'+(current-1)).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current===0),
      new ButtonBuilder().setCustomId('embededit:page:'+(current+1)).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current>=totalPages-1)
    ));
  }
  return {content:'🛠️ **Sparxie Embed Editor**\nSelect an existing command embed below.\n📄 Page '+(current+1)+'/'+totalPages+' • '+names.length+' embed'+(names.length===1?'':'s'),embeds:[],components:rows};
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
      new ButtonBuilder().setCustomId('embededit:'+id+':emojis').setLabel('Emojis').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embededit:'+id+':done').setLabel('Submit / Save').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('embededit:'+id+':cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    )
  ];
}

function memberVisibleText(d:SavedEmbed):string{
  const lines:string[]=[];
  if(d.authorName)lines.push(d.authorName);
  if(d.title)lines.push(d.title);
  if(d.description)lines.push(d.description);
  for(const [index,f] of (d.fields??[]).entries())lines.push('[Field '+(index+1)+'] '+f.name+'\n'+f.value);
  if(d.footerText)lines.push(d.footerText);
  return lines.join('\n\n')||'— No visible embed text —';
}

function details(d:SavedEmbed):string{
  const visible=memberVisibleText(d).replace(new RegExp(String.fromCharCode(96),'g'),'ˋ');
  const clipped=visible.length>1200?visible.slice(0,1200)+'…':visible;
  const lines:string[]=[];
  lines.push('**Member-visible text:**');
  lines.push(String.fromCharCode(96).repeat(3)+'text\n'+clipped+'\n'+String.fromCharCode(96).repeat(3));
  lines.push('**Media:** '+([d.thumbnailUrl?'thumbnail':'',d.imageUrl?'image':''].filter(Boolean).join(' + ')||'—'));
  lines.push('**Fields:** '+(d.fields?.length??0)+'/25');
  lines.push('**Timestamp:** '+(d.timestamp===false?'Off':'On'));
  return lines.join('\n');
}

function makeEmojiTextValue(value:string|undefined):string{
  return value??'';
}

function makeEmojiModal(s:Session){
  const m=new ModalBuilder()
    .setCustomId('embededit:modal:emojis:'+s.name)
    .setTitle(('Text & Emojis • '+s.name).slice(0,45));
  m.addComponents(
    input('title','Title',makeEmojiTextValue(s.draft.title),TextInputStyle.Paragraph,false,256),
    input('description','Description',makeEmojiTextValue(s.draft.description),TextInputStyle.Paragraph,false,4000)
  );
  return m;
}

async function replaceEmojiIdsInText(i:Interaction,text:string):Promise<string>{
  let out=text;
  const ids=[...new Set([...text.matchAll(/(?<!\\d)(\\d{17,20})(?!\\d)/g)].map(m=>m[1]))];
  for(const id of ids){
    const token=await emojiMarkup(i,id);
    if(token)out=out.split(id).join(token);
  }
  return out;
}


async function normalize(s:SavedEmbed,i:Interaction){
  for(const field of allTextFields(s)){
    const value=field.get();if(!value)continue;
    field.set(await replaceEmojiIdsInText(i,value));
  }
}

function input(id:string,label:string,value:string,style:TextInputStyle,required=false,maxLength=4000){
  return new TextInputBuilder().setCustomId(id).setLabel(label.slice(0,45)).setStyle(style).setRequired(required).setMaxLength(maxLength).setValue(value.slice(0,maxLength));
}

function makeModal(s:Session,section:string):ModalBuilder{
  const m=new ModalBuilder().setCustomId('embededit:modal:'+section+':'+s.name).setTitle((section.charAt(0).toUpperCase()+section.slice(1)+' • '+s.name).slice(0,45));
  if(section==='basic'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('title','Title',s.draft.title??'',TextInputStyle.Short,false,256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('description','Description',s.draft.description??'',TextInputStyle.Paragraph,false,4000)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('color','Color (#hex)',''+(s.draft.color!==undefined?'#'+s.draft.color.toString(16).padStart(6,'0'):''),TextInputStyle.Short,false,7)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('timestamp','Timestamp (on/off)',s.draft.timestamp===false?'off':'on',TextInputStyle.Short,false,3)),
    );
  }else if(section==='author'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('author','Author name',s.draft.authorName??'',TextInputStyle.Short,false,256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('author_icon','Author icon URL',s.draft.authorIconUrl??'',TextInputStyle.Short,false,1000)),
    );
  }else if(section==='media'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('thumbnail','Thumbnail URL',s.draft.thumbnailUrl??'',TextInputStyle.Short,false,1000)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('image','Image URL',s.draft.imageUrl??'',TextInputStyle.Short,false,1000)),
    );
  }else if(section==='footer'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('footer','Footer text',s.draft.footerText??'',TextInputStyle.Short,false,2048)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('footer_icon','Footer icon URL',s.draft.footerIconUrl??'',TextInputStyle.Short,false,1000)),
    );
  }else if(section==='fields'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('index','Field number (blank = add)','',TextInputStyle.Short,false,3)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('field_name','Field name','',TextInputStyle.Short,true,256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('field_value','Field value','',TextInputStyle.Paragraph,true,1024)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('inline','Inline? on/off','off',TextInputStyle.Short,false,3)),
    );
  }else if(section==='emojis'){
    m.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('title','Title — put emoji ID/token exactly where wanted',makeEmojiTextValue(s.draft.title),TextInputStyle.Paragraph,false,256)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(input('description','Description — put emoji ID/token exactly where wanted',makeEmojiTextValue(s.draft.description),TextInputStyle.Paragraph,false,4000)),
    );
  }
  return m;
}

function allTextFields(s:SavedEmbed){
  const fields:{get:()=>string|undefined;set:(v:string|undefined)=>void}[]=[
    {get:()=>s.title,set:v=>{s.title=v}},
    {get:()=>s.description,set:v=>{s.description=v}},
    {get:()=>s.authorName,set:v=>{s.authorName=v}},
    {get:()=>s.footerText,set:v=>{s.footerText=v}},
  ];
  for(const f of s.fields??[])fields.push({get:()=>f.name,set:v=>{f.name=v??''}},{get:()=>f.value,set:v=>{f.value=v??''}});
  return fields;
}

function renderPayload(s:Session){
  const embed=buildEmbedPreview(s.draft);
  return {
    content:'🛠️ **Sparxie Embed Editor — '+s.name+'**\\n\\n'+details(s.draft)+'\\n\\nUse the buttons below to edit the embed. Emoji IDs/tokens can be placed directly inside **Title** or **Description**. Save to make changes permanent.',
    embeds:[embed],
    components:components([...sessions.entries()].find(([,x])=>x===s)?.[0]??'',s.draft),
  };
}

async function render(i:Interaction,sid:string){
  const s=sessions.get(sid);
  if(!s)throw new Error('Editor session expired.');
  if(i.isRepliable()){
    if(i.deferred||i.replied)await i.editReply(renderPayload(s));
    else await i.reply({...renderPayload(s),ephemeral:true});
  }
}

export async function handleEmbedEditorInteraction(i:Interaction):Promise<boolean>{
  if(!i.guildId)return false;
  const customId=String((i as any).customId??'');
  if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&!isEmbedEditorOwner(i.user.id)){if(customId.startsWith('embededit:')&&i.isRepliable())await i.reply({content:'🔒 This embed editor is private to the two authorized users.',ephemeral:true}).catch(()=>undefined);return customId.startsWith('embededit:');}
  if(customId.startsWith('embededit:page:')&&i.isButton()){const page=Number(customId.split(':')[2]);await i.update(buildEmbedEditorSelection(i.guildId,i.client,Number.isFinite(page)?page:0));return true;}
  if(customId.startsWith('embededit:select:')&&i.isStringSelectMenu()){
  const name=i.values[0]?.trim();
  if(!name||(!loadGuild(i.guildId).savedEmbeds?.[name]&&!getEditableEmbedDefinitions(i.client).some(x=>x.name===name))){
    await i.reply({content:'❌ That embed no longer exists.',ephemeral:true});return true;
  }
  try{
    const sid=await createEmbedEditorSession(i as any,name);
    await i.update(renderPayload(sessions.get(sid)!));
  }catch(error){
    console.error('[EmbedEditor] Selection failed:',error);
    if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:'❌ Could not open that embed editor. Please try again.',ephemeral:true}).catch(()=>undefined);
  }
  return true;
}
  if(!customId.startsWith('embededit:'))return false;
  if(customId.startsWith('embededit:modal:')&&i.isModalSubmit()){
    const section=customId.split(':')[2];
    const entry=[...sessions.entries()].reverse().find(([,s])=>s.userId===i.user.id&&s.guildId===i.guildId);
    if(!entry){await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true});return true;}
    const [sid,s]=entry;
    try{
      if(section==='basic'){
        s.draft.title=i.fields.getTextInputValue('title').trim()||undefined;s.draft.description=i.fields.getTextInputValue('description').trim()||undefined;
        const c=i.fields.getTextInputValue('color').trim();if(c){const n=parseInt(c.replace('#',''),16);if(!Number.isInteger(n)||n<0||n>0xFFFFFF)throw new Error('Invalid hex color.');s.draft.color=n;}else s.draft.color=undefined;
        s.draft.timestamp=i.fields.getTextInputValue('timestamp').trim().toLowerCase()!=='off';
      }else if(section==='author'){s.draft.authorName=i.fields.getTextInputValue('author').trim()||undefined;s.draft.authorIconUrl=i.fields.getTextInputValue('author_icon').trim()||undefined;
      }else if(section==='media'){s.draft.thumbnailUrl=i.fields.getTextInputValue('thumbnail').trim()||undefined;s.draft.imageUrl=i.fields.getTextInputValue('image').trim()||undefined;
      }else if(section==='footer'){s.draft.footerText=i.fields.getTextInputValue('footer').trim()||undefined;s.draft.footerIconUrl=i.fields.getTextInputValue('footer_icon').trim()||undefined;
      }else if(section==='fields'){
        const raw=i.fields.getTextInputValue('index').trim(),name=i.fields.getTextInputValue('field_name').trim(),value=i.fields.getTextInputValue('field_value').trim(),inline=i.fields.getTextInputValue('inline').trim().toLowerCase()==='on';
        if(!name||!value)throw new Error('Field name and value are required.');s.draft.fields??=[];
        if(raw){const n=Number(raw)-1;if(!Number.isInteger(n)||n<0||n>=s.draft.fields.length)throw new Error('That field number does not exist.');s.draft.fields[n]={name,value,inline};}
        else{if(s.draft.fields.length>=25)throw new Error('Maximum 25 fields.');s.draft.fields.push({name,value,inline});}
      }else if(section==='emojis'){
        s.draft.title=i.fields.getTextInputValue('title').trim()||undefined;
        s.draft.description=i.fields.getTextInputValue('description').trim()||undefined;
      }
      await i.deferUpdate();await render(i,sid);
    }catch(error){await i.reply({content:'❌ '+(error instanceof Error?error.message:'Could not apply that change.'),ephemeral:true}).catch(()=>undefined);}
    return true;
  }
  const parts=customId.split(':'),sid=parts[1],action=parts[2],s=sessions.get(sid);
  if(!s){await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true}).catch(()=>undefined);return true;}
  if(i.user.id!==s.userId||i.guildId!==s.guildId||!isEmbedEditorOwner(i.user.id)){await i.reply({content:'🔒 This editor belongs to an authorized user only.',ephemeral:true}).catch(()=>undefined);return true;}
  if(action==='done'&&i.isButton()){
    try{await normalize(s.draft,i);updateGuild(s.guildId,d=>{d.savedEmbeds??={};d.savedEmbeds[s.name]=savedFromDraft(s.name,s.sourceKey,s.draft,s.original);});const saved=loadGuild(s.guildId).savedEmbeds[s.name];sessions.delete(sid);await i.update({content:'✅ **'+s.name+'** was updated successfully and saved permanently.\nEveryone using this command will now receive the edited embed.',embeds:[buildEmbedPreview(saved)],components:[]});}
    catch(error){console.error('[EmbedEditor] Save failed:',error);await i.reply({content:'❌ I could not save this embed. No permanent changes were made.',ephemeral:true}).catch(()=>undefined);}
    return true;
  }
  if(action==='cancel'&&i.isButton()){sessions.delete(sid);await i.update({content:'🗑️ Editor cancelled. No staged changes were saved.',embeds:[],components:[]});return true;}
  if(i.isButton()&&['basic','author','media','footer','fields','emojis'].includes(action)){await i.showModal(makeModal(s,action));return true;}
  return true;
}