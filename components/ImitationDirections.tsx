import React, {useState,useRef,useEffect} from 'react';
import {generateTextStream, countContentChars, GenerationInterrupted, normalizeClientModel} from '../services/geminiService';
import {ArrowPath, X} from './Icon';
type Direction = {title:string;summary:string;events:string[];pace:string};
type Draft = {text:string;status:string;error?:string;resumable?:boolean};
function extractPlansJson(raw: string): unknown {
 const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
 try {
  return JSON.parse(cleaned);
 } catch {
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
   return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error('模型返回格式异常，请点击重新设计方案重试。');
 }
}
export default function ImitationDirections({prompt,options}:{prompt:string;options:any}) {
 const [plans,setPlans]=useState<Direction[]>([]),[selected,setSelected]=useState<number[]>([]),[active,setActive]=useState(0),[drafts,setDrafts]=useState<Record<number,Draft>>({}),[generating,setGenerating]=useState(false),[preparing,setPreparing]=useState(false),[prepChars,setPrepChars]=useState(0),[prepElapsed,setPrepElapsed]=useState(0),[error,setError]=useState('');
 const [copied,setCopied]=useState<number|null>(null);
 const busy=generating||preparing;
 const copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const prepTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 const controllers=useRef(new Set<AbortController>());
 const controller=useRef<AbortController|null>(null),snapshot=useRef<any>(null),paused=useRef(false);
 const latestOptions=useRef(options),draftOptions=useRef<Record<number,any>>({});
 latestOptions.current=options;
 useEffect(()=>()=>{controller.current?.abort();controllers.current.forEach(c=>c.abort());if(copyTimer.current)clearTimeout(copyTimer.current);if(prepTimer.current)clearInterval(prepTimer.current);},[]);
 const copyCurrent=async()=>{try{await navigator.clipboard.writeText(drafts[active].text);setCopied(active);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(null),3000);}catch{setError('复制失败，请重试。');}};
 const stopPrepare=()=>{controller.current?.abort();};
 const prepare=async()=>{
  if(busy)return;
  if(!prompt.trim()){setError('请先在左侧输入仿写要求或参考文章后再设计剧情方案。');return;}
  controller.current?.abort();
  setPreparing(true);setPrepChars(0);setPrepElapsed(0);setError('');
  if(prepTimer.current)clearInterval(prepTimer.current);
  const startedAt=Date.now();
  prepTimer.current=setInterval(()=>setPrepElapsed(Math.max(1,Math.floor((Date.now()-startedAt)/1000))),1000);
  const c=new AbortController();controller.current=c;
  const activeOpts={...latestOptions.current};
  const normModel=normalizeClientModel(activeOpts.model);
  const planTokenBudget=normModel==='deepseek-reasoner'?6144:4096;
  const planPrompt=`请根据以下仿写任务设计恰好5个差异鲜明的不同剧情走向，不生成正文。
要求：直接输出纯JSON数组（禁止输出Markdown代码块或任何解释文字），内容简练，总输出控制在1200字以内。
每项包含4个字段：title（8～16字标题）、summary（40～80字剧情梗概）、events（3～4条简明关键事件字符串数组）、pace（15～35字节奏安排）。
任务：
${prompt}`;
  try {
   let result='';
   for await(const chunk of generateTextStream(planPrompt,{...activeOpts,maxOutputTokens:Math.min(activeOpts.maxOutputTokens||planTokenBudget,planTokenBudget),targetChars:undefined,taskPrompt:'设计剧情方案',signal:c.signal,autoRecover:false})){
    result+=chunk;
    setPrepChars(countContentChars(result));
   }
   const parsed=extractPlansJson(result);
   if(!Array.isArray(parsed)||parsed.length!==5||parsed.some(p=>typeof p?.title!=='string'||typeof p?.summary!=='string'||typeof p?.pace!=='string'||!Array.isArray(p?.events)||p.events.some((e:any)=>typeof e!=='string')))throw Error('模型没有返回完整的5个剧情方案，请重新设计方案。');
   snapshot.current={prompt,options:{...activeOpts}};draftOptions.current={};setPlans(parsed);setSelected([0]);setActive(0);setDrafts({});
  }catch(e:any){if(!c.signal.aborted && e?.message!=='Aborted')setError(e.message||'方案生成失败');}finally{
   if(prepTimer.current){clearInterval(prepTimer.current);prepTimer.current=null;}
   if(controller.current===c)controller.current=null;
   setPreparing(false);
  }
 };
 const run=async(ids:number[],resume=false,regenerate=false)=>{
  if(busy||!snapshot.current)return;setGenerating(true);paused.current=false;setError('');
  await Promise.all(ids.filter(id=>regenerate || resume || !drafts[id]).map(async id=>{
   if(paused.current)return;
   const c=new AbortController();controllers.current.add(c);let text=resume?(drafts[id]?.text||''):'';
   const resolvedOptions=resume && draftOptions.current[id]?draftOptions.current[id]:{...snapshot.current.options,...latestOptions.current};
   if(!resume)draftOptions.current[id]=resolvedOptions;
   const update=(status:string,extra:any={})=>setDrafts(prev=>({...prev,[id]:{text,status,...extra}}));
   update('正在生成');
   try{
    const task=`${snapshot.current.prompt}\n【选定剧情走向】\n${JSON.stringify(plans[id])}\n严格按此方案写一篇完整故事，只输出这篇正文。${resolvedOptions.bodyInstruction || ''}`;
    for await(const chunk of generateTextStream(task,{...resolvedOptions,taskPrompt:task,initialText:text,enforceTargetLength:false,autoRecover:true,stageControl:true,signal:c.signal,onStatus:(status:string)=>update(status)})){text+=chunk;update('正在生成');}
    update('已完成');setSelected(prev=>prev.filter(value=>value!==id));
   }catch(e:any){update(c.signal.aborted?'已暂停':'生成中断',{error:c.signal.aborted?undefined:e.message,resumable:c.signal.aborted||Boolean(text.trim())||(e instanceof GenerationInterrupted&&e.recoverable)});}finally{controllers.current.delete(c);}
  }));
  setGenerating(false);
 };
 return <section className="p-6 space-y-5 h-full overflow-auto bg-slate-50 dark:bg-gray-950">
  <header className="flex flex-wrap justify-between items-center gap-3">
   <div><h3 className="text-xl font-bold">选择剧情走向</h3><p className="text-sm text-gray-500">先看脉络，再开始仿写。修改左侧文章或要求后，可直接在当前页点击重新设计方案。</p></div>
   <div className="flex items-center gap-2">
    <button disabled={busy} onClick={prepare} className="transition-all active:scale-95 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-900 px-4 py-2 font-medium flex items-center gap-2 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-60 disabled:cursor-not-allowed">
     {preparing && <ArrowPath className="w-4 h-4 animate-spin text-sky-600" />}
     <span>{preparing?(plans.length?'正在重新设计方案…':'正在设计5个方案…'):plans.length?'重新设计方案':'生成5个剧情方案'}</span>
    </button>
    {preparing && <button type="button" onClick={stopPrepare} className="transition-transform active:scale-95 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-3 py-2 text-sm font-medium flex items-center gap-1 hover:bg-rose-100"><X className="w-4 h-4" />取消</button>}
   </div>
  </header>
  {preparing && <div role="status" aria-live="polite" className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/40 px-5 py-4 space-y-2 animate-fade-in">
   <div className="flex items-center justify-between gap-3 text-sm font-medium text-sky-800 dark:text-sky-200">
    <div className="flex items-center gap-2.5">
     <ArrowPath className="w-4 h-4 animate-spin text-sky-600 flex-shrink-0" />
     <span>{prepChars > 0 ? `正在生成 5 个剧情方案…（已接收 ${prepChars} 字 · ${prepElapsed}s）` : `正在结合最新内容分析并设计 5 个剧情方案…（已耗时 ${prepElapsed}s）`}</span>
    </div>
    <span className="text-xs text-sky-600 dark:text-sky-400">完成后将自动刷新方案</span>
   </div>
   <div className="w-full h-1.5 bg-sky-100 dark:bg-sky-900/60 rounded-full overflow-hidden">
    <div className="h-full w-2/3 bg-sky-500 rounded-full animate-pulse" />
   </div>
  </div>}
  {preparing && plans.length===0 && <div aria-hidden="true" className="grid grid-cols-5 gap-3">{[0,1,2,3,4].map(i=><div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 animate-pulse"><div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded" /></div>)}</div>}
  {plans.length>0&&<div className={`space-y-5 transition-opacity ${preparing?'opacity-45 pointer-events-none select-none':''}`}><div role="tablist" aria-label="剧情方案" className="grid grid-cols-5 gap-3">{plans.map((p,i)=><button key={i} role="tab" aria-selected={active===i} onClick={()=>setActive(i)} className={`rounded-2xl border p-4 text-left transition-all motion-safe:active:scale-95 motion-safe:hover:-translate-y-1 motion-safe:hover:scale-105 focus-visible:ring-2 ring-sky-500 ${drafts[i]?.status==='已完成'?`bg-yellow-100 border-yellow-300 text-yellow-950 ${active===i?'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.55)]':''}`:active===i?'bg-sky-100 border-sky-500 text-sky-900':'bg-white dark:bg-gray-900'}`}><span className="text-xs">方案 {i+1} · {drafts[i]?.status||'待生成'}</span><strong className="block mt-2">{p.title}</strong><span className="block mt-2 text-xs">{selected.includes(i)?'✓ 已选择':'未选择'}</span></button>)}</div>
  <article role="tabpanel" className="p-6 bg-white dark:bg-gray-900 rounded-2xl border space-y-4"><h4 className="text-lg font-bold">{plans[active].title}</h4><p>{plans[active].summary}</p><div><strong>主要事件</strong><ol className="list-decimal pl-6">{plans[active].events.map((e,i)=><li key={i}>{e}</li>)}</ol></div><p><strong>节奏：</strong>{plans[active].pace}</p><div className="flex justify-end pt-4"><button type="button" aria-pressed={selected.includes(active)} disabled={busy || !!drafts[active]} onClick={()=>setSelected(prev=>prev.includes(active)?prev.filter(i=>i!==active):[...prev,active])} className={`min-h-[44px] rounded-xl border px-4 py-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${selected.includes(active)?'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200':'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{selected.includes(active)?'✓ 已选择此剧情':'选择此剧情'}</button></div></article>
  <div className="flex gap-3">{generating?<button onClick={()=>{paused.current=true;controller.current?.abort();controllers.current.forEach(c=>c.abort());}} className="transition-transform active:scale-95 bg-rose-500 text-white rounded-xl px-5 py-3">停止生成</button>:<><button disabled={busy || !selected.some(id=>!drafts[id])} onClick={()=>run(selected)} className="transition-transform active:scale-95 bg-sky-600 text-white rounded-xl px-5 py-3 disabled:opacity-50">开始仿写 · 待生成 {selected.filter(id=>!drafts[id]).length} 篇</button>{drafts[active]?.resumable&&<button disabled={busy} onClick={()=>run([active],true)} className="transition-transform active:scale-95 rounded-xl border px-5 disabled:opacity-50">继续生成当前篇</button>}{drafts[active]&&<button disabled={busy} onClick={()=>run([active],false,true)} className="transition-transform active:scale-95 rounded-xl border px-5 disabled:opacity-50">重新生成当前篇</button>}</>}</div>
  {drafts[active]&&<div className="rounded-2xl bg-white dark:bg-gray-900 p-6 border"><h4 className="font-bold mb-3">方案 {active+1} · {plans[active].title} · 仿写正文</h4><p role="status" className="text-sky-600">{drafts[active].status==='已完成'?'':`${drafts[active].status} · `}已生成 {countContentChars(drafts[active].text)} 字{drafts[active].status==='正在生成'?' · 请稍候…':''}</p>{drafts[active].error&&<p role="alert" className="text-amber-700">{drafts[active].error}</p>}<div className="my-3 flex items-center gap-3"><button onClick={copyCurrent} className="min-h-[44px] border rounded-xl px-4 py-2 transition-all active:scale-95 hover:bg-sky-50 focus-visible:ring-2 ring-sky-400">复制当前篇</button><span role="status" className="text-sm text-sky-600">{copied===active?'已复制':''}</span></div><div className="whitespace-pre-wrap">{drafts[active].text}</div></div>}</div>}
  {error&&<p role="alert" className="text-amber-700">{error}</p>}
 </section>;
}
