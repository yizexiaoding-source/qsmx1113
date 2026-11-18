import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateText, generateTextStream, resolveStoryTarget } from '../services/geminiService.ts';
const options = { model: 'gemini-4-hydrogen', temperature: 0.8, topP: 0.9, maxOutputTokens: 32768, taskPrompt: '生成一万字小说' };
test('single story and actual length acceptance', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let body: any;
    let draft = '甲'.repeat(9500);
    globalThis.fetch = async (_url, init) => { calls++; body = JSON.parse(String(init?.body)); return Response.json({text: draft}); };
    try {
        assert.equal(resolveStoryTarget('写一篇10000字小说'), 10000);
        assert.equal(resolveStoryTarget('生成一万字小说'), 10000);
        assert.equal(resolveStoryTarget('普通仿写任务'), null);
        assert.equal(await generateText('参考原文含五万字要求', options), draft);
        assert.equal(calls, 1);
        assert.equal(body.max_tokens, 32768);
        assert.match(body.contents, /9500～10500/);
        draft = '甲'.repeat(9499);
        await assert.rejects(generateText('任务', options), /实际 9499 字/);
        draft = '甲'.repeat(10501);
        await assert.rejects(generateText('任务', options), /实际 10501 字/);
        draft = '甲'.repeat(5000) + '\n全文完\n第二篇\n' + '乙'.repeat(5000);
        await assert.rejects(generateText('任务', options), /单篇检查/);
        // Streamed short output is a draft, never silently followed by a second request.
        calls = 0;
        globalThis.fetch = async () => { calls++; return new Response('data: '+JSON.stringify({text:'甲'.repeat(5000)})+'\n\ndata: [DONE]\n\n', {headers:{'Content-Type':'text/event-stream'}}); };
        await assert.rejects(async () => { for await (const _ of generateTextStream('任务', options)) {} }, /验收范围/);
        assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; }
});
