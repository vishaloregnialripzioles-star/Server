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
  const names=[...new Set([...definitions.map(x=>x.name),...Object.keys(saved)])].sort((a,b)=>a.localeCompare(b));
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
  return {content:'🛠️ **Sparxie Embed Editor**\\nSelect an existing command embed below.\\n📄 Page '+(current+1)+'/'+totalPages+' • '+names.length+' embed'+(names.length===1?'':'s'),embeds:[],components:rows};
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

function serializeEditableText(d:SavedEmbed):string{
  const parts:string[]=[];
  const add=(label:string,value:string|undefined)=>{parts.push('['+label+']',value??'');};
  add('TITLE',d.title);
  add('DESCRIPTION',d.description);
  add('AUTHOR',d.authorName);
  for(const [index,f] of (d.fields??[]).entries()){
    add('FIELD '+(index+1)+' NAME',f.name);
    add('FIELD '+(index+1)+' VALUE',f.value);
  }
  add('FOOTER',d.footerText);
  parts.push('[END]');
  return parts.join('\n');
}

function parseEditableText(d:SavedEmbed,text:string){
  const matches=[...text.matchAll(/^\[([^\]]+)\]\s*$/gm)];
  const sections=new Map<string,string>();
  for(let n=0;n<matches.length;n++){
    const key=matches[n][1].trim().toUpperCase();
    const start=(matches[n].index??0)+matches[n][0].length;
    const end=n+1<matches.length?(matches[n+1].index??text.length):text.length;
    sections.set(key,text.slice(start,end).trim());
  }
  const value=(key:string)=>sections.get(key);
  d.title=value('TITLE')||undefined;
  d.description=value('DESCRIPTION')||undefined;
  d.authorName=value('AUTHOR')||undefined;
  d.footerText=value('FOOTER')||undefined;
  const fields:typeof d.fields=[];
  for(let n=1;n<=25;n++){
    const name=value('FIELD '+n+' NAME');
    const fieldValue=value('FIELD '+n+' VALUE');
    if(name!==undefined||fieldValue!==undefined)fields.push({name:name||('Field '+n),value:fieldValue||'',inline:d.fields?.[n-1]?.inline??false});
  }
  d.fields=fields;
}

async function render(i:Interaction,id:string){
  const s=sessions.get(id);
  if(!s){if(i.isRepliable())await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true}).catch(()=>undefined);return;}
  if(i.guildId!==s.guildId||i.user.id!==s.userId||!isEmbedEditorOwner(i.user.id)){if(i.isRepliable())await i.reply({content:'🔒 Only the two authorized embed editors can use this editor.',ephemeral:true}).catch(()=>undefined);return;}
  try{
    const payload={content:'🛠️ **Editing: '+s.name+'**\\n\\n'+details(s.draft)+'\\n\\nUse the buttons below to edit the complete embed. Custom emoji IDs can be placed directly into text fields; **Submit / Save** makes everything permanent.',embeds:[buildEmbedPreview(s.draft)],components:components(id,s.draft)};
    if(i.isButton()||i.isStringSelectMenu())await i.update(payload);
    else if(i.isRepliable())await i.editReply(payload);
  }catch(error){
    console.error('[EmbedEditor] Render failed:',error);
    const message='❌ I could not render this embed. A saved embed value is invalid, so no changes were saved.';
    if(i.isButton()||i.isStringSelectMenu())await i.reply({content:message,ephemeral:true}).catch(()=>undefined);
    else if(i.isRepliable())await i.editReply({content:message,embeds:[],components:[]}).catch(()=>undefined);
  }
}

function input(id:string,label:string,value:string|undefined,style=TextInputStyle.Short,required=false,max=4000){
  return new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0,45)).setStyle(style).setRequired(required).setMaxLength(max).setValue((value??'').slice(0,max)));
}

function makeModal(s:Session,section:string){
  const m=new ModalBuilder().setCustomId('embededit:modal:'+section+':'+s.name).setTitle((section[0].toUpperCase()+section.slice(1)+' • '+s.name).slice(0,45));
  const d=s.draft;
  if(section==='basic')m.addComponents(input('title','Title',d.title),input('description','Description',d.description,TextInputStyle.Paragraph,false,4000),input('color','Hex color',d.color===undefined?'':'#'+d.color.toString(16).padStart(6,'0')),input('timestamp','Timestamp on/off',d.timestamp===false?'off':'on'));
  if(section==='author')m.addComponents(input('author','Author name',d.authorName),input('author_icon','Author icon URL',d.authorIconUrl));
  if(section==='media')m.addComponents(input('thumbnail','Thumbnail URL',d.thumbnailUrl),input('image','Image URL',d.imageUrl));
  if(section==='footer')m.addComponents(input('footer','Footer text',d.footerText,TextInputStyle.Paragraph,false,2048),input('footer_icon','Footer icon URL',d.footerIconUrl));
  if(section==='fields')m.addComponents(input('index','Field number (blank = add)','',TextInputStyle.Short,false,3),input('field_name','Field name','',TextInputStyle.Short,false,256),input('field_value','Field value','',TextInputStyle.Paragraph,false,1024),input('inline','Inline on/off','off'));
  if(section==='emojis')m.addComponents(
    input('action','Action: add or remove','add',TextInputStyle.Short,true,6),
    input('emoji_id','Emoji ID','',TextInputStyle.Short,false,25),
    input('full_text','Full member-visible text • place IDs anywhere',serializeEditableText(d),TextInputStyle.Paragraph,true,4000)
  );
  return m;
}

function allTextFields(s:SavedEmbed):Array<{get:()=>string|undefined;set:(v:string)=>void}>{
  const out:Array<{get:()=>string|undefined;set:(v:string)=>void}>=[];
  for(const key of ['title','description','authorName','authorIconUrl','footerText','footerIconUrl','thumbnailUrl','imageUrl'] as const)out.push({get:()=>s[key],set:(v:string)=>(s[key]=v||undefined)});
  for(const f of s.fields??[]){out.push({get:()=>f.name,set:(v:string)=>(f.name=v)});out.push({get:()=>f.value,set:(v:string)=>(f.value=v)});}
  return out;
}

async function emojiMarkup(i:Interaction,id:string):Promise<string|null>{try{const emoji=await i.client.application.emojis.fetch(id);return emoji.toString();}catch{return null;}}

function removeEmojiId(text:string,id:string):string{
  const clean=id.trim().replace(/^<a?:[^:>]+:(\d+)>$/,'$1');
  if(!/^\d{17,20}$/.test(clean))throw new Error('Enter a valid application emoji ID or full emoji token.');
  const escaped=clean.replace(/[-/\^$*+?.()|[\]{}]/g,'\\$&');
  return text.replace(new RegExp('(<a?:[^:>]+:'+escaped+'>)|'+escaped,'g'),'').replace(/[ \t]{2,}/g,' ').trim();
}

async function applyEmojiTextAction(s:SavedEmbed,i:Interaction,action:string,id:string,text:string){
  let edited=text;
  const normalizedAction=action.trim().toLowerCase();
  const clean=id.trim().match(/^<a?:[^:>]+:(\d+)>$/)?.[1]??id.trim();
  if(normalizedAction==='add'){
    if(!/^\d{17,20}$/.test(clean))throw new Error('Enter a valid application emoji ID.');
    const token=await emojiMarkup(i,clean);
    if(!token)throw new Error('That emoji ID was not found in the bot application emojis.');
    if(!edited.includes(clean)&&!edited.includes(token))edited=edited+'\n'+token;
  }else if(normalizedAction==='remove'){
    if(!/^\d{17,20}$/.test(clean))throw new Error('Enter a valid application emoji ID.');
    edited=removeEmojiId(edited,clean);
  }else throw new Error('Action must be add or remove.');
  parseEditableText(s,edited);
}


async function normalize(s:SavedEmbed,i:Interaction){
  for(const field of allTextFields(s)){
    const value=field.get();if(!value)continue;
    let out=value;
    for(const match of value.matchAll(/(?<!\\d)(\\d{17,20})(?!\\d)/g)){const token=await emojiMarkup(i,match[1]);if(token)out=out.replaceAll(match[1],token);}
    field.set(out);
  }
}

export async function handleEmbedEditorInteraction(i:Interaction):Promise<boolean>{
  if(!i.guildId)return false;
  const customId=String((i as any).customId??'');
  if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&!isEmbedEditorOwner(i.user.id)){if(customId.startsWith('embededit:')&&i.isRepliable())await i.reply({content:'🔒 This embed editor is private to the two authorized users.',ephemeral:true}).catch(()=>undefined);return customId.startsWith('embededit:');}
  if(customId.startsWith('embededit:page:')&&i.isButton()){const page=Number(customId.split(':')[2]);await i.update(buildEmbedEditorSelection(i.guildId,Number.isFinite(page)?page:0));return true;}
  if(customId.startsWith('embededit:select:')&&i.isStringSelectMenu()){const name=i.values[0]?.trim();if(!name||(!loadGuild(i.guildId).savedEmbeds?.[name]&&!getEditableEmbedDefinitions(i.client).some(x=>x.name===name))){await i.reply({content:'❌ That embed no longer exists.',ephemeral:true});return true;}const sid=await createEmbedEditorSession(i as any,name);await render(i,sid);return true;}
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
        const action=i.fields.getTextInputValue('action').trim();
        const emojiId=i.fields.getTextInputValue('emoji_id').trim();
        const fullText=i.fields.getTextInputValue('full_text');
        await applyEmojiTextAction(s.draft,i,action,emojiId,fullText);
      }
      await i.deferUpdate();await render(i,sid);
    }catch(error){await i.reply({content:'❌ '+(error instanceof Error?error.message:'Could not apply that change.'),ephemeral:true}).catch(()=>undefined);}
    return true;
  }
  const parts=customId.split(':'),sid=parts[1],action=parts[2],s=sessions.get(sid);
  if(!s){await i.reply({content:'❌ This editor session expired. Run /embed-edit again.',ephemeral:true}).catch(()=>undefined);return true;}
  if(i.user.id!==s.userId||i.guildId!==s.guildId||!isEmbedEditorOwner(i.user.id)){await i.reply({content:'🔒 This editor belongs to an authorized user only.',ephemeral:true}).catch(()=>undefined);return true;}
  if(action==='done'&&i.isButton()){
    try{await normalize(s.draft,i);updateGuild(s.guildId,d=>{d.savedEmbeds??={};d.savedEmbeds[s.name]=savedFromDraft(s.name,s.sourceKey,s.draft,s.original);});const saved=loadGuild(s.guildId).savedEmbeds[s.name];sessions.delete(sid);await i.update({content:'✅ **'+s.name+'** was updated successfully and saved permanently.\\nEveryone using this command will now receive the edited embed.',embeds:[buildEmbedPreview(saved)],components:[]});}
    catch(error){console.error('[EmbedEditor] Save failed:',error);await i.reply({content:'❌ I could not save this embed. No permanent changes were made.',ephemeral:true}).catch(()=>undefined);}
    return true;
  }
  if(action==='cancel'&&i.isButton()){sessions.delete(sid);await i.update({content:'🗑️ Editor cancelled. No staged changes were saved.',embeds:[],components:[]});return true;}
  if(i.isButton()&&['basic','author','media','footer','fields','emojis'].includes(action)){await i.showModal(makeModal(s,action));return true;}
  return true;
}