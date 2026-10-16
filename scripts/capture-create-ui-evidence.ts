// Record the latest real UI-submitted run in the synthetic Create validation workspace.
import {Store} from '../apps/api/src/store.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const store=new Store('data/create-live');
const project=store.projects().find(p=>p.name==='Create validation · reference product');if(!project)throw Error('Run the live Create fixture first');
const batch=store.batches(project.id)[0]!;const job=store.job(batch.jobs[0]!.id)!;if(job.state!=='succeeded'||!job.provenance)throw Error('Latest UI run has not completed');
const provenance=JSON.parse(job.provenance);const asset=store.asset(job.resultId!)!;const events=store.db.prepare('SELECT type,payload,createdAt FROM events WHERE jobId=? ORDER BY sequence').all(job.id);const completed=events.filter(e=>e.type==='state'&&JSON.parse(String(e.payload)).state==='succeeded').at(-1);
const report={batchId:batch.id,jobId:job.id,modelRoute:provenance.workflowId,intent:job.intent,outputHash:asset.hash,dimensions:[asset.width,asset.height],elapsedFromQueueMs:completed?Date.parse(String(completed.createdAt))-Date.parse(job.createdAt):null,peakVram:null,visualAssessment:'Scoped pass: one black cylindrical bottle on charcoal, cream label and visible NOIR / EAU DE PARFUM text. Material/geometry fidelity is not pixel-exact certification.'};mkdirSync('data/create-live/evidence',{recursive:true});writeFileSync('data/create-live/evidence/ui-run.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));store.close();
