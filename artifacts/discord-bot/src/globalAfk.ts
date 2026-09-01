import { neon } from '@neondatabase/serverless';
export interface AfkPing { guildId:string; guildName:string; channelId:string; channelName:string; messageId:string; messageUrl:string; authorId:string; authorName:string; timestamp:number; }
export interface GlobalAfkEntry { userId:string; reason:string; timestamp:number; pings:AfkPing[]; }
const entries=new Map<string,GlobalAfkEntry>();
const sql=process.env.DATABASE_URL?.trim()?neon(process.env.DATABASE_URL.trim()):null; let ready=false;
export async function initGlobalAfk():Promise<void>{if(!sql)return;try{await sql`CREATE TABLE IF NOT EXISTS global_afk (user_id TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;const rows=await sql`SELECT user_id,data FROM global_afk`;for(const r of rows as any[]){const v=r.data as any;entries.set(String(r.user_id),{userId:String(r.user_id),reason:v.reason??'AFK',timestamp:v.timestamp??Date.now(),pings:Array.isArray(v.pings)?v.pings:[]});}ready=true;}catch(e){console.error('[Global AFK] init failed',e);}}
async function persist(e:GlobalAfkEntry){if(sql&&ready)await sql`INSERT INTO global_afk(user_id,data,updated_at) VALUES(${e.userId},${JSON.stringify(e)}::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;}
export function getGlobalAfk(id:string){return entries.get(id);}
export async function setGlobalAfk(id:string,reason:string){const e={userId:id,reason,timestamp:Date.now(),pings:[]} as GlobalAfkEntry;entries.set(id,e);try{await persist(e);}catch(err){console.error('[Global AFK] save failed',err);}}
export async function removeGlobalAfk(id:string){const p=entries.get(id)?.pings??[];entries.delete(id);if(sql&&ready)try{await sql`DELETE FROM global_afk WHERE user_id=${id}`}catch(e){console.error('[Global AFK] delete failed',e);}return p;}
export async function addGlobalAfkPing(id:string,ping:AfkPing){const e=entries.get(id);if(!e||e.pings.some(p=>p.messageId===ping.messageId&&p.guildId===ping.guildId))return;e.pings.push(ping);if(e.pings.length>100)e.pings.splice(0,e.pings.length-100);try{await persist(e);}catch(err){console.error('[Global AFK] ping save failed',err);}}
