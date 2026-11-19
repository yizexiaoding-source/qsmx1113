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
        globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({type:'text',text:'甲'.repeat(5000)})+'\n'+JSON.stringify({type:'finish',reason:'STOP'})+'\n', {headers:{'Content-Type':'application/x-ndjson'}}); };
        await assert.rejects(async () => { for await (const _ of generateTextStream('任务', options)) {} }, /验收范围/);
        assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; }
});

function sseResponse(text: string, reason = 'stop') {
    const chunk1 = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\n`;
    const chunk2 = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`;
    return new Response(chunk1 + chunk2 + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}

test('stageControl paces 12000-char story within ±1000, caps max_tokens, and strips conflicting limits', async () => {
    const originalFetch = globalThis.fetch;
    const sent: any[] = [];
    const lengths = [2800, 3200, 3100, 2900];
    globalThis.fetch = async (_url, init) => {
        const parsed = JSON.parse(String(init?.body));
        sent.push(parsed);
        const idx = sent.length - 1;
        return sseResponse(String.fromCharCode(0x4e00 + idx).repeat(lengths[idx] ?? 500));
    };
    try {
        const promptWithConflict = '写一个悬疑故事\n2. **字数突破**：请充分利用输出长度限制，确保单次输出尽可能充实。';
        let output = '';
        for await (const chunk of generateTextStream(promptWithConflict, {
            model: 'deepseek-chat',
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 32768,
            targetChars: 12000,
            stageControl: true,
            autoRecover: true,
        })) {
            output += chunk;
        }
        assert.equal(sent.length, 4);
        assert.equal(output.length, 12000);
        assert.ok(sent.every(b => b.max_tokens < 8000), 'per-stage max_tokens should be bounded well below 32768');
        assert.ok(sent.every(b => !b.messages[0].content.includes('充分利用输出长度限制')));
        assert.match(sent[3].messages[0].content, /已有 9100 字/);
        assert.match(sent[3].messages[0].content, /最终收官阶段/);
    } finally { globalThis.fetch = originalFetch; }
});

test('stageControl adapts when an intermediate stage overshoots or hits MAX_TOKENS and never appends past 全文完', async () => {
    const originalFetch = globalThis.fetch;
    const sent: any[] = [];
    globalThis.fetch = async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)));
        if (sent.length === 1) return sseResponse('一'.repeat(5200), 'length');
        if (sent.length === 2) return sseResponse('二'.repeat(3400), 'stop');
        return sseResponse('三'.repeat(3200), 'stop');
    };
    try {
        let output = '';
        for await (const chunk of generateTextStream('写小说', {
            model: 'deepseek-chat',
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 32768,
            targetChars: 12000,
            stageControl: true,
            autoRecover: true,
        })) {
            output += chunk;
        }
        assert.equal(sent.length, 3);
        assert.equal(output.length, 11800);
        assert.ok(Math.abs(output.length - 12000) <= 1000);

        sent.length = 0;
        globalThis.fetch = async (_url, init) => {
            sent.push(JSON.parse(String(init?.body)));
            return sseResponse(sent.length === 1 ? '甲'.repeat(3000) : '乙'.repeat(3000) + '\n全文完', 'stop');
        };
        let stoppedOutput = '';
        for await (const chunk of generateTextStream('仿写', {
            model: 'deepseek-chat',
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 32768,
            targetChars: 12000,
            enforceTargetLength: false,
            stageControl: true,
            autoRecover: true,
        })) {
            stoppedOutput += chunk;
        }
        assert.equal(sent.length, 2);
        assert.ok(stoppedOutput.endsWith('全文完'));
    } finally { globalThis.fetch = originalFetch; }
});

