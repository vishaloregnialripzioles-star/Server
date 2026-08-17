import type { Client, Guild, GuildMember, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { loadGuild } from './storage.js';

export type LogCategory='messageDelete'|'messageEdit'|'messageBulkDelete'|'serverChanges'|'channelChanges'|'roleChanges'|'memberChanges'|'moderation'|'joinsLeaves'|'invites'|'commands'|'automod'|'giveaways';
export async function auditLog(guild:Guild,category:LogCategory,title:string,description:string,fields:{name:string;value:string;inline?:boolean}[]=[]):Promise<void>{const cfg=loadGuild(guild.id).config.logging;if(cfg?.enabled===false||cfg?.categories?.[category]===false)return;const channelId=cfg?.channelId||loadGuild(guild.id).config.logChannel;if(!channelId)return;const ch=await guild.channels.fetch(channelId).catch(()=>null);if(!ch?.isTextBased())return;const embed=new EmbedBuilder().setTitle(title).setDescription(description.slice(0,4000)).setTimestamp();if(fields.length)embed.addFields(fields.slice(0,25));await ch.send({embeds:[embed]}).catch(()=>undefined);}
