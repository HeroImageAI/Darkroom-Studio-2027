import {setTimeout as delay} from 'node:timers/promises';
import {bind,preflight,byTitle} from '../../../packages/workflows/src/bind.js';
import {chooseRoute} from '../../../packages/routing/src/policy.js';
import {manifest,graph} from './workflow.js';
import type {Store} from './store.js';
import type {ComfyClient} from './comfy.js';
export class Worker {
 private stopped=false;private busy=false;private socket:WebSocket|undefined;
 constructor(readonly store:Store,readonly client:ComfyClient){}
 async recover(){
  for(const j of this.store.jobs().filter(j=>!['succeeded','failed','cancelled','interrupted'].includes(j.state))){
   if(j.state==='queued'||j.state==='validating'){this.store.updateJob(j.id,'queued');continue;}
   if(!j.promptId){this.store.updateJob(j.id,'uncertain',{error:'Submission acknowledgement was lost; inspect engine history before retrying'});continue;}
   try{const history=await this.client.history(j.promptId);if(history?.status?.completed){await this.collect(j.id,history);continue;}
    const q=await this.client.queue();if([...q.queue_running,...q.queue_pending].some((p:unknown[])=>p[1]===j.promptId)){this.store.updateJob(j.id,'running');continue;}
    this.store.updateJob(j.id,'interrupted',{error:'Engine no longer has this job. Settings are preserved.'});
   }catch{/* Engine offline: retain context for reconciliation on next tick. */}
  }
 }
 async start(){await this.recover();void this.loop();}
 private async loop(){while(!this.stopped){try{await this.tick();}catch{/* Jobs record their own errors; retry connection without killing service. */}await delay(1000);}}
 async tick(){if(this.busy||this.stopped)return;this.busy=true;try{
   const existing=this.store.jobs().find(j=>['running','collecting','submitting','uncertain'].includes(j.state));
   if(existing){await this.recover();return;}
   const job=this.store.jobs().find(j=>j.state==='queued');if(!job)return;
   let submitted=false;
   try{
    this.store.updateJob(job.id,'validating');const inspection=await this.client.inspect();
    if(!inspection.status.verified)throw Error(inspection.status.reason??'Verified Desktop engine required');
    preflight(graph,manifest,inspection.info);const route=chooseRoute(job.intent,[manifest],new Set([manifest.id]));
    const q=await this.client.queue();if(q.queue_running.length||q.queue_pending.length){this.store.updateJob(job.id,'queued');return;}
    const values={prompt:job.intent.prompt,width:job.intent.width,height:job.intent.height,seed:job.intent.seed};
    const compiled=bind(graph,manifest,values);
    const provenance=JSON.stringify({intent:job.intent,workflowId:manifest.id,workflowVersion:manifest.version,graphHash:manifest.graphSha256,graph:compiled,engine:inspection.status,route,submittedAt:new Date().toISOString()});
    this.store.updateJob(job.id,'submitting',{provenance});
    this.socket=this.client.progress(event=>{const e=event as {type:string;data:{prompt_id?:string;value?:number;max?:number}};const current=this.store.job(job.id);if(current?.promptId&&e.data?.prompt_id===current.promptId&&e.type==='progress')this.store.event(job.id,'progress',e.data);});
    submitted=true;const promptId=await this.client.submit(compiled,job.id);this.store.updateJob(job.id,'running',{promptId});
    const deadline=Date.now()+10*60*1000;
    while(!this.stopped&&Date.now()<deadline){const history=await this.client.history(promptId);if(history?.status?.status_str==='error')throw Error('Engine execution failed');if(history?.status?.completed){await this.collect(job.id,history);return;}await delay(1000);}
    if(!this.stopped)this.store.updateJob(job.id,'interrupted',{error:'Job exceeded 10 minute foundation deadline; engine may still be running. Inspect before retry.'});
   }catch(e){const current=this.store.job(job.id);this.store.updateJob(job.id,submitted&&!current?.promptId?'uncertain':submitted?'interrupted':'failed',{error:(e as Error).message});}
   finally{this.socket?.close();this.socket=undefined;}
  }finally{this.busy=false;}}
 private async collect(jobId:string,history:any){
  const job=this.store.job(jobId)!;const [outputId]=byTitle(graph,manifest.outputs[0]!.title);const images=history.outputs?.[outputId]?.images;
  if(!Array.isArray(images)||images.length!==1)throw Error('Expected exactly one output image');
  this.store.updateJob(jobId,'collecting');const bytes=await this.client.image(images[0]);
  const asset=await this.store.importAsset(bytes,'Foundation image',job.projectId,'generated');
  if(asset.width!==job.intent.width||asset.height!==job.intent.height)throw Error('Output dimensions do not match request');
  this.store.updateJob(jobId,'succeeded',{resultId:asset.id});
 }
 stop(){this.stopped=true;this.socket?.close();}
}
