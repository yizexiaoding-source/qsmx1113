export type PolishMode = 'light' | 'deep' | 'editorial';
export type PolishScope = 'full' | 'selection';

export interface PolishFocusOption {
  id: string;
  label: string;
  description: string;
}

export const LIGHT_POLISH_FOCUSES: PolishFocusOption[] = [
  { id: 'trim_fluff', label: '精简空泛修饰', description: '删去缺乏信息量和画面作用的套话、堆砌词' },
  { id: 'reduce_repetition', label: '减少重复表达', description: '合并语义重复的近义表述与冗余过渡句' },
  { id: 'fix_mechanical', label: '调整机械化句式', description: '打散工整过度的模板句，恢复自然书面与叙事语感' },
  { id: 'natural_dialogue', label: '改善对话自然度', description: '去掉生硬说教与冗余动作前缀，贴合人物说话习惯' },
  { id: 'trim_emotion', label: '精简重复的情绪描写', description: '保留有效情绪起伏，精简反复直白的心理解释' },
];

export const EDITORIAL_FOCUSES: PolishFocusOption[] = [
  { id: 'story_appeal', label: '精彩度与开篇钩子', description: '找出平淡乏味处，给出强化悬念钩子、代入感与追读欲的内容增改建议' },
  { id: 'conflict_tension', label: '冲突张力与反转看点', description: '定位对抗偏软、转折不够有力的段落，建议如何拉满博弈感与情节看点' },
  { id: 'character_spark', label: '人物立体感与对话火花', description: '增强角色动机、微表情与对话潜台词，去掉扁平说教感、增强互动记忆点' },
  { id: 'scene_craft', label: '画面感与行文表现力', description: '将干瘪概括的叙述优化为具象镜头、感官细节与自然韵律，避免平铺直叙' },
  { id: 'pacing_emotion', label: '情绪落点与结构节奏', description: '优化铺垫密度、高潮爆发点与结尾余韵，删去拖沓过渡、突出打动人心的节点' },
];

const LEGACY_EDITORIAL_FOCUS_MAP: Record<string, string> = {
  redundancy: 'scene_craft',
  dialogue_voice: 'character_spark',
  emotion: 'pacing_emotion',
  pacing: 'pacing_emotion',
  logic_flow: 'conflict_tension',
};

export interface LightChangeItem {
  id: string;
  startOffset: number;
  endOffset: number;
  original: string;
  revised: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface LightDiffSegment {
  type: 'equal' | 'change';
  text: string;
  changeId?: string;
  change?: LightChangeItem;
}

export type SkeletonCardKey = 'characters' | 'events' | 'conflict' | 'pacing' | 'details' | 'ending';

export interface SkeletonCard {
  key: SkeletonCardKey;
  label: string;
  content: string;
  locked: boolean;
}

export type StorySkeleton = Record<SkeletonCardKey, SkeletonCard>;

export const SKELETON_CARD_META: Array<{ key: SkeletonCardKey; label: string; placeholder: string }> = [
  { key: 'characters', label: '人物与人物关系', placeholder: '主角、重要配角及其核心关系、立场与称谓...' },
  { key: 'events', label: '主要事件与先后顺序', placeholder: '按时间/因果顺序列出核心事件节点...' },
  { key: 'conflict', label: '核心冲突', placeholder: '推动故事发展的核心矛盾与各方诉求...' },
  { key: 'pacing', label: '故事线与节奏', placeholder: '开篇切入点、递进节奏、高潮与收束方式...' },
  { key: 'details', label: '伏笔、关键物件与必须保留的细节', placeholder: '重要伏笔、关键道具、约定信息或特定意象...' },
  { key: 'ending', label: '原稿结局', placeholder: '故事最终的结局走向与人物落点...' },
];

export interface DeviationNote {
  id: string;
  fieldLabel: string;
  paragraphExcerpt: string;
  note: string;
}

export type EditorialStatus = 'pending' | 'accepted' | 'kept';

export interface EditorialSuggestionItem {
  id: string;
  category: string;
  quote: string;
  issue: string;
  reason: string;
  suggestion: string;
  needsAuthorInput: boolean;
  status: EditorialStatus;
  startOffset: number;
  endOffset: number;
  currentStartOffset: number;
  currentEndOffset: number;
}

export interface PolishVersionRecord {
  id: string;
  title: string;
  mode: PolishMode;
  content: string;
  charCount: number;
  modelUsed: string;
  createdAt: string;
  summary: string;
}

export interface LightPolishModeState {
  focuses: string[];
  extraNotes: string;
  targetChars: number;
  rawOutput: string;
  prosePreview: string;
  changes: LightChangeItem[];
  sourceSnapshot: string;
  scopeOffset: number;
  scopeEndOffset: number;
  statusText: string;
  errorText: string;
  errorCategory?: PolishErrorCategory;
  resumable: boolean;
  modelUsed: string;
  hasUnsavedResult: boolean;
}

export interface DeepRewriteModeState {
  step: 'input' | 'skeleton' | 'settings' | 'result';
  skeleton: StorySkeleton | null;
  skeletonStatus: string;
  perspective: string;
  endingPreference: string;
  preserveStyle: boolean;
  customConstraints: string;
  settingChanges: string;
  plotChanges: string;
  styleNotes: string;
  targetChars: number;
  sourceSnapshot?: string;
  scopeOffset?: number;
  scopeEndOffset?: number;
  rewrittenText: string;
  statusText: string;
  errorText: string;
  errorCategory?: PolishErrorCategory;
  resumable: boolean;
  modelUsed: string;
  deviations: DeviationNote[];
  deviationChecked: boolean;
  deviationNotice: string;
  hasUnsavedResult: boolean;
}

export interface EditorialModeState {
  focuses: string[];
  extraNotes: string;
  rawOutput: string;
  suggestions: EditorialSuggestionItem[];
  sourceSnapshot: string;
  workingText: string;
  scopeOffset: number;
  scopeEndOffset: number;
  statusText: string;
  errorText: string;
  errorCategory?: PolishErrorCategory;
  modelUsed: string;
  hasUnsavedResult: boolean;
}

export interface PolishTaskRecord {
  id: string;
  title: string;
  originalText: string;
  updatedAt: string;
  lastMode: PolishMode;
  statusLabel: string;
  scope: PolishScope;
  selectionStart: number;
  selectionEnd: number;
  model: string;
  temperature: number;
  topP: number;
  light: LightPolishModeState;
  deep: DeepRewriteModeState;
  editorial: EditorialModeState;
  versions: PolishVersionRecord[];
}

export type PolishErrorCategory = 'network' | 'busy' | 'auth_quota' | 'unknown';

export function classifyPolishError(rawMsg: string): {
  category: PolishErrorCategory;
  title: string;
  detail: string;
} {
  const msg = (rawMsg || '').trim();
  const lower = msg.toLowerCase();

  if (
    /401|403|api_key|invalid_api_key|permission|配置缺失|未配置|密钥|额度|quota|insufficient|resource_exhausted|429/.test(lower)
  ) {
    return {
      category: 'auth_quota',
      title: '权限或额度异常',
      detail: msg || '当前模型密钥未配置、权限不足或额度已达上限，请核对配置或切换其他可用模型。',
    };
  }

  if (
    /502|503|504|overloaded|unavailable|busy|负载|繁忙|拥挤|rate limit/.test(lower)
  ) {
    return {
      category: 'busy',
      title: '服务繁忙',
      detail: msg || '当前模型服务响应拥挤，请稍后重试或切换其他可用模型。',
    };
  }

  if (
    /网络|连接中断|超时|timeout|failed to fetch|network|aborted|未收到完成确认|响应数据中断|未收到模型响应|达到本次输出上限/.test(lower)
  ) {
    return {
      category: 'network',
      title: '连接或生成中断',
      detail: msg || '生成过程中连接中断或响应超时，原稿与已有草稿均已保留。',
    };
  }

  return {
    category: 'unknown',
    title: '请求未能完成',
    detail: msg || '本次生成未正常完成，原稿与已有结果已保留，可重试或切换其他模型。',
  };
}

export function createEmptySkeleton(): StorySkeleton {
  return {
    characters: { key: 'characters', label: '人物与人物关系', content: '', locked: false },
    events: { key: 'events', label: '主要事件与先后顺序', content: '', locked: false },
    conflict: { key: 'conflict', label: '核心冲突', content: '', locked: false },
    pacing: { key: 'pacing', label: '故事线与节奏', content: '', locked: false },
    details: { key: 'details', label: '伏笔、关键物件与必须保留的细节', content: '', locked: false },
    ending: { key: 'ending', label: '原稿结局', content: '', locked: false },
  };
}

export function createInitialTask(title = '未命名稿件'): PolishTaskRecord {
  const now = new Date().toISOString();
  return {
    id: `polish-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    originalText: '',
    updatedAt: now,
    lastMode: 'light',
    statusLabel: '待处理',
    scope: 'full',
    selectionStart: 0,
    selectionEnd: 0,
    model: 'deepseek-chat',
    temperature: 0.7,
    topP: 0.9,
    light: {
      focuses: ['trim_fluff', 'reduce_repetition', 'fix_mechanical'],
      extraNotes: '',
      targetChars: 0,
      rawOutput: '',
      prosePreview: '',
      changes: [],
      sourceSnapshot: '',
      scopeOffset: 0,
      scopeEndOffset: 0,
      statusText: '',
      errorText: '',
      resumable: false,
      modelUsed: '',
      hasUnsavedResult: false,
    },
    deep: {
      step: 'input',
      skeleton: null,
      skeletonStatus: '',
      perspective: '保持原稿人称与视角',
      endingPreference: '保持原稿结局',
      preserveStyle: true,
      customConstraints: '',
      settingChanges: '',
      plotChanges: '',
      styleNotes: '',
      targetChars: 0,
      rewrittenText: '',
      statusText: '',
      errorText: '',
      resumable: false,
      modelUsed: '',
      deviations: [],
      deviationChecked: false,
      deviationNotice: '',
      hasUnsavedResult: false,
    },
    editorial: {
      focuses: ['story_appeal', 'conflict_tension', 'scene_craft'],
      extraNotes: '',
      rawOutput: '',
      suggestions: [],
      sourceSnapshot: '',
      workingText: '',
      scopeOffset: 0,
      scopeEndOffset: 0,
      statusText: '',
      errorText: '',
      modelUsed: '',
      hasUnsavedResult: false,
    },
    versions: [],
  };
}

export function getPolishModeLabel(mode: PolishMode): string {
  if (mode === 'light') return '轻度润色';
  if (mode === 'deep') return '深度重写';
  return '编辑建议';
}

export function supportsSamplingParams(model: string): boolean {
  return !model.startsWith('gemini-4-');
}

// ============================================================
// JSON extraction helpers
// ============================================================

export function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function extractBalancedJson(raw: string, openChar: '{' | '[', closeChar: '}' | ']'): string | null {
  const cleaned = stripThinkBlocks(raw)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf(openChar);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }
  return null;
}

// ============================================================
// Mode 1: Light Polish Prompts, Diff & Accept/Reject/Undo
// ============================================================

export const LIGHT_POLISH_NOTES_DELIMITER = '<<<POLISH_NOTES>>>';

export function buildLightPolishPrompt(params: {
  text: string;
  focuses: string[];
  extraNotes?: string;
  targetChars?: number;
}): string {
  const selectedLabels = LIGHT_POLISH_FOCUSES
    .filter((f) => params.focuses.includes(f.id))
    .map((f) => `- ${f.label}：${f.description}`)
    .join('\n');

  const sourceChars = params.text.replace(/\s+/g, '').length;
  const extraNotes = (params.extraNotes || '').trim();
  const targetChars = params.targetChars && params.targetChars > 0 ? params.targetChars : 0;

  const lengthRule = targetChars > 0
    ? `4. 【字数控制】：请将润色后正文全篇字数严格控制在约 ${targetChars} 字（允许 ${Math.ceil(targetChars * 0.9)}～${Math.floor(targetChars * 1.1)} 字），通过精简或合理补足细节达成节奏贴合，严禁无端注水或过度删减核心情节。`
    : `4. 【篇幅收敛】：原文约 ${sourceChars} 字，轻度润色应保持紧凑贴近原文篇幅（通常略微精简至 ${Math.max(1, Math.round(sourceChars * 0.85))}～${Math.max(1, Math.round(sourceChars * 1.05))} 字），严禁无端扩写或堆砌华丽词藻。`;

  const extraSection = extraNotes
    ? `\n【作者补充润色要求（请在保留核心故事前提下认真执行）】\n${extraNotes}\n`
    : '';

  return `你是一位严谨克制的小说文字编辑，正在执行「轻度润色（保留故事，精简表达）」。

【本次润色侧重点】
${selectedLabels || '- 精简空泛修饰、减少重复表达，保持语言自然流畅'}
${extraSection}
【默认必须保留】
1. 完整保留人物关系、关键事件、因果关系与事件先后顺序。
2. 完整保留原稿人称视角、角色口吻与原有结局（除非作者补充要求另有说明）。
3. 完整保留伏笔、线索、关键物件以及有叙事意义的意象。

【润色严格守则】
1. 不要机械删除所有形容词或修饰语，只精简缺乏信息量、对人物塑造与叙事无推进作用的空泛修饰。
2. 保留作者有意设计的节奏、修辞张力与情感停顿；不写成千篇一律的空洞抒情句。
3. 未经作者补充要求允许，严禁擅自新增事件、新增人物、杜撰动作或对话；若发现必须大改或补充信息才顺畅之处，不要擅改原意，留作说明即可。
${lengthRule}
5. 直接输出润色后的完整正文（保持原文分段结构），不要输出“好的，以下为润色结果”等客套开场白。
6. 在全部正文输出结束后的最后，另起一行输出分隔符 ${LIGHT_POLISH_NOTES_DELIMITER}，紧接着输出一个 JSON 数组，记录主要修改对照与原因，格式为：
[{"original":"被修改的原句或片段","revised":"修改后的句子或片段","reason":"简明说明为什么这样改"}]

【待润色正文】
${params.text}`;
}

export interface ParsedLightOutput {
  prose: string;
  notes: Array<{ original: string; revised: string; reason: string }>;
}

export function splitLightPolishOutput(rawOutput: string): ParsedLightOutput {
  const clean = stripThinkBlocks(rawOutput);
  const idx = clean.indexOf(LIGHT_POLISH_NOTES_DELIMITER);
  if (idx === -1) {
    // Also hide incomplete delimiter suffix while streaming
    const partialMarker = clean.lastIndexOf('<<<');
    const prose = partialMarker !== -1 && LIGHT_POLISH_NOTES_DELIMITER.startsWith(clean.slice(partialMarker))
      ? clean.slice(0, partialMarker).trimEnd()
      : clean;
    return { prose, notes: [] };
  }

  const prose = clean.slice(0, idx).trim();
  const tail = clean.slice(idx + LIGHT_POLISH_NOTES_DELIMITER.length).trim();
  let notes: Array<{ original: string; revised: string; reason: string }> = [];
  const jsonStr = extractBalancedJson(tail, '[', ']');
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        notes = parsed
          .filter((n: any) => n && (typeof n.original === 'string' || typeof n.revised === 'string'))
          .map((n: any) => ({
            original: String(n.original || '').trim(),
            revised: String(n.revised || '').trim(),
            reason: String(n.reason || '').trim(),
          }))
          .filter((n) => n.original || n.revised);
      }
    } catch {
      // Ignore malformed trailing notes safely
    }
  }
  return { prose, notes };
}

interface TokenChunk {
  text: string;
  start: number;
  end: number;
}

function splitUnitsWithOffsets(text: string): TokenChunk[] {
  const units: TokenChunk[] = [];
  // Split at sentence endings or newlines while keeping exact UTF-16 offsets
  const re = /[^\n。！？；…!?;]+(?:[。！？；…!?;]+["'”’』」）】]?|[ \t]*\n+|$)|[ \t]*\n+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!match[0]) break;
    units.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return units;
}

function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  // Cap DP size safely; paragraph-first pass guarantees sub-segments remain small
  if (n * m > 250000) {
    // Fallback greedy exact match from edges when a single paragraph has thousands of clauses
    const pairs: Array<[number, number]> = [];
    let bi = 0;
    for (let ai = 0; ai < n && bi < m; ai++) {
      const found = b.indexOf(a[ai], bi);
      if (found !== -1 && found - bi < 20) {
        pairs.push([ai, found]);
        bi = found + 1;
      }
    }
    return pairs;
  }

  const dp = new Int32Array((n + 1) * (m + 1));
  const cols = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    const aItem = a[i];
    const rowOff = i * cols;
    const nextRowOff = (i + 1) * cols;
    for (let j = m - 1; j >= 0; j--) {
      if (aItem === b[j]) {
        dp[rowOff + j] = 1 + dp[nextRowOff + j + 1];
      } else {
        const down = dp[nextRowOff + j];
        const right = dp[rowOff + j + 1];
        dp[rowOff + j] = down >= right ? down : right;
      }
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function matchReasonForChange(
  original: string,
  revised: string,
  notes: Array<{ original: string; revised: string; reason: string }>
): string {
  const origNorm = original.replace(/\s+/g, '');
  const revNorm = revised.replace(/\s+/g, '');
  let bestReason = '';
  let bestScore = 0;

  for (const n of notes) {
    if (!n.reason) continue;
    const nOrig = n.original.replace(/\s+/g, '');
    const nRev = n.revised.replace(/\s+/g, '');
    let score = 0;
    if (nOrig && (origNorm.includes(nOrig) || nOrig.includes(origNorm))) {
      score += Math.min(origNorm.length, nOrig.length) * 2;
    }
    if (nRev && (revNorm.includes(nRev) || nRev.includes(revNorm))) {
      score += Math.min(revNorm.length, nRev.length) * 2;
    }
    if (score > bestScore && score >= 4) {
      bestScore = score;
      bestReason = n.reason;
    }
  }

  if (bestReason) return bestReason;
  if (!revised.trim() && original.trim()) {
    return '精简冗余或重复表达，使语句更干练（对照原文可直接采纳或保留）';
  }
  if (!original.trim() && revised.trim()) {
    return '补充衔接过渡表达以增强句意流畅度（请确认是否符合原意）';
  }
  return '调整局部措辞或句式节奏，减少空泛/机械表达（未改变故事事件）';
}

export function buildLightChanges(
  sourceText: string,
  polishedText: string,
  aiNotes: Array<{ original: string; revised: string; reason: string }> = []
): LightChangeItem[] {
  if (!sourceText || !polishedText || sourceText === polishedText) return [];

  // Two-level alignment: paragraphs first, then sentence units within changed paragraph blocks
  const srcParas = sourceText.split(/(\n+)/);
  const revParas = polishedText.split(/(\n+)/);

  const srcOffsets: number[] = [];
  let cursor = 0;
  for (const p of srcParas) {
    srcOffsets.push(cursor);
    cursor += p.length;
  }

  const paraMatches = lcsPairs(srcParas, revParas);
  const changes: LightChangeItem[] = [];

  let si = 0;
  let ri = 0;
  const pushHunk = (sStartIdx: number, sEndIdx: number, rStartIdx: number, rEndIdx: number) => {
    const srcBlock = srcParas.slice(sStartIdx, sEndIdx).join('');
    const revBlock = revParas.slice(rStartIdx, rEndIdx).join('');
    if (!srcBlock && !revBlock) return;
    if (srcBlock === revBlock) return;

    const blockBaseOffset = sStartIdx < srcOffsets.length ? srcOffsets[sStartIdx] : sourceText.length;
    const srcUnits = splitUnitsWithOffsets(srcBlock);
    const revUnits = splitUnitsWithOffsets(revBlock);
    const unitMatches = lcsPairs(
      srcUnits.map((u) => u.text),
      revUnits.map((u) => u.text)
    );

    let ui = 0;
    let rui = 0;
    const addUnitDiff = (uFrom: number, uTo: number, ruFrom: number, ruTo: number) => {
      const origSeg = srcUnits.slice(uFrom, uTo).map((u) => u.text).join('');
      const revSeg = revUnits.slice(ruFrom, ruTo).map((u) => u.text).join('');
      if (origSeg === revSeg) return;
      const startOffset =
        uFrom < srcUnits.length
          ? blockBaseOffset + srcUnits[uFrom].start
          : uTo > 0
            ? blockBaseOffset + srcUnits[uTo - 1].end
            : blockBaseOffset;
      const endOffset =
        uTo > uFrom
          ? blockBaseOffset + srcUnits[uTo - 1].end
          : startOffset;

      changes.push({
        id: `chg-${changes.length + 1}-${startOffset}`,
        startOffset,
        endOffset,
        original: origSeg,
        revised: revSeg,
        reason: matchReasonForChange(origSeg, revSeg, aiNotes),
        status: 'pending',
      });
    };

    for (const [mSrc, mRev] of unitMatches) {
      if (mSrc > ui || mRev > rui) {
        addUnitDiff(ui, mSrc, rui, mRev);
      }
      ui = mSrc + 1;
      rui = mRev + 1;
    }
    if (ui < srcUnits.length || rui < revUnits.length) {
      addUnitDiff(ui, srcUnits.length, rui, revUnits.length);
    }
  };

  for (const [mSi, mRi] of paraMatches) {
    if (mSi > si || mRi > ri) {
      pushHunk(si, mSi, ri, mRi);
    }
    si = mSi + 1;
    ri = mRi + 1;
  }
  if (si < srcParas.length || ri < revParas.length) {
    pushHunk(si, srcParas.length, ri, revParas.length);
  }

  return changes;
}

export function buildLightDiffSegments(sourceText: string, changes: LightChangeItem[]): LightDiffSegment[] {
  const sorted = [...changes].sort((a, b) => a.startOffset - b.startOffset);
  const segments: LightDiffSegment[] = [];
  let cursor = 0;
  for (const chg of sorted) {
    const start = Math.max(cursor, Math.min(sourceText.length, chg.startOffset));
    const end = Math.max(start, Math.min(sourceText.length, chg.endOffset));
    if (start > cursor) {
      segments.push({ type: 'equal', text: sourceText.slice(cursor, start) });
    }
    segments.push({
      type: 'change',
      text: chg.status === 'rejected' ? chg.original : chg.revised,
      changeId: chg.id,
      change: chg,
    });
    cursor = end;
  }
  if (cursor < sourceText.length) {
    segments.push({ type: 'equal', text: sourceText.slice(cursor) });
  }
  return segments;
}

export function applyLightChangesToText(
  sourceText: string,
  changes: LightChangeItem[],
  mode: 'confirmed' | 'preview_pending' = 'confirmed'
): string {
  const sorted = [...changes].sort((a, b) => a.startOffset - b.startOffset);
  let out = '';
  let cursor = 0;
  for (const chg of sorted) {
    const start = Math.max(cursor, Math.min(sourceText.length, chg.startOffset));
    const end = Math.max(start, Math.min(sourceText.length, chg.endOffset));
    if (start > cursor) {
      out += sourceText.slice(cursor, start);
    }
    const useRevised =
      chg.status === 'accepted' || (mode === 'preview_pending' && chg.status === 'pending');
    out += useRevised ? chg.revised : chg.original;
    cursor = end;
  }
  if (cursor < sourceText.length) {
    out += sourceText.slice(cursor);
  }
  return out;
}

// ============================================================
// Mode 2: Deep Rewrite Prompts & Skeleton / Deviation Parsing
// ============================================================

export function buildExtractSkeletonPrompt(sourceText: string): string {
  return `你是一位严谨的小说结构分析编辑。请完整阅读下方原稿，提取其故事骨架，严格返回一个合法的 JSON 对象（不要输出 Markdown 代码块标记外的任何解释文字）。

JSON 字段要求（必须全部包含且值为中文字符串）：
{
  "characters": "人物与人物关系（含姓名/称呼、核心性格与相互关系）",
  "events": "主要事件与先后顺序（按发生顺序分点简明列出）",
  "conflict": "核心冲突（主人公面对的核心矛盾与阻力）",
  "pacing": "故事线与节奏（开局切入、推进波折、高潮位置与节奏特点）",
  "details": "伏笔、关键物件与必须保留的细节（具体线索、物件或特定意象）",
  "ending": "原稿结局（明确写清结局事件与人物最终状态）"
}

要求：完全忠实于原稿实际内容，原稿未交代的不要杜撰猜想。

【原稿内容】
${sourceText}`;
}

export function parseSkeletonResponse(raw: string): StorySkeleton {
  const jsonStr = extractBalancedJson(raw, '{', '}');
  if (!jsonStr) {
    throw new Error('未能解析出完整故事骨架，请重试或切换其他模型');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('故事骨架返回格式异常，请重新提取');
  }
  const skeleton = createEmptySkeleton();
  for (const meta of SKELETON_CARD_META) {
    const rawVal = parsed?.[meta.key];
    let textVal = '';
    if (Array.isArray(rawVal)) {
      textVal = rawVal.map((item) => String(item).trim()).filter(Boolean).join('\n');
    } else if (typeof rawVal === 'string') {
      textVal = rawVal.trim();
    } else if (rawVal && typeof rawVal === 'object') {
      textVal = JSON.stringify(rawVal);
    }
    skeleton[meta.key] = {
      key: meta.key,
      label: meta.label,
      content: textVal,
      locked: false,
    };
  }
  return skeleton;
}

export function extractCharTargetFromText(text?: string): number | null {
  if (!text || !text.trim()) return null;
  const matches = [...text.matchAll(/([一二三四五六七八九十两\d.]+)\s*(万字|千字|字)/g)];
  const match = matches.at(-1);
  if (!match) return null;
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const n = Number(match[1]) || digits[match[1]];
  if (!Number.isFinite(n) || n <= 0) return null;
  const target = Math.round(n * (match[2] === '万字' ? 10000 : match[2] === '千字' ? 1000 : 1));
  if (target < 300 || target > 30000) return null;
  return target;
}

export interface DeepRewriteExecutionBudget {
  effectiveTargetChars?: number;
  explicitTarget: boolean;
  useStageControl: boolean;
  maxOutputTokens: number;
  minBound: number;
  maxBound: number;
}

/**
 * Computes real execution constraints (targetChars, stageControl, maxOutputTokens)
 * for Deep Rewrite so outputs stay concise and bounded whether the author sets an
 * explicit length, mentions a char limit in customConstraints, or leaves length on auto.
 */
export function computeDeepRewriteExecutionBudget(params: {
  sourceChars: number;
  targetChars: number;
  customConstraints?: string;
}): DeepRewriteExecutionBudget {
  const safeSource = Math.max(100, Math.round(params.sourceChars || 0));
  const explicitFromControl = params.targetChars > 0 ? Math.round(params.targetChars) : null;
  const explicitFromCustom = explicitFromControl ? null : extractCharTargetFromText(params.customConstraints);
  const explicit = explicitFromControl || explicitFromCustom;

  if (explicit) {
    const minBound = Math.ceil(explicit * 0.9);
    const maxBound = Math.floor(explicit * 1.1);
    const maxOutputTokens = Math.min(32768, Math.max(2048, Math.round(maxBound * 1.9) + 2048));
    return {
      effectiveTargetChars: explicit,
      explicitTarget: true,
      useStageControl: explicit >= 3500,
      maxOutputTokens,
      minBound,
      maxBound,
    };
  }

  // No explicit target chosen: anchor tightly near the original manuscript length so models cannot bloat 2-3x.
  const minBound = Math.max(200, Math.round(safeSource * 0.85));
  const maxBound = Math.max(400, Math.round(safeSource * 1.12));
  const maxOutputTokens = Math.min(32768, Math.max(2048, Math.round(maxBound * 1.75) + 1536));
  return {
    effectiveTargetChars: safeSource >= 400 ? safeSource : undefined,
    explicitTarget: false,
    useStageControl: safeSource >= 4500,
    maxOutputTokens,
    minBound,
    maxBound,
  };
}

export function buildDeepRewritePrompt(params: {
  sourceText: string;
  skeleton: StorySkeleton;
  perspective: string;
  endingPreference: string;
  styleNotes: string;
  customConstraints?: string;
  preserveStyle?: boolean;
  settingChanges?: string;
  plotChanges?: string;
  targetChars?: number;
}): string {
  const lockedCards: string[] = [];
  const unlockedCards: string[] = [];

  for (const meta of SKELETON_CARD_META) {
    const item = params.skeleton[meta.key];
    const line = `【${item.label}】\n${item.content || '（作者未补充）'}`;
    if (item.locked) lockedCards.push(line);
    else unlockedCards.push(line);
  }

  const preserveStyle = params.preserveStyle !== false;
  const customConstraints = (params.customConstraints || '').trim();
  const settingChanges = (params.settingChanges || '').trim();
  const plotChanges = (params.plotChanges || '').trim();
  const styleNotes = (params.styleNotes || '').trim();
  const sourceChars = params.sourceText.replace(/\s+/g, '').length;
  const budget = computeDeepRewriteExecutionBudget({
    sourceChars,
    targetChars: params.targetChars || 0,
    customConstraints,
  });

  const lengthInstruction = budget.explicitTarget && budget.effectiveTargetChars
    ? `严格围绕目标字数 ${budget.effectiveTargetChars} 字（允许区间 ${budget.minBound}～${budget.maxBound} 字）精准分配全篇各幕篇幅与叙事节奏；写完主线并收束余韵即止，严禁注水凑字数或超出上限，也严禁草草收尾。`
    : `严格贴近原稿篇幅（原稿约 ${sourceChars} 字，请控制在 ${budget.minBound}～${budget.maxBound} 字以内），绝不允许擅自扩写拉长、反复水词或写成冗长散文。`;

  const voiceInstruction = preserveStyle
    ? '高度保持原稿的文风基调、平实克制的叙事语感、用词习惯、句子长短节奏与人物对话腔调；保留原文有辨识度的神韵与留白感，只重构拖沓、干瘪或机械的部分，绝不洗成浮夸煽情的套话腔。'
    : '按作者自定义的改写方向与补充要求重塑语言气质与叙事风格，仍须保持落笔克制、具体可感，拒绝空洞浮华的辞藻堆砌。';

  return `你是一位功底扎实、文风克制的专业小说作者，正在执行「深度重写」任务：基于作者确认后的故事骨架与自定义方向约束，写出凝练紧凑、自然落地、不浮夸、不注水的新稿。
${customConstraints ? `
【作者自定义改写方向与约束目标（最高优先级，必须逐条严格落实）】
${customConstraints}
` : ''}
【已锁定要素（必须严格遵循，不得擅自更改）】
${lockedCards.length > 0 ? lockedCards.join('\n\n') : '（本次无额外单列锁定卡片，仍须忠于下方已确认骨架）'}

【已确认故事骨架】
${unlockedCards.length > 0 ? unlockedCards.join('\n\n') : '（全部要素均已纳入上方锁定清单）'}

【设定与剧情发展调整（若填写，必须顺畅融入因果并优先落地）】
- 设定调整：${settingChanges || '沿用原稿与骨架设定'}
- 剧情发展调整：${plotChanges || '按上方已确认骨架的事件顺序与走势推进'}

【文风与控字要求】
- 人称与视角：${params.perspective || '保持原稿人称与视角'}
- 结局要求：${params.endingPreference || '保持原稿结局'}
- 文风口径：${voiceInstruction}
- 补充写法要求：${styleNotes || '用具体动作、细节和自然对话推进情节，克制留白，不堆砌形容词'}
- 篇幅与控字：${lengthInstruction}

【去浮夸与严禁冗杂铁律】
1. 坚决去浮夸：严禁堆砌华丽空洞的形容词/四字成语/排比感叹，严禁伪文艺腔、强行抒情和价值升华，严禁滥用“瞳孔骤缩、心脏漏拍、空气仿佛凝固、一股难以言喻的寒意”等陈词滥调。
2. 情绪藏在事里：优先用具体动作、克制神态和有潜台词的对话推进故事，不要替读者做心理总结、情绪旁白或复述前情。
3. 严控篇幅不注水：保持同一篇故事的连续性与因果逻辑，直接展开有效场景，严禁为了“显文采”拉长景物铺垫、同义反复或拼凑第二篇故事。
4. 未经作者在【作者自定义改写方向与约束目标】或【设定与剧情发展调整】中要求改动的部分，不得擅自篡改已锁定的核心关系、关键细节或结局。
5. 直接输出重写后的小说正文，严禁输出任何前言、提纲、修改说明、字数报告或结束感言。

【原稿参照（用于对照文风语感、人物语气与未改动的具体细节）】
${params.sourceText}`;
}

export function buildConsistencyCheckPrompt(params: {
  skeleton: StorySkeleton;
  rewrittenText: string;
}): string {
  const lockedItems = SKELETON_CARD_META
    .map((m) => params.skeleton[m.key])
    .filter((item) => item.locked && item.content.trim());

  const targetItems = lockedItems.length > 0
    ? lockedItems
    : SKELETON_CARD_META.map((m) => params.skeleton[m.key]).filter((item) => item.content.trim());

  return `你是一位严谨的核稿编辑。请核对下方「重写稿」是否遵循了作者确认/锁定的骨架要素，重点排查是否有遗漏、篡改、顺序错乱或结局偏离。

要求：
1. 严格返回 JSON 对象：{"deviations": [{"fieldLabel": "对应要素名称", "paragraphExcerpt": "重写稿中可能偏离的原文片段（不超过60字，如属整体缺失请写明未出现）", "note": "具体偏离说明，供作者核查"}]}。
2. 如果未发现明确偏离，请返回 {"deviations": []}。
3. 不要给出任何百分比分数或评价打分。

【需核查要素】
${targetItems.map((item) => `- ${item.label}${item.locked ? '（已锁定）' : ''}：${item.content}`).join('\n')}

【重写稿正文】
${params.rewrittenText}`;
}

export function parseConsistencyDeviations(raw: string): DeviationNote[] {
  const jsonStr = extractBalancedJson(raw, '{', '}');
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed?.deviations) ? parsed.deviations : [];
    return list
      .filter((d: any) => d && typeof d.note === 'string' && d.note.trim())
      .map((d: any, idx: number) => ({
        id: `dev-${idx + 1}`,
        fieldLabel: String(d.fieldLabel || '骨架要素').trim(),
        paragraphExcerpt: String(d.paragraphExcerpt || '').trim(),
        note: String(d.note || '').trim(),
      }));
  } catch {
    return [];
  }
}

// ============================================================
// Mode 3: Editorial Suggestions Prompts, Quote Anchor & Offset Rebuild
// ============================================================

export function buildEditorialSuggestionsPrompt(params: {
  text: string;
  focuses: string[];
  extraNotes?: string;
}): string {
  const selectedLabels = EDITORIAL_FOCUSES
    .filter((f) => params.focuses.includes(f.id))
    .map((f) => `- ${f.label}：${f.description}`)
    .join('\n');
  const extraNotes = (params.extraNotes || '').trim();

  return `你是一位资深小说内容策划与文学责编，请对下方原稿做「内容精彩度与行文优化建议」，帮助作者提升故事吸引力、情绪张力与文本表现力，并由作者逐条决定采纳或保留。

【任务边界（重要：严禁与“审稿”功能重复）】
- 不要排查错别字、标点笔误、人名同音冲突或原文查重（这些由专门的审稿模块负责）。
- 请聚焦「文章内容性优化」：识别平淡过渡、张力不足、人物互动缺火花、叙述干瘪直白、反转/情绪落点可以更出彩的具体段落，给出能让文章更好看、更有戏的添改建议与示范改写。

【本次重点优化方向】
${selectedLabels || '- 精彩度与开篇钩子、冲突张力与反转看点、人物立体感与对话火花、画面感与行文表现力、情绪落点与结构节奏'}
${extraNotes ? `
【作者自定义优化需求（优先围绕以下目标给出具体、可落地的添改建议）】
${extraNotes}
` : ''}
【输出严格要求】
1. 严格返回一个合法 JSON 数组（不要输出数组以外的任何解释文字），格式如下：
[
  {
    "category": "精彩度与开篇钩子 | 冲突张力与反转看点 | 人物立体感与对话火花 | 画面感与行文表现力 | 情绪落点与结构节奏",
    "quote": "必须从原稿中一字不差截取的连续原文句子或片段（建议 12～90 字，必须能在原文中精确找到）",
    "issue": "指出此处为什么偏平淡/缺张力/行文不够出彩（结合上下文，拒绝空泛套话）",
    "reason": "这样添改后，故事精彩度、画面感或情绪代入感会如何提升",
    "suggestion": "可直接替换 quote 的出彩优化改写稿（保持原稿人称与克制质感，不浮夸）；若属于需要作者补充新设定/新桥段的加戏点子，请写明具体加戏思路并把 needsAuthorInput 设为 true",
    "needsAuthorInput": false
  }
]
2. 禁止泛泛评价或空喊“建议写得更生动”；每条建议必须精准对应原稿中真实存在的连续文字（quote），并给出贴合原文气质的高质量改写示范或具体加戏方案。
3. 若涉及原稿尚未交代的新背景、新隐情或新人物设定，不得把猜测直接当事实硬写进替换稿，应将 needsAuthorInput 设为 true，在 suggestion 中给出 1～2 种可落地的增补方向供作者挑选。
4. 尽量覆盖开篇、中段冲突、人物互动与高潮收束等不同位置，输出 5～12 条高价值、相互不重叠的建议；同时确保每条 quote 互不重叠、按原文先后顺序排列。

【待优化原稿】
${params.text}`;
}

export function locateQuoteInText(
  text: string,
  quote: string,
  preferredStart = 0
): { startOffset: number; endOffset: number } | null {
  const q = quote.trim();
  if (!q || !text) return null;

  // 1. Exact match at or after preferredStart
  const exactAfter = text.indexOf(q, Math.max(0, preferredStart));
  if (exactAfter !== -1) {
    return { startOffset: exactAfter, endOffset: exactAfter + q.length };
  }

  // 2. Exact match anywhere in text
  const exactAny = text.indexOf(q);
  if (exactAny !== -1) {
    return { startOffset: exactAny, endOffset: exactAny + q.length };
  }

  // 3. Whitespace/newline normalized match preserving exact UTF-16 indices in text
  const compactChars: string[] = [];
  const compactToOrig: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!/\s/.test(ch)) {
      compactChars.push(ch);
      compactToOrig.push(i);
    }
  }
  const compactText = compactChars.join('');
  const compactQuote = q.replace(/\s+/g, '');
  if (compactQuote.length >= 4) {
    const idx = compactText.indexOf(compactQuote);
    if (idx !== -1) {
      const startOffset = compactToOrig[idx];
      const endOffset = compactToOrig[idx + compactQuote.length - 1] + 1;
      return { startOffset, endOffset };
    }
  }

  return null;
}

export function parseEditorialSuggestionsResponse(raw: string, sourceText: string): EditorialSuggestionItem[] {
  const jsonStr = extractBalancedJson(raw, '[', ']');
  if (!jsonStr) {
    throw new Error('未能解析出结构化修改建议，请重试或切换其他模型');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('修改建议返回格式异常，请重新获取建议');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('修改建议返回格式不是数组');
  }

  const results: EditorialSuggestionItem[] = [];
  let cursor = 0;

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') continue;
    const quote = String(item.quote || '').trim();
    const issue = String(item.issue || '').trim();
    const reason = String(item.reason || '').trim();
    const suggestion = String(item.suggestion || '').trim();
    const category = String(item.category || '表达建议').trim();
    const needsAuthorInput = Boolean(item.needsAuthorInput);

    if (!quote && !issue) continue;

    const loc = locateQuoteInText(sourceText, quote, cursor);
    const startOffset = loc ? loc.startOffset : -1;
    const endOffset = loc ? loc.endOffset : -1;
    if (loc) cursor = loc.endOffset;

    results.push({
      id: `sug-${i + 1}-${Math.max(0, startOffset)}`,
      category,
      quote: loc ? sourceText.slice(startOffset, endOffset) : quote,
      issue: issue || '建议优化此处的表达与衔接',
      reason: reason || '提升阅读顺畅度与文本表现力',
      suggestion,
      needsAuthorInput,
      status: 'pending',
      startOffset,
      endOffset,
      currentStartOffset: startOffset,
      currentEndOffset: endOffset,
    });
  }

  return results;
}

/**
 * Rebuilds the editorial working text from immutable `baseText` and updates every
 * suggestion's `currentStartOffset` / `currentEndOffset` so accepting or undoing one
 * suggestion never shifts another suggestion onto the wrong paragraph.
 */
export function rebuildEditorialState(
  baseText: string,
  suggestions: EditorialSuggestionItem[]
): { workingText: string; suggestions: EditorialSuggestionItem[] } {
  const located = suggestions
    .filter((s) => s.startOffset >= 0 && s.endOffset >= s.startOffset && s.endOffset <= baseText.length)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const nonOverlappingAccepted = new Map<string, { start: number; end: number; replacement: string }>();
  let acceptedFloor = 0;
  for (const s of located) {
    if (s.status === 'accepted' && !s.needsAuthorInput && s.startOffset >= acceptedFloor) {
      nonOverlappingAccepted.set(s.id, {
        start: s.startOffset,
        end: s.endOffset,
        replacement: s.suggestion,
      });
      acceptedFloor = s.endOffset;
    }
  }

  // Replay edits in ascending order to construct workingText and compute delta before/at each original offset
  let workingText = '';
  let origCursor = 0;
  const appliedEdits = Array.from(nonOverlappingAccepted.values()).sort((a, b) => a.start - b.start);

  for (const edit of appliedEdits) {
    if (edit.start > origCursor) {
      workingText += baseText.slice(origCursor, edit.start);
    }
    workingText += edit.replacement;
    origCursor = edit.end;
  }
  if (origCursor < baseText.length) {
    workingText += baseText.slice(origCursor);
  }

  const mapOrigOffsetToWorking = (origPos: number, isEnd: boolean, selfEdit?: { start: number; end: number; replacement: string }): number => {
    let delta = 0;
    for (const edit of appliedEdits) {
      if (selfEdit && edit.start === selfEdit.start && edit.end === selfEdit.end) {
        if (isEnd) {
          delta += edit.replacement.length - (edit.end - edit.start);
        }
        break;
      }
      if (edit.end <= origPos) {
        delta += edit.replacement.length - (edit.end - edit.start);
      } else if (edit.start < origPos) {
        // Inside an overlapping edit
        const partial = edit.replacement.length - (origPos - edit.start);
        delta += isEnd ? partial : 0;
        break;
      } else {
        break;
      }
    }
    return Math.max(0, Math.min(workingText.length, origPos + delta));
  };

  const updatedSuggestions = suggestions.map((s) => {
    if (s.startOffset < 0 || s.endOffset < s.startOffset) {
      return { ...s, currentStartOffset: -1, currentEndOffset: -1 };
    }
    const selfEdit = nonOverlappingAccepted.get(s.id);
    const currentStartOffset = mapOrigOffsetToWorking(s.startOffset, false, selfEdit);
    const currentEndOffset = mapOrigOffsetToWorking(s.endOffset, true, selfEdit);
    return {
      ...s,
      currentStartOffset,
      currentEndOffset,
    };
  });

  return { workingText, suggestions: updatedSuggestions };
}

// ============================================================
// Scope splice helper: reintegrate edited selection back into full original manuscript
// ============================================================

export function spliceScopeResultIntoFullText(
  fullOriginalText: string,
  scope: PolishScope,
  scopeStart: number,
  scopeEnd: number,
  scopeResultText: string
): string {
  if (scope === 'full') return scopeResultText;
  const safeStart = Math.max(0, Math.min(fullOriginalText.length, scopeStart));
  const safeEnd = Math.max(safeStart, Math.min(fullOriginalText.length, scopeEnd));
  return fullOriginalText.slice(0, safeStart) + scopeResultText + fullOriginalText.slice(safeEnd);
}

// ============================================================
// Local storage persistence (keyed by userId || 'guest')
// ============================================================

export function getPolishStorageKey(userId: string | null): string {
  return `qisimiaoxie_article_polish_tasks_v1_${userId || 'guest'}`;
}

export function normalizePolishTaskRecord(raw: any): PolishTaskRecord {
  const base = createInitialTask(typeof raw?.title === 'string' && raw.title ? raw.title : '未命名稿件');
  const validEditorialIds = new Set(EDITORIAL_FOCUSES.map((f) => f.id));
  const rawEditorialFocuses: string[] = Array.isArray(raw?.editorial?.focuses) ? raw.editorial.focuses : [];
  const mappedEditorialFocuses = Array.from(
    new Set(
      rawEditorialFocuses
        .map((id) => (validEditorialIds.has(id) ? id : LEGACY_EDITORIAL_FOCUS_MAP[id] || ''))
        .filter(Boolean)
    )
  );
  return {
    ...base,
    ...raw,
    light: {
      ...base.light,
      ...(raw?.light || {}),
      extraNotes: typeof raw?.light?.extraNotes === 'string' ? raw.light.extraNotes : '',
      targetChars: typeof raw?.light?.targetChars === 'number' ? raw.light.targetChars : 0,
    },
    deep: {
      ...base.deep,
      ...(raw?.deep || {}),
      preserveStyle: typeof raw?.deep?.preserveStyle === 'boolean' ? raw.deep.preserveStyle : true,
      customConstraints: typeof raw?.deep?.customConstraints === 'string' ? raw.deep.customConstraints : '',
      settingChanges: typeof raw?.deep?.settingChanges === 'string' ? raw.deep.settingChanges : '',
      plotChanges: typeof raw?.deep?.plotChanges === 'string' ? raw.deep.plotChanges : '',
      targetChars: typeof raw?.deep?.targetChars === 'number' ? raw.deep.targetChars : 0,
    },
    editorial: {
      ...base.editorial,
      ...(raw?.editorial || {}),
      focuses: mappedEditorialFocuses.length > 0 ? mappedEditorialFocuses : base.editorial.focuses,
      extraNotes: typeof raw?.editorial?.extraNotes === 'string' ? raw.editorial.extraNotes : '',
      workingText:
        typeof raw?.editorial?.workingText === 'string' && raw.editorial.workingText
          ? raw.editorial.workingText
          : typeof raw?.originalText === 'string'
            ? raw.originalText
            : '',
    },
    versions: Array.isArray(raw?.versions) ? raw.versions : [],
  };
}

export function loadPolishTasks(userId: string | null): PolishTaskRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getPolishStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.originalText === 'string')
      .map((item) => normalizePolishTaskRecord(item));
  } catch {
    return [];
  }
}

export function savePolishTasks(userId: string | null, tasks: PolishTaskRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Keep at most 20 recent real tasks to stay well within localStorage quota
    const trimmed = tasks.slice(0, 20);
    localStorage.setItem(getPolishStorageKey(userId), JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to persist polish tasks locally:', e);
  }
}

export function computeTaskStatusLabel(task: PolishTaskRecord): string {
  const mode = task.lastMode;
  if (task.versions.length > 0 && !task.light.hasUnsavedResult && !task.deep.hasUnsavedResult && !task.editorial.hasUnsavedResult) {
    return `已保存新版本（${task.versions.length}）`;
  }
  if (mode === 'light') {
    if (task.light.errorText) return '轻度润色未完成（已保留）';
    if (task.light.changes.length > 0 || task.light.prosePreview) return '轻度润色待确认';
  }
  if (mode === 'deep') {
    if (task.deep.errorText) return '深度重写未完成（已保留）';
    if (task.deep.rewrittenText) return '深度重写已完成';
    if (task.deep.skeleton) return '骨架待确认';
  }
  if (mode === 'editorial') {
    if (task.editorial.errorText) return '编辑建议未完成';
    if (task.editorial.suggestions.length > 0) return '编辑建议处理中';
  }
  if (task.originalText.trim()) return '原稿已导入';
  return '待处理';
}

export function deriveTitleFromText(text: string, fallback = '未命名稿件'): string {
  const firstLine = text
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  if (!firstLine) return fallback;
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
}
