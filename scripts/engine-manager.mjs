import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { cpus, totalmem } from 'node:os';
import { existsSync, openSync, closeSync, readFileSync, statSync } from 'node:fs';
import { writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODEL, mergedProofValid } from './core.mjs';
const exec=promisify(execFile), root=resolve(import.meta.dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function parseDevices(stdout,runtime){return stdout.split(/\r?\n/).flatMap(line=>{const m=/^(CPU|CUDA\d+|Vulkan\d+)\t(.+)$/i.exec(line.trim());return m?[{id:m[1],name:m[2],runtime,cpu:m[1].toLowerCase()==='cpu'}]:[];});}
export function mergedModel(){try{const proof=JSON.parse(readFileSync(resolve(root,'models/merged-lora.json'),'utf8')),file=resolve(root,'models',MODEL.merged);return mergedProofValid(proof)&&statSync(file).size===proof.outputBytes?file:null;}catch{return null;}}
const DEDICATED=/geforce|rtx|quadro|tesla|radeon (rx|pro)|arc(\(tm\))? [ab]\d/i;
export function chooseMode(requested,hardware){
  const gpu=hardware.gpus[0];
  const mode=requested==='auto'?(!gpu?'cpu':'hybrid'):requested;
  if(!['cpu','gpu','hybrid'].includes(mode))throw new Error('Modo de cálculo inválido.');
  if(mode!=='cpu'&&!gpu)throw new Error('No hay GPU compatible disponible. Selecciona CPU o Automático.');
  if(mode==='cpu'&&!hardware.cpuAvailable)throw new Error('Falta el motor CPU. Ejecuta el instalador opcional con -Backend cpu.');
  return {mode,runtime:mode==='cpu'?MODEL.runtimeCpu:gpu.runtime,device:mode==='cpu'?'CPU':gpu.id,backend:mode==='cpu'?'cpu':mode==='hybrid'?`all=cpu,diffusion=${gpu.id},vae=${gpu.id}`:gpu.id};
}
export function engineFeatures(selection,profile='pascal-fast'){
  const cuda=/^cuda/i.test(selection.device);
  const normalized=['pascal-fast','pascal-direct','pascal-tiled'].includes(profile)?profile:'pascal-fast';
  return {merged:!!mergedModel(),profile:normalized,attention:cuda?'flash':'flash',convDirect:normalized==='pascal-direct',vaeTiled:normalized==='pascal-tiled',weights:selection.mode==='cpu'?'mmap':'ram'};
}
export function engineArgs(selection,threads,port,features=engineFeatures(selection)){
  const merged=features.merged&&mergedModel();
  const args=['--diffusion-model',merged||resolve(root,'models',MODEL.base),'--llm',resolve(root,'models/Qwen3VL-8B-Instruct-Q4_K_M.gguf'),'--llm_vision',resolve(root,'models/mmproj-Qwen3VL-8B-Instruct-F16.gguf'),'--vae',resolve(root,'models/qwen_image_2.1_vae_bf16.safetensors'),'--backend',selection.backend,'--threads',String(threads||-1),'--cfg-scale','1','--sampling-method','euler','--listen-ip','127.0.0.1','--listen-port',String(port),'--log-level','info'];
  if(!merged)args.push('--lora-model-dir',resolve(root,'models/loras'),'--lora-apply-mode','at_runtime');
  args.push('--diffusion-fa');
  if(features.convDirect)args.push('--vae-conv-direct');
  args.push(features.weights==='mmap'?'--mmap':'--offload-to-cpu');
  return args;
}
export async function assertPortFree(port){await new Promise((ok,bad)=>{const probe=createServer();probe.once('error',()=>bad(new Error('El puerto del motor está ocupado por otra instancia. Ciérrala antes de generar.')));probe.listen(port,'127.0.0.1',()=>probe.close(ok));});}
export class EngineManager {
  constructor(port){this.port=port;this.child=null;this.current=null;this.loading=false;this.error=null;this.hardware=null;this.queue=Promise.resolve();this.detection=this.detect();}
  async detect(){
    const runs=await Promise.all([MODEL.runtimeCpu,MODEL.runtime,MODEL.runtimeVulkan].filter(Boolean).map(async runtime=>{const exe=resolve(root,runtime,'sd-server.exe');if(!existsSync(exe))return [];try{const {stdout}=await exec(exe,['--list-devices'],{windowsHide:true,timeout:20000,maxBuffer:1024*1024});return parseDevices(stdout,runtime);}catch{return [];}}));
    const all=runs.flat(),seen=new Set();
    const gpus=all.filter(d=>!d.cpu).map(d=>({...d,integrated:!DEDICATED.test(d.name)})).sort((a,b)=>{const score=d=>(d.integrated?0:10)+(/^cuda/i.test(d.id)?1:0);return score(b)-score(a);}).filter(d=>{if(seen.has(d.name))return false;seen.add(d.name);return true;});
    this.hardware={cpuName:cpus()[0]?.model||'CPU',logicalCores:cpus().length,ramGB:Math.round(totalmem()/1024**3),cpuAvailable:all.some(d=>d.cpu&&d.runtime===MODEL.runtimeCpu),gpus,modes:['auto',...(all.some(d=>d.cpu&&d.runtime===MODEL.runtimeCpu)?['cpu']:[]),...(gpus.length?['gpu','hybrid']:[])],merged:!!mergedModel()};return this.hardware;
  }
  snapshot(){return {managed:true,hardware:this.hardware,loading:this.loading,current:this.current,error:this.error,canGenerate:!!this.hardware&&(this.hardware.cpuAvailable||this.hardware.gpus.length>0)};}
  async stop(){const child=this.child;this.child=null;this.current=null;if(child&&child.exitCode===null&&child.signalCode===null){await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error('El motor anterior no se detuvo.')),10000);child.once('exit',()=>{clearTimeout(timer);done();});child.kill();});}}
  ensure(requested,threads=0,profile='pascal-fast'){const run=this.queue.then(()=>this.start(requested,threads,profile));this.queue=run.catch(()=>{});return run;}
  warm(requested,threads=0,profile='pascal-fast'){return this.ensure(requested,threads,profile).catch(()=>null);}
  async start(requested,threads,profile){
    const hardware=await this.detection;const selection=chooseMode(requested,hardware);const features=engineFeatures(selection,profile);const key=JSON.stringify([selection.mode,selection.device,threads,features]);
    if(this.child&&this.current?.key===key&&this.child.exitCode===null&&this.child.signalCode===null)return this.current;
    this.loading=true;this.error=null;
    try{
      await this.stop();await assertPortFree(this.port);
      const exe=resolve(root,selection.runtime,'sd-server.exe'),args=[...engineArgs(selection,threads,this.port,features),'--eager-load'];
      await appendFile(resolve(root,'logs/engine.out.log'),`\n[Qwen Imagen Pascal ${new Date().toISOString()}] mode=${selection.mode} backend=${selection.backend} threads=${threads} runtime=${selection.runtime} features=${JSON.stringify(features)}\n`);
      const out=openSync(resolve(root,'logs/engine.out.log'),'a'),err=openSync(resolve(root,'logs/engine.err.log'),'a');
      const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:['ignore',out,err]});closeSync(out);closeSync(err);this.child=child;
      let failure;child.on('error',e=>{failure=e;this.error=e.message;});await new Promise((ok,bad)=>{child.once('spawn',ok);child.once('error',bad);});
      await writeFile(resolve(root,'logs/engine.pid'),String(child.pid));await writeFile(resolve(root,'logs/engine-process.json'),JSON.stringify({pid:child.pid,executable:exe,owner:process.pid,mode:selection.mode,profile:features.profile}));
      const deadline=Date.now()+300000;
      while(Date.now()<deadline){if(failure||child.exitCode!==null||child.signalCode!==null)throw new Error(`El motor ${selection.mode} no pudo iniciar. Revisa logs/engine.err.log.`);try{const r=await fetch(`http://127.0.0.1:${this.port}/sdcpp/v1/capabilities`,{signal:AbortSignal.timeout(1500)});if(r.ok&&(await r.json()).supported_modes?.includes('img_gen')){this.current={...selection,threads,key,...features};return this.current;}}catch{}await sleep(250);}
      throw new Error('El motor tardó demasiado en iniciar. Revisa los registros.');
    }catch(e){this.error=e.message;await this.stop();throw e;}finally{this.loading=false;}
  }
}
