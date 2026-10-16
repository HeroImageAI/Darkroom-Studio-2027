import {ComfyClient} from '../apps/api/src/comfy.js';
import {config} from '../apps/api/src/config.js';
import {manifest,graph} from '../apps/api/src/workflow.js';
import {preflight} from '../packages/workflows/src/bind.js';
const inspection=await new ComfyClient(config.comfyUrl,config.instance).inspect();
if(!inspection.status.verified)throw Error(inspection.status.reason??'Desktop not verified');
const validation=preflight(graph,manifest,inspection.info);console.log(JSON.stringify({engine:inspection.status,validation,enabled:manifest.enabled},null,2));
