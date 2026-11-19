import React, {useState,useRef,useEffect} from 'react';
import {generateTextStream, countContentChars, GenerationInterrupted} from '../services/geminiService';
type Direction = {title:string;summary:string;events:string[];pace:string};
type Draft = {text:string;status:string;error?:string;resumable?:boolean};
export default function ImitationDirections({prompt,options}:{prompt:string;options:any}) {
 const [plans,setPlans]=useState<Direction[]>([]),[selected,setSelected]=useState<number[]>([]),[active,setActive]=useState(0),[drafts,setDrafts]=useState<Record<number,Draft>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [copied,setCopied]=useState<number|null>(null);
 const copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const controllers=useRef(new Set<AbortController>());
 const controller=useRef<AbortController|null>(null),snapshot=useRef<any>(null),paused=useRef(false);
 useEffect(()=>()=>{controller.current?.abort();controllers.current.forEach(c=>c.abort());if(copyTimer.current)clearTimeout(copyTimer.current);},[]);
 const copyCurrent=async()=>{try{await navigator.clipboard.writeText(drafts[active].text);setCopied(active);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(null),3000);}catch{setError('复制失败，请重试。');}};
 const prepare=async()=>{
  setBusy(true);setError('');const c=new AbortController();controller.current=c;
  try {
   let result=''; for await(const chunk of generateTextStream(`请根据以下仿写任务设计恰好5个不同剧情走向，不生成正文。仅输出JSON数组，每项字段 title、summary（简要剧情概括）、events（主要事件字符串数组）、pace（节奏安排）。\n任务：\n${prompt}`,{...options,targetChars:undefined,taskPrompt:'设计剧情方案',signal:c.signal,autoRecover:false}))result+=chunk;
   const parsed=JSON.parse(result.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
   if(!Array.isArray(parsed)||parsed.length!==5||parsed.some(p=>typeof p.title!=='string'||typeof p.summary!=='string'||typeof p.pace!=='string'||!Array.isArray(p.events)||p.events.some((e:any)=>typeof e!=='string')))throw Error('模型没有返回完整的5个剧情方案，请重新生成方案。');
   snapshot.current={prompt,options:{...options}};setPlans(parsed);setSelected([0]);setActive(0);setDrafts({});
  }catch(e:any){if(!c.signal.aborted)setError(e.message||'方案生成失败');}finally{setBusy(false);}
 };
 const run=async(ids:number[],resume=false,regenerate=false)=>{
  if(busy||!snapshot.current)return;setBusy(true);paused.current=false;setError('');
  await Promise.all(ids.filter(id=>regenerate || resume || !drafts[id]).map(async id=>{
   if(paused.current)return;
   const c=new AbortController();controllers.current.add(c);let text=resume?(drafts[id]?.text||''):'';
   const update=(status:string,extra:any={})=>setDrafts(prev=>({...prev,[id]:{text,status,...extra}}));
   update('正在生成');
   try{
    const task=`${snapshot.current.prompt}\n【选定剧情走向】\n${JSON.stringify(plans[id])}\n严格按此方案写一篇完整故事，只输出这篇正文。${snapshot.current.options.bodyInstruction || ''}`;
    for await(const chunk of generateTextStream(task,{...snapshot.current.options,taskPrompt:task,initialText:text,enforceTargetLength:false,autoRecover:true,signal:c.signal,onStatus:(status:string)=>update(status)})){text+=chunk;update('正在生成');}
    update('已完成');setSelected(prev=>prev.filter(value=>value!==id));
   }catch(e:any){update(c.signal.aborted?'已暂停':'生成中断',{error:c.signal.aborted?undefined:e.message,resumable:c.signal.aborted||(e instanceof GenerationInterrupted&&e.recoverable)});}finally{controllers.current.delete(c);}
  }));
  setBusy(false);
 };
 return <section className="p-6 space-y-5 h-full overflow-auto bg-slate-50 dark:bg-gray-950">
  <header className="flex justify-between items-center"><div><h3 className="text-xl font-bold">选择剧情走向</h3><p className="text-sm text-gray-500">先看脉络，再开始仿写。支持多选，每篇独立保存于当前页面。</p></div><button disabled={busy} onClick={prepare} className="transition-transform active:scale-95 rounded-xl border px-4 py-2 disabled:opacity-50">{busy&&!plans.length?'正在设计5个方案…':plans.length?'重新设计方案':'生成5个剧情方案'}</button></header>
  {plans.length>0&&<><div role="tablist" aria-label="剧情方案" className="grid grid-cols-5 gap-3">{plans.map((p,i)=><button key={i} role="tab" aria-selected={active===i} onClick={()=>setActive(i)} className={`rounded-2xl border p-4 text-left transition-all motion-safe:active:scale-95 motion-safe:hover:-translate-y-1 motion-safe:hover:scale-105 focus-visible:ring-2 ring-sky-500 ${drafts[i]?.status==='已完成'?`bg-yellow-100 border-yellow-300 text-yellow-950 ${active===i?'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.55)]':''}`:active===i?'bg-sky-100 border-sky-500 text-sky-900':'bg-white dark:bg-gray-900'}`}><span className="text-xs">方案 {i+1} · {drafts[i]?.status||'待生成'}</span><strong className="block mt-2">{p.title}</strong><span className="block mt-2 text-xs">{selected.includes(i)?'✓ 已选择':'未选择'}</span></button>)}</div>
  <article role="tabpanel" className="p-6 bg-white dark:bg-gray-900 rounded-2xl border space-y-4"><h4 className="text-lg font-bold">{plans[active].title}</h4><p>{plans[active].summary}</p><div><strong>主要事件</strong><ol className="list-decimal pl-6">{plans[active].events.map((e,i)=><li key={i}>{e}</li>)}</ol></div><p><strong>节奏：</strong>{plans[active].pace}</p><div className="flex justify-end pt-4"><button type="button" aria-pressed={selected.includes(active)} disabled={busy || !!drafts[active]} onClick={()=>setSelected(prev=>prev.includes(active)?prev.filter(i=>i!==active):[...prev,active])} className={`min-h-[44px] rounded-xl border px-4 py-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${selected.includes(active)?'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200':'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{selected.includes(active)?'✓ 已选择此剧情':'选择此剧情'}</button></div></article>
  <div className="flex gap-3">{busy?<button onClick={()=>{paused.current=true;controller.current?.abort();controllers.current.forEach(c=>c.abort());}} className="transition-transform active:scale-95 bg-rose-500 text-white rounded-xl px-5 py-3">停止生成</button>:<><button disabled={!selected.some(id=>!drafts[id])} onClick={()=>run(selected)} className="transition-transform active:scale-95 bg-sky-600 text-white rounded-xl px-5 py-3 disabled:opacity-50">开始仿写 · 待生成 {selected.filter(id=>!drafts[id]).length} 篇</button>{drafts[active]?.resumable&&<button onClick={()=>run([active],true)} className="transition-transform active:scale-95 rounded-xl border px-5">继续生成当前篇</button>}{drafts[active]&&<button onClick={()=>run([active],false,true)} className="transition-transform active:scale-95 rounded-xl border px-5">重新生成当前篇</button>}</>}</div>
  {drafts[active]&&<div className="rounded-2xl bg-white dark:bg-gray-900 p-6 border"><h4 className="font-bold mb-3">方案 {active+1} · {plans[active].title} · 仿写正文</h4><p role="status" className="text-sky-600">{drafts[active].status==='已完成'?'':`${drafts[active].status} · `}已生成 {countContentChars(drafts[active].text)} 字{drafts[active].status==='正在生成'?' · 请稍候…':''}</p>{drafts[active].error&&<p role="alert" className="text-amber-700">{drafts[active].error}</p>}<div className="my-3 flex items-center gap-3"><button onClick={copyCurrent} className="min-h-[44px] border rounded-xl px-4 py-2 transition-all active:scale-95 hover:bg-sky-50 focus-visible:ring-2 ring-sky-400">复制当前篇</button><span role="status" className="text-sm text-sky-600">{copied===active?'已复制':''}</span></div><div className="whitespace-pre-wrap">{drafts[active].text}</div></div>}</>}
  {error&&<p role="alert" className="text-amber-700">{error}</p>}
 </section>;
}
