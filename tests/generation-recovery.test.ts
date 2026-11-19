import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextStream, continuationText } from '../services/geminiService.ts';
import { geminiStream } from '../lib/geminiStream.ts';
const opts = { model: 'gemini-4-hydrogen', temperature: 1, topP: .9, autoRecover: true };
function response(text: string, reason?: string) {
    return new Response(JSON.stringify({type:'text',text})+'\n'+(reason ? JSON.stringify({type:'finish',reason})+'\n' : ''), {headers:{'Content-Type':'application/x-ndjson'}});
}
async function collect(options = opts) { let text=''; for await (const chunk of generateTextStream('写一个故事',options)) text+=chunk; return text; }
test('stream completion, bounded recovery, same model and full draft context', async () => {
    const saved = globalThis.fetch;
    const calls: any[] = [];
    try {
        globalThis.fetch = async (_, init) => { calls.push(JSON.parse(String(init?.body))); return response(calls.length===1 ? '原有正文' : '接着写完。','STOP'); };
        assert.equal(await collect(), '原有正文'); assert.equal(calls.length,1);
        calls.length=0;
        globalThis.fetch = async (_, init) => { calls.push(JSON.parse(String(init?.body))); return response(calls.length===1 ? '原有正文' : '接着写完。', calls.length===1 ? 'MAX_TOKENS' : 'STOP'); };
        assert.equal(await collect(), '原有正文接着写完。'); assert.equal(calls.length,2);
        assert.ok(calls.every(c=>c.model===opts.model)); assert.match(calls[1].contents, /<existing_draft>原有正文<\/existing_draft>/);
        calls.length=0;
        globalThis.fetch = async (_,init) => { calls.push(JSON.parse(String(init?.body))); return response('中断片段'); };
        await assert.rejects(collect(),/完成确认/); assert.equal(calls.length,4);
        calls.length=0;
        globalThis.fetch = async (_,init) => { calls.push(JSON.parse(String(init?.body))); return response('全文完','MAX_TOKENS'); };
        await assert.rejects(collect(),/完结标记/); assert.equal(calls.length,1);
    } finally { globalThis.fetch=saved; }
});
test('provider errors stay out of正文 and never switch to Gemini',async()=>{
    const saved=globalThis.fetch; const urls: string[]=[];let draft='';
    globalThis.fetch=async(url)=>{urls.push(String(url));return new Response('data: '+JSON.stringify({choices:[{delta:{content:'已有正文'}}]})+'\n\ndata: '+JSON.stringify({error:{message:'failed'}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});};
    try { await assert.rejects(async()=>{for await(const x of generateTextStream('任务',{...opts,model:'deepseek-chat',autoRecover:false}))draft+=x;});assert.equal(draft,'已有正文');assert.deepEqual(urls,['/api/deepseek']); }finally{globalThis.fetch=saved;}
});
test('continuation strips repeated boundary and rejects restarted story',()=>{
 const tail='这是一段已经生成且足够长的故事正文作为衔接。';
 assert.equal(continuationText(tail,tail+'后续。'),'后续。');
 assert.equal(continuationText('她伸手推开病房门，看见','病房门，看见床头放着一封信。'),'床头放着一封信。');
 assert.equal(continuationText('她伸手推开病房门，看见','\n\n床头放着一封信。'),'床头放着一封信。');
 assert.equal(continuationText('窗外下着大雨。\n他站在门口一言不发。\n','（接上文）他站在门口一言不发。\n过了一会儿他开口了。'),'过了一会儿他开口了。');
 assert.throws(()=>continuationText('开'.repeat(100)+'中'.repeat(100)+'尾'.repeat(100),'开'.repeat(100)+'新'),/重复开篇/);
 assert.throws(()=>continuationText(tail,'第二篇\n新小说'),/重新开篇/);
});
test('server protocol reports finish and partial failures separately',async()=>{
 async function* source(){yield {candidates:[{content:{parts:[{text:'正文'}]}}]};throw new Error('provider disconnected');}
 const text=await new Response(geminiStream(source(),true)).text();
 const events=text.trim().split('\n').map(x=>JSON.parse(x));
 assert.deepEqual(events.map(x=>x.type),['text','error']);assert.equal(events[0].text,'正文');
 async function* stop(){yield {candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'片段'}]}}]};}
 const complete=await new Response(geminiStream(stop(),true)).text();assert.match(complete,/"reason":"MAX_TOKENS"/);
});
