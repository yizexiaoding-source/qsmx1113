import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTextBuffer, extractTextFromFile, isManuscriptField } from '../utils/fileText.ts';
import { normalizeDirectionDraft, formatPlanForGeneration, isPlanModified, parsePlansResponse } from '../utils/imitationPlan.ts';
import { generateTextStream } from '../services/geminiService.ts';

test('manuscript field detection targets novel manuscript fields in imitate mode without cluttering requirements', () => {
  assert.equal(isManuscriptField({ label: '小说原稿', type: 'textarea' }, true, 2), true);
  assert.equal(isManuscriptField({ label: '仿写要求', type: 'textarea' }, true, 2), false);
  assert.equal(isManuscriptField({ label: '故事参考', type: 'textarea' }, true, 1), true);
  assert.equal(isManuscriptField({ label: '主角设定', type: 'text' }, true, 1), false);
});

test('decodeTextBuffer and extractTextFromFile read UTF-8/GBK text files cleanly and reject unsupported binary formats', async () => {
  const utf8File = new File(['\uFEFF第一章\r\n夜雨敲窗。\r\n'], 'novel.txt', { type: 'text/plain' });
  assert.equal(await extractTextFromFile(utf8File), '第一章\n夜雨敲窗。');

  // GBK bytes for "中文测试" (D6 D0 CE C4 B2 E2 CA D4)
  const gbkDecoded = decodeTextBuffer(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]));
  assert.equal(gbkDecoded, '中文测试');

  const legacyDoc = new File(['dummy'], 'old.doc', { type: 'application/msword' });
  await assert.rejects(extractTextFromFile(legacyDoc), /另存为 \.docx 或 \.txt/);

  const emptyFile = new File(['   \n  '], 'empty.txt', { type: 'text/plain' });
  await assert.rejects(extractTextFromFile(emptyFile), /内容为空/);
});

test('plot direction edit normalization validates fields, detects edits, and formats confirmed prompt', () => {
  const original = {
    title: '雪夜反杀',
    summary: '主角在雪夜揭露内鬼并夺回证据。',
    events: ['发现暗门', '对峙拆穿', '雪夜脱身'],
    pace: '前紧后快，干脆收束',
  };
  const editedResult = normalizeDirectionDraft({
    title: '  雪夜双线反转  ',
    summary: '  主角假意中计，实则联合女配反制真凶。 ',
    events: [' 发现暗门 ', '   ', ' 假意妥协 ', ' 公开账本翻盘 '],
    pace: ' 先抑后扬，高潮爆发 ',
  });

  assert.equal(editedResult.ok, true);
  if (!editedResult.ok) return;

  assert.equal(editedResult.plan.title, '雪夜双线反转');
  assert.deepEqual(editedResult.plan.events, ['发现暗门', '假意妥协', '公开账本翻盘']);
  assert.equal(isPlanModified(original, original), false);
  assert.equal(isPlanModified(editedResult.plan, original), true);

  const promptBlock = formatPlanForGeneration(editedResult.plan);
  assert.match(promptBlock, /方案标题：雪夜双线反转/);
  assert.match(promptBlock, /2\. 假意妥协/);
  assert.match(promptBlock, /节奏安排：先抑后扬，高潮爆发/);

  const invalid = normalizeDirectionDraft({ ...original, events: [' ', ''] });
  assert.equal(invalid.ok, false);
});

test('parsePlansResponse parses bare arrays, think-prefixed JSON, and object wrappers into 5 validated plans', () => {
  const sample = Array.from({ length: 5 }, (_, idx) => ({
    title: `方案${idx + 1}`,
    summary: `梗概${idx + 1}`,
    events: [`事件${idx + 1}A`, `事件${idx + 1}B`],
    pace: `节奏${idx + 1}`,
  }));

  const wrapped = `<think>分析中...</think>\n\`\`\`json\n${JSON.stringify({ plans: sample })}\n\`\`\``;
  const parsed = parsePlansResponse(wrapped);
  assert.equal(parsed.length, 5);
  assert.equal(parsed[4].title, '方案5');

  assert.throws(() => parsePlansResponse(JSON.stringify(sample.slice(0, 4))), /完整的5个剧情方案/);
});

test('switching models routes to the real endpoint and reports server X-Model-Used without fake fallback', async () => {
  const saved = globalThis.fetch;
  const recorded: Array<{ url: string; model: string }> = [];
  const models = [
    { model: 'gemini-4-hydrogen', expectedUrl: '/api/gemini', serverUsed: 'gemini-4-hydrogen' },
    { model: 'gemini-4-argon', expectedUrl: '/api/gemini', serverUsed: 'gemini-4-argon' },
    { model: 'gemini-4-carbon', expectedUrl: '/api/gemini', serverUsed: 'gemini-4-carbon' },
    { model: 'qwen3.8-flash', expectedUrl: '/api/deepseek', serverUsed: 'qwen3.8-flash' },
    { model: 'deepseek-chat', expectedUrl: '/api/deepseek', serverUsed: 'deepseek-v4.1-flash-1017' },
  ];

  try {
    for (const item of models) {
      let reportedUsed = '';
      globalThis.fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        recorded.push({ url: String(url), model: body.model });
        if (String(url) === '/api/gemini') {
          return new Response(
            `${JSON.stringify({ type: 'text', text: '方案内容' })}\n${JSON.stringify({ type: 'finish', reason: 'STOP' })}\n`,
            { headers: { 'Content-Type': 'application/x-ndjson', 'X-Model-Used': item.serverUsed } }
          );
        }
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: '方案内容' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream', 'X-Model-Used': item.serverUsed } }
        );
      };

      let out = '';
      for await (const chunk of generateTextStream('设计剧情方案', {
        model: item.model,
        temperature: 1,
        topP: 0.95,
        autoRecover: false,
        onModelUsed: (used) => {
          reportedUsed = used;
        },
      })) {
        out += chunk;
      }
      assert.equal(out, '方案内容');
      assert.equal(reportedUsed, item.serverUsed);
    }

    assert.deepEqual(
      recorded,
      models.map((m) => ({ url: m.expectedUrl, model: m.model }))
    );
  } finally {
    globalThis.fetch = saved;
  }
});
