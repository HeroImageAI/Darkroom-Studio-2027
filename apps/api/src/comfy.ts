import {createHash,randomUUID} from 'node:crypto';
import type {EngineStatus} from '../../../packages/contracts/src/index.js';
import type {ObjectInfo,Graph} from '../../../packages/workflows/src/manifest.js';
import {loopbackUrl} from './config.js';
export class ComfyClient {
 readonly clientId=randomUUID();
 constructor(public url:string,public instance:string){this.url=loopbackUrl(url);}
 async json(path:string,options?:RequestInit):Promise<any>{const response=await fetch(this.url+path,{...options,signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`ComfyUI ${response.status}`);return response.json();}
 async inspect():Promise<{status:EngineStatus;info:ObjectInfo}>{try{
  const [stats,info]=await Promise.all([this.json('/system_stats'),this.json('/object_info')]);
  const argv=stats.system?.argv as string[]|undefined;
  const verified=!!this.instance&&!!argv?.some(s=>s.includes('instance-model-paths')&&s.includes(this.instance+'.yaml'));
  const models:Record<string,string[]>={};for(const [name,key] of [['UNETLoader','unet_name'],['CLIPLoader','clip_name'],['VAELoader','vae_name']])models[name!]=(info[name!]?.input?.required?.[key!]?.[0]??[]) as string[];
  return {status:{connected:true,verified,version:stats.system?.comfyui_version,device:stats.devices?.[0]?.name,url:this.url,models,fingerprint:createHash('sha256').update(JSON.stringify({version:stats.system?.comfyui_version,argv,packages:stats.system?.comfy_package_versions,device:stats.devices?.[0]?.name,models,info})).digest('hex'),...(!verified?{reason:'Desktop installation identity could not be verified'}:{})},info};
 }catch(e){return {status:{connected:false,verified:false,url:this.url,models:{},reason:(e as Error).message},info:{}};}}
 async submit(graph:Graph,jobId:string){const result=await this.json('/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:graph,client_id:this.clientId,extra_data:{darkroomStudioJobId:jobId}})});if(!result.prompt_id||Object.keys(result.node_errors??{}).length)throw Error('Engine rejected workflow');return result.prompt_id as string;}
 async history(promptId:string){return (await this.json('/history/'+encodeURIComponent(promptId)))[promptId];}
 async queue(){return this.json('/queue');}
 progress(onProgress:(value:unknown)=>void){const url=new URL(this.url);url.protocol='ws:';url.pathname='/ws';url.searchParams.set('clientId',this.clientId);const socket=new WebSocket(url);socket.addEventListener('message',event=>{try{onProgress(JSON.parse(String(event.data)));}catch{/* binary preview */}});socket.addEventListener('error',()=>{});return socket;}
 async image(image:{filename:string;subfolder:string;type:string}){const q=new URLSearchParams(image);const r=await fetch(this.url+'/view?'+q,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Could not collect image');const length=Number(r.headers.get('content-length'));if(length>30*1024*1024)throw Error('Engine image too large');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>30*1024*1024)throw Error('Engine image too large');return bytes;}
}
