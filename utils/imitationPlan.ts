export type Direction = { title: string; summary: string; events: string[]; pace: string };

const MODEL_LABELS: Record<string, string> = {
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-4-carbon': 'Gemini 4 Carbon',
  'qwen3.8-flash': '千问 Qwen3.8-Flash',
  'deepseek-chat': 'DeepSeek V4.1 Flash',
  'deepseek-reasoner': 'DeepSeek V4.1 Flash（思考）',
};

export function getModelLabel(model?: string): string {
  if (!model) return '默认模型';
  return MODEL_LABELS[model] || model;
}

export function extractPlansJson(raw: string): unknown {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const cleaned = withoutThink.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      try {
        return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      } catch {
        // fallback to object slice below
      }
    }
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    }
    throw new Error('模型返回格式异常，请点击重新设计方案重试。');
  }
}

export function parsePlansResponse(raw: string): Direction[] {
  const parsed = extractPlansJson(raw);
  let list: unknown = parsed;
  if (!Array.isArray(list) && list && typeof list === 'object') {
    const record = list as Record<string, unknown>;
    const candidate =
      record.plans ??
      record.directions ??
      record.schemes ??
      record.options ??
      record.items ??
      record.data ??
      Object.values(record).find((val) => Array.isArray(val));
    if (Array.isArray(candidate)) {
      list = candidate;
    }
  }

  if (!Array.isArray(list) || list.length !== 5) {
    throw new Error('模型没有返回完整的5个剧情方案，请重新设计方案。');
  }

  return list.map((item: any) => {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';
    const pace = typeof item?.pace === 'string' ? item.pace.trim() : '';
    const events = Array.isArray(item?.events)
      ? item.events.map((ev: any) => (typeof ev === 'string' ? ev.trim() : '')).filter(Boolean)
      : [];

    if (!title || !summary || !pace || events.length === 0) {
      throw new Error('模型没有返回完整的5个剧情方案，请重新设计方案。');
    }

    return { title, summary, events, pace };
  });
}

export function normalizeDirectionDraft(
  draft: Direction
): { ok: true; plan: Direction } | { ok: false; error: string } {
  const title = draft.title.trim();
  const summary = draft.summary.trim();
  const pace = draft.pace.trim();
  const events = draft.events.map((item) => item.trim()).filter(Boolean);

  if (!title) return { ok: false, error: '方案标题不能为空' };
  if (!summary) return { ok: false, error: '剧情梗概不能为空' };
  if (events.length === 0) return { ok: false, error: '请至少保留 1 条主要事件' };
  if (!pace) return { ok: false, error: '节奏安排不能为空' };

  return { ok: true, plan: { title, summary, events, pace } };
}

export function formatPlanForGeneration(plan: Direction): string {
  const eventsText = plan.events.map((event, idx) => `${idx + 1}. ${event}`).join('\n');
  return [
    `方案标题：${plan.title}`,
    `剧情梗概：${plan.summary}`,
    `主要事件（按顺序展开）：\n${eventsText}`,
    `节奏安排：${plan.pace}`,
  ].join('\n');
}

export function isPlanModified(current?: Direction, original?: Direction): boolean {
  if (!current || !original) return false;
  return (
    current.title !== original.title ||
    current.summary !== original.summary ||
    current.pace !== original.pace ||
    current.events.length !== original.events.length ||
    current.events.some((ev, i) => ev !== original.events[i])
  );
}
