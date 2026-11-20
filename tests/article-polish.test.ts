import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitLightPolishOutput,
  buildLightChanges,
  buildLightDiffSegments,
  applyLightChangesToText,
  parseSkeletonResponse,
  buildDeepRewritePrompt,
  parseConsistencyDeviations,
  locateQuoteInText,
  parseEditorialSuggestionsResponse,
  rebuildEditorialState,
  classifyPolishError,
  spliceScopeResultIntoFullText,
  supportsSamplingParams,
  createInitialTask,
} from '../utils/articlePolishEngine.ts';

test('splitLightPolishOutput strips think blocks, hides partial streaming delimiter, and parses notes', () => {
  const streaming = '<think>思考中</think>夜雨淅沥。<<<POLISH_';
  const partial = splitLightPolishOutput(streaming);
  assert.equal(partial.prose, '夜雨淅沥。');
  assert.deepEqual(partial.notes, []);

  const complete =
    '夜雨淅沥。\n她推开门。\n<<<POLISH_NOTES>>>\n[{"original":"淅淅沥沥地不停下着雨。","revised":"夜雨淅沥。","reason":"精简冗余重复描述"}]';
  const parsed = splitLightPolishOutput(complete);
  assert.equal(parsed.prose, '夜雨淅沥。\n她推开门。');
  assert.equal(parsed.notes.length, 1);
  assert.equal(parsed.notes[0].reason, '精简冗余重复描述');
});

test('light polish changes support single accept, reject, undo, and confirmed/preview reconstruction', () => {
  const orig = '天空中下着非常非常大的暴雨。\n林深推开沉重的木门走了进去。';
  const polished = '天空中倾泻着暴雨。\n林深推开木门走了进去。';
  const notes = [
    { original: '非常非常大的暴雨', revised: '倾泻着暴雨', reason: '删去空泛程度副词' },
    { original: '沉重的木门', revised: '木门', reason: '精简不必要形容词' },
  ];

  const changes = buildLightChanges(orig, polished, notes);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].reason, '删去空泛程度副词');
  assert.equal(changes[1].reason, '精简不必要形容词');

  // Pending state -> preview_pending gives polished, confirmed gives original
  assert.equal(applyLightChangesToText(orig, changes, 'preview_pending'), polished);
  assert.equal(applyLightChangesToText(orig, changes, 'confirmed'), orig);

  // Accept only first change, reject second
  const mixed = changes.map((c, idx) => ({
    ...c,
    status: (idx === 0 ? 'accepted' : 'rejected') as 'accepted' | 'rejected',
  }));
  const mixedResult = applyLightChangesToText(orig, mixed, 'confirmed');
  assert.equal(mixedResult, '天空中倾泻着暴雨。\n林深推开沉重的木门走了进去。');

  // Diff segments cover the full text cleanly
  const segments = buildLightDiffSegments(orig, mixed);
  assert.ok(segments.some((s) => s.type === 'change' && s.change?.status === 'accepted'));
  assert.ok(segments.some((s) => s.type === 'change' && s.change?.status === 'rejected'));
});

test('deep rewrite parses skeleton with locked fields separated in rewrite prompt and parses deviations without scores', () => {
  const rawSkeleton = `<think>分析骨架</think>
\`\`\`json
{
  "characters": "林深（侦探）、苏宁（证人）",
  "events": ["1. 雨夜会面", "2. 发现旧钥匙"],
  "conflict": "二人互不信任",
  "pacing": "先抑后扬",
  "details": "铜钥匙上的刻痕 1998",
  "ending": "林深独自走入雨幕"
}
\`\`\``;
  const skeleton = parseSkeletonResponse(rawSkeleton);
  assert.equal(skeleton.characters.content, '林深（侦探）、苏宁（证人）');
  assert.equal(skeleton.events.content, '1. 雨夜会面\n2. 发现旧钥匙');
  assert.equal(skeleton.ending.locked, false);

  skeleton.details.locked = true;
  skeleton.ending.locked = true;
  const prompt = buildDeepRewritePrompt({
    sourceText: '原文示例',
    skeleton,
    perspective: '第三人称限知视角',
    endingPreference: '保持原稿结局',
    styleNotes: '动作描写克制冷峻',
  });
  assert.ok(prompt.includes('【已锁定要素（必须严格遵循，不得擅自更改）】'));
  assert.ok(prompt.includes('铜钥匙上的刻痕 1998'));
  assert.ok(prompt.includes('林深独自走入雨幕'));

  const devs = parseConsistencyDeviations(
    '{"deviations":[{"fieldLabel":"原稿结局","paragraphExcerpt":"两人相视一笑留在了屋里","note":"结局与锁定的林深独自离开不符"}]}'
  );
  assert.equal(devs.length, 1);
  assert.equal(devs[0].fieldLabel, '原稿结局');
});

test('editorial suggestions locate quotes, preserve needsAuthorInput, and shift remaining offsets dynamically on accept/undo', () => {
  const source = '第一段话很啰嗦很啰嗦地写了许多废话。第二段对话说：“我今天其实非常非常开心吧。”结尾未知线索待补。';
  const rawAI = JSON.stringify([
    {
      category: '冗余表达',
      quote: '很啰嗦很啰嗦地写了许多废话',
      issue: '重复堆砌“很啰嗦”',
      reason: '删减车轱辘话更利落',
      suggestion: '拖沓地铺陈了不少闲笔',
      needsAuthorInput: false,
    },
    {
      category: '对话与人物口吻',
      quote: '我今天其实非常非常开心吧',
      issue: '情绪副词过多且语气迟疑',
      reason: '让角色口吻更自然',
      suggestion: '我今天挺高兴的',
      needsAuthorInput: false,
    },
    {
      category: '逻辑与衔接',
      quote: '结尾未知线索待补',
      issue: '未交代该线索来自何处',
      reason: '需作者明确设定来源而非猜测编造',
      suggestion: '请补充这枚线索是由哪位角色在何时留下的？',
      needsAuthorInput: true,
    },
  ]);

  const parsed = parseEditorialSuggestionsResponse(rawAI, source);
  assert.equal(parsed.length, 3);
  assert.ok(parsed[0].startOffset >= 0);
  assert.ok(parsed[1].startOffset > parsed[0].endOffset);
  assert.equal(parsed[2].needsAuthorInput, true);

  // Accept suggestion 0 and mark suggestion 2 as accepted (should be ignored because needsAuthorInput=true)
  const acceptedFirst = parsed.map((s, idx) => ({
    ...s,
    status: (idx === 0 || idx === 2 ? 'accepted' : 'pending') as 'accepted' | 'pending',
  }));
  const rebuilt = rebuildEditorialState(source, acceptedFirst);
  assert.ok(rebuilt.workingText.includes('拖沓地铺陈了不少闲笔'));
  // Ensure suggestion 2 was NOT written into workingText automatically
  assert.ok(rebuilt.workingText.includes('结尾未知线索待补'));

  // Verify suggestion 1's currentStartOffset shifted accurately in workingText
  const sug1 = rebuilt.suggestions[1];
  assert.equal(
    rebuilt.workingText.slice(sug1.currentStartOffset, sug1.currentEndOffset),
    '我今天其实非常非常开心吧'
  );

  // Undo suggestion 0 restores exact original offsets
  const undone = rebuildEditorialState(
    source,
    rebuilt.suggestions.map((s) => ({ ...s, status: 'pending' as const }))
  );
  assert.equal(undone.workingText, source);
  assert.equal(undone.suggestions[1].currentStartOffset, undone.suggestions[1].startOffset);
});

test('locateQuoteInText matches whitespace-shifted quotes accurately', () => {
  const source = '甲句。\n  乙句在这里  。\n丙句。';
  const loc = locateQuoteInText(source, '乙句在这里');
  assert.ok(loc);
  assert.equal(source.slice(loc!.startOffset, loc!.endOffset), '乙句在这里');
});

test('classifyPolishError categorizes auth/quota, busy, and network interruptions truthfully', () => {
  assert.equal(classifyPolishError('模型请求失败（500：百炼配置缺失）').category, 'auth_quota');
  assert.equal(classifyPolishError('HTTP 429 Too Many Requests / quota exceeded').category, 'auth_quota');
  assert.equal(classifyPolishError('503 Service Unavailable 繁忙').category, 'busy');
  assert.equal(classifyPolishError('连接结束但未收到完成确认，草稿已保留').category, 'network');
});

test('spliceScopeResultIntoFullText splices selection edits cleanly back into full manuscript', () => {
  const full = '前文部分。中间需要改写的段落。后文部分。';
  const start = full.indexOf('中间需要改写的段落。');
  const end = start + '中间需要改写的段落。'.length;
  const spliced = spliceScopeResultIntoFullText(full, 'selection', start, end, '精修后的中段。');
  assert.equal(spliced, '前文部分。精修后的中段。后文部分。');
  assert.equal(spliceScopeResultIntoFullText(full, 'full', start, end, '全文结果'), '全文结果');
});

test('sampling params availability and initial task defaults reflect real backend support', () => {
  assert.equal(supportsSamplingParams('gemini-4-hydrogen'), false);
  assert.equal(supportsSamplingParams('gemini-4-argon'), false);
  assert.equal(supportsSamplingParams('qwen3.8-flash'), true);
  assert.equal(supportsSamplingParams('deepseek-chat'), true);
  const task = createInitialTask('测试文稿');
  assert.equal(task.title, '测试文稿');
  assert.equal(task.versions.length, 0);
});
