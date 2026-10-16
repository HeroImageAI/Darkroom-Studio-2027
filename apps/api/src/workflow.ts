import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Graph,Manifest} from '../../../packages/workflows/src/manifest.js';
export const graph=JSON.parse(readFileSync(resolve('workflows/graphs/klein-foundation.json'),'utf8')) as Graph;
export const manifest=JSON.parse(readFileSync(resolve('workflows/manifests/klein-foundation.json'),'utf8')) as Manifest;
