import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,renameSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import type {Asset,Project,Job,Intent,JobState} from '../../../packages/contracts/src/index.js';
import {snapshotSchema,initialSnapshot,type Snapshot} from '../../../packages/document/src/schema.js';
export class Conflict extends Error {}
const now=()=>new Date().toISOString();
export class Store {
 readonly db:DatabaseSync;
 constructor(readonly root:string){
  for(const p of ['assets','documents','tmp','backups'])mkdirSync(join(root,p),{recursive:true});
  this.db=new DatabaseSync(join(root,'studio.sqlite'));
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
   BEGIN;
   CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,hash TEXT NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,alpha INTEGER NOT NULL,origin TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS project_assets(projectId TEXT REFERENCES projects(id),assetId TEXT REFERENCES assets(id),role TEXT NOT NULL,PRIMARY KEY(projectId,assetId));
   CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),originalAssetId TEXT NOT NULL REFERENCES assets(id),currentRevisionId TEXT);
   CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id),parentId TEXT REFERENCES revisions(id),path TEXT NOT NULL,hash TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS revision_assets(revisionId TEXT REFERENCES revisions(id),assetId TEXT REFERENCES assets(id),PRIMARY KEY(revisionId,assetId));
   CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,documentId TEXT REFERENCES documents(id),revisionId TEXT REFERENCES revisions(id),name TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),intent TEXT NOT NULL,state TEXT NOT NULL,promptId TEXT,error TEXT,resultId TEXT REFERENCES assets(id),createdAt TEXT NOT NULL,provenance TEXT,idempotencyKey TEXT NOT NULL UNIQUE);
   CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,jobId TEXT REFERENCES jobs(id),type TEXT NOT NULL,payload TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS validations(id TEXT PRIMARY KEY,report TEXT NOT NULL,createdAt TEXT NOT NULL);
   INSERT OR IGNORE INTO migrations VALUES(1);
   COMMIT;`);
 }
 transaction<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 projects(){return this.db.prepare('SELECT * FROM projects ORDER BY createdAt DESC').all() as unknown as Project[];}
 createProject(name:string){const p={id:randomUUID(),name,createdAt:now()};this.db.prepare('INSERT INTO projects VALUES(?,?,?)').run(p.id,p.name,p.createdAt);return p;}
 project(id:string){return this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as unknown as Project|undefined;}
 private atomic(relative:string,bytes:Buffer){const temp=join(this.root,'tmp',randomUUID());writeFileSync(temp,bytes,{flag:'wx'});renameSync(temp,join(this.root,relative));}
 async importAsset(bytes:Buffer,name:string,projectId:string,origin:'import'|'generated'='import'){
  if(!this.project(projectId))throw Error('Project not found');if(bytes.length>30*1024*1024)throw Error('Image exceeds 30 MB');
  const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'});const metadata=await image.metadata();
  if(!['png','jpeg','webp'].includes(metadata.format??'')||!metadata.width||!metadata.height||metadata.pages&&metadata.pages>1)throw Error('Use a still PNG, JPEG or WebP image');
  // Decode fully before accepting bytes; metadata alone does not validate a truncated file.
  await image.stats();
  const hash=createHash('sha256').update(bytes).digest('hex');const path=join('assets',hash+'.'+metadata.format);
  if(!existsSync(join(this.root,path)))this.atomic(path,bytes);
  const asset:Asset={id:randomUUID(),hash,name:name.slice(0,200),mime:'image/'+metadata.format,width:metadata.width,height:metadata.height,alpha:metadata.hasAlpha??false,origin,createdAt:now()};
  this.transaction(()=>{this.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?)').run(asset.id,hash,path,asset.name,asset.mime,asset.width,asset.height,Number(asset.alpha),origin,asset.createdAt);this.db.prepare('INSERT INTO project_assets VALUES(?,?,?)').run(projectId,asset.id,origin==='import'?'original':'result');});return asset;
 }
 asset(id:string){const row=this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as unknown as (Asset&{path:string})|undefined;return row?{...row,alpha:!!row.alpha}:undefined;}
 assetBytes(id:string){const a=this.asset(id);if(!a)throw Error('Asset not found');return readFileSync(join(this.root,a.path));}
 assets(projectId:string){return this.db.prepare('SELECT a.* FROM assets a JOIN project_assets p ON a.id=p.assetId WHERE p.projectId=? ORDER BY a.createdAt DESC').all(projectId).map(r=>({...r,alpha:!!r.alpha})) as unknown as Asset[];}
 documents(projectId:string){return this.db.prepare('SELECT * FROM documents WHERE projectId=?').all(projectId);}
 createDocument(projectId:string,assetId:string){
  const a=this.asset(assetId);if(!a||!this.db.prepare('SELECT 1 FROM project_assets WHERE projectId=? AND assetId=?').get(projectId,assetId))throw Error('Asset not in this project');
  const id=randomUUID();const snapshot=initialSnapshot(id,a,randomUUID());
  return this.transaction(()=>{this.db.prepare('INSERT INTO documents VALUES(?,?,?,NULL)').run(id,projectId,assetId);return this.writeRevision(id,null,snapshot);});
 }
 document(id:string){const d=this.db.prepare('SELECT * FROM documents WHERE id=?').get(id) as {id:string;projectId:string;originalAssetId:string;currentRevisionId:string}|undefined;if(!d)return undefined;const r=this.db.prepare('SELECT * FROM revisions WHERE id=?').get(d.currentRevisionId!);if(!r)throw Error('Missing document revision');const bytes=readFileSync(join(this.root,String(r.path)));if(createHash('sha256').update(bytes).digest('hex')!==r.hash)throw Error('Document revision integrity failure');return {...d,snapshot:snapshotSchema.parse(JSON.parse(bytes.toString()))};}
 private writeRevision(id:string,parent:string|null,snapshot:Snapshot){
  const doc=snapshotSchema.parse(snapshot);if(doc.id!==id)throw Error('Document ID mismatch');
  const projectId=this.db.prepare('SELECT projectId FROM documents WHERE id=?').get(id)?.projectId;
  const assets=[...new Set(doc.layers.flatMap(l=>'assetId'in l?[l.assetId,...(l.maskAssetId?[l.maskAssetId]:[])]:[]))];
  for(const a of assets)if(!this.db.prepare('SELECT 1 FROM project_assets WHERE projectId=? AND assetId=?').get(projectId!,a))throw Error('Layer references an asset outside this project');
  const revisionId=randomUUID();const path=join('documents',revisionId+'.json');const bytes=Buffer.from(JSON.stringify(doc));this.atomic(path,bytes);
  this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?)').run(revisionId,id,parent,path,createHash('sha256').update(bytes).digest('hex'),now());
  for(const a of assets)this.db.prepare('INSERT INTO revision_assets VALUES(?,?)').run(revisionId,a);
  this.db.prepare('UPDATE documents SET currentRevisionId=? WHERE id=?').run(revisionId,id);return this.document(id)!;
 }
 saveDocument(id:string,expectedRevision:string,snapshot:Snapshot){return this.transaction(()=>{const d=this.db.prepare('SELECT currentRevisionId FROM documents WHERE id=?').get(id);if(!d)throw Error('Document not found');if(d.currentRevisionId!==expectedRevision)throw new Conflict('Document changed; reload before saving');return this.writeRevision(id,expectedRevision,snapshot);});}
 version(id:string,name:string){const doc=this.document(id);if(!doc)throw Error('Document not found');const v={id:randomUUID(),documentId:id,revisionId:String(doc.currentRevisionId),name,createdAt:now()};this.db.prepare('INSERT INTO versions VALUES(?,?,?,?,?)').run(v.id,id,v.revisionId,name,v.createdAt);return v;}
 jobs(){return this.db.prepare('SELECT * FROM jobs ORDER BY createdAt').all().map(r=>({...r,intent:JSON.parse(String(r.intent))})) as unknown as Job[];}
 job(id:string){return this.jobs().find(j=>j.id===id);}
 enqueue(projectId:string,intent:Intent,key:string){const old=this.db.prepare('SELECT * FROM jobs WHERE idempotencyKey=?').get(key);if(old){if(old.projectId!==projectId||old.intent!==JSON.stringify(intent))throw new Conflict('Idempotency key used for a different request');return this.job(String(old.id))!;}
  const id=randomUUID();this.transaction(()=>{this.db.prepare('INSERT INTO jobs VALUES(?,?,?,\'queued\',NULL,NULL,NULL,?,NULL,?)').run(id,projectId,JSON.stringify(intent),now(),key);this.event(id,'state',{state:'queued'});});return this.job(id)!;
 }
 updateJob(id:string,state:JobState,fields:{promptId?:string;error?:string;resultId?:string;provenance?:string}={}){const j=this.job(id);if(!j)throw Error('Job not found');this.transaction(()=>{this.db.prepare('UPDATE jobs SET state=?,promptId=?,error=?,resultId=?,provenance=? WHERE id=?').run(state,fields.promptId??j.promptId,fields.error??j.error,fields.resultId??j.resultId,fields.provenance??j.provenance,id);this.event(id,'state',{state,...fields});});}
 event(jobId:string,type:string,payload:unknown){this.db.prepare('INSERT INTO events(jobId,type,payload,createdAt) VALUES(?,?,?,?)').run(jobId,type,JSON.stringify(payload),now());}
 events(after:number){return this.db.prepare('SELECT * FROM events WHERE sequence>? ORDER BY sequence LIMIT 200').all(after);}
 reconcile(){const referenced=new Set([...this.db.prepare('SELECT path FROM assets').all(),...this.db.prepare('SELECT path FROM revisions').all()].map(r=>String(r.path)));const missing=[...referenced].filter(p=>!existsSync(join(this.root,p)));const orphaned=['assets','documents','tmp'].flatMap(dir=>readdirSync(join(this.root,dir)).map(f=>join(dir,f))).filter(p=>!referenced.has(p));return {missing,orphaned};}
 close(){this.db.close();}
}
