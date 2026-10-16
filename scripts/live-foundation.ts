// Deliberate live GPU smoke test. Produces local evidence only; does not enable a route.
import {randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {ComfyClient} from '../apps/api/src/comfy.js';
import {Store} from '../apps/api/src/store.js';
import {config} from '../apps/api/src/config.js';
import {graph,manifest} from '../apps/api/src/workflow.js';
import {bind,preflight,byTitle} from '../packages/workflows/src/bind.js';
const client=new ComfyClient(config.comfyUrl,config.instance);const inspection=await client.inspect();if(!inspection.status.verified)throw Error('Desktop verification required');preflight(graph,manifest,inspection.info);
const queue=await client.queue();if(queue.queue_running.length||queue.queue_pending.length)throw Error('ComfyUI is busy; rerun when idle');
const root='data/live-foundation';const store=new Store(root);const project=store.projects()[0]??store.createProject('Foundation validation');
const intent={prompt:'Studio product photograph of a single matte red ceramic sphere resting on a dark charcoal cube, black background, soft white rim lighting, no text, no logo, square composition.',width:512,height:512,seed:2027,model:'Klein' as const};
const job=store.enqueue(project.id,intent,randomUUID());const compiled=bind(graph,manifest,{prompt:intent.prompt,width:intent.width,height:intent.height,seed:intent.seed});
store.updateJob(job.id,'submitting',{provenance:JSON.stringify({intent,manifest,compiled,engine:inspection.status})});
const start=Date.now();const promptId=await client.submit(compiled,job.id);store.updateJob(job.id,'running',{promptId});console.log('Submitted owned smoke test '+promptId);
const deadline=Date.now()+10*60*1000;let peakVramUsed:number|null=null;
while(Date.now()<deadline){const h=await client.history(promptId);const stats=await client.json('/system_stats');const device=stats.devices?.[0];if(device)peakVramUsed=Math.max(peakVramUsed??0,device.vram_total-device.vram_free);
 if(h?.status?.status_str==='error'){store.updateJob(job.id,'failed',{error:JSON.stringify(h.status.messages)});store.close();throw Error('Engine execution failed');}
 if(h?.status?.completed){const [id]=byTitle(graph,'DR_OUTPUT');const images=h.outputs?.[id]?.images;if(images?.length!==1)throw Error('Expected one output');const bytes=await client.image(images[0]);const asset=await store.importAsset(bytes,'foundation-smoke.png',project.id,'generated');if(asset.width!==512||asset.height!==512)throw Error('Wrong output dimensions');const doc=store.createDocument(project.id,asset.id);store.version(doc.id,'Initial generated version');store.updateJob(job.id,'succeeded',{resultId:asset.id});mkdirSync('data/live-foundation/evidence',{recursive:true});writeFileSync('data/live-foundation/evidence/output.png',bytes);const report={id:'foundation-klein-2026-10-16',jobId:job.id,promptId,intent,workflowHash:manifest.graphSha256,engineFingerprint:inspection.status.fingerprint,engineVersion:inspection.status.version,device:inspection.status.device,elapsedMs:Date.now()-start,peakWholeGpuUsedBytes:peakVramUsed,samplingIntervalMs:1000,output:{width:asset.width,height:asset.height,hash:asset.hash},visualAssessment:'PENDING',createdAt:new Date().toISOString()};writeFileSync('data/live-foundation/evidence/run.json',JSON.stringify(report,null,2));store.close();console.log(JSON.stringify(report,null,2));process.exit(0);}await delay(1000);}
store.updateJob(job.id,'interrupted',{error:'Timeout; engine may still run. Inspect before retry.'});store.close();throw Error('Live test timed out');
