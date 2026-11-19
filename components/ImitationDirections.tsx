import React, { useState, useRef, useEffect } from 'react';
import { generateTextStream, countContentChars, GenerationInterrupted, normalizeClientModel } from '../services/geminiService';
import { ArrowPath, X, Pencil, Check, Plus, Trash, ArrowUturnLeft } from './Icon';
import {
  Direction,
  parsePlansResponse,
  normalizeDirectionDraft,
  formatPlanForGeneration,
  isPlanModified,
  getModelLabel,
} from '../utils/imitationPlan';

type Draft = { text: string; status: string; error?: string; resumable?: boolean };

export default function ImitationDirections({ prompt, options }: { prompt: string; options: any }) {
  const [plans, setPlans] = useState<Direction[]>([]);
  const [originalPlans, setOriginalPlans] = useState<Direction[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [generating, setGenerating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepChars, setPrepChars] = useState(0);
  const [prepElapsed, setPrepElapsed] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Direction | null>(null);
  const [editError, setEditError] = useState('');
  const [savedHintIndex, setSavedHintIndex] = useState<number | null>(null);

  const activeModel = normalizeClientModel(options?.model);
  const [planModel, setPlanModel] = useState<string | null>(null);
  const [verifiedServerModel, setVerifiedServerModel] = useState<string | null>(null);
  const [preparingModel, setPreparingModel] = useState<string | null>(null);

  const busy = generating || preparing;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const controller = useRef<AbortController | null>(null);
  const snapshot = useRef<any>(null);
  const paused = useRef(false);
  const latestOptions = useRef(options);
  const draftOptions = useRef<Record<number, any>>({});
  latestOptions.current = options;

  useEffect(() => {
    setError('');
    if (preparing && !generating && preparingModel && activeModel !== preparingModel) {
      void prepare(activeModel);
    }
  }, [activeModel]);

  useEffect(() => () => {
    controller.current?.abort();
    controllers.current.forEach((c) => c.abort());
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (prepTimer.current) clearInterval(prepTimer.current);
  }, []);

  const copyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(drafts[active].text);
      setCopied(active);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 3000);
    } catch {
      setError('复制失败，请重试。');
    }
  };

  const stopPrepare = () => {
    controller.current?.abort();
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft(null);
    setEditError('');
  };

  const startEdit = (index: number) => {
    if (busy || !plans[index]) return;
    setEditingIndex(index);
    setEditDraft({
      title: plans[index].title,
      summary: plans[index].summary,
      events: [...plans[index].events],
      pace: plans[index].pace,
    });
    setEditError('');
    setSavedHintIndex(null);
  };

  const commitEdit = (): Direction[] | null => {
    if (editingIndex === null || !editDraft) return plans;
    const normalized = normalizeDirectionDraft(editDraft);
    if ('error' in normalized) {
      setEditError(normalized.error);
      return null;
    }
    const nextPlans = plans.map((item, idx) => (idx === editingIndex ? normalized.plan : item));
    setPlans(nextPlans);
    setEditingIndex(null);
    setEditDraft(null);
    setEditError('');
    setSavedHintIndex(editingIndex);
    if (!drafts[editingIndex]) {
      setSelected((prev) => (prev.includes(editingIndex) ? prev : [...prev, editingIndex]));
    }
    return nextPlans;
  };

  const revertPlan = (index: number) => {
    if (busy || !originalPlans[index]) return;
    const restored = {
      ...originalPlans[index],
      events: [...originalPlans[index].events],
    };
    setPlans((prev) => prev.map((item, idx) => (idx === index ? restored : item)));
    setSavedHintIndex(null);
    if (editingIndex === index) {
      setEditDraft(restored);
      setEditError('');
    }
  };

  const handleSelectTab = (index: number) => {
    if (index !== active && editingIndex !== null) {
      cancelEdit();
    }
    setActive(index);
  };

  const prepare = async (overrideModel?: string) => {
    if (generating) return;
    if (!prompt.trim()) {
      setError('请先在左侧输入仿写要求或参考文章后再设计剧情方案。');
      return;
    }
    cancelEdit();
    setSavedHintIndex(null);
    controller.current?.abort();
    const activeOpts = {
      ...latestOptions.current,
      ...(overrideModel ? { model: overrideModel } : {}),
    };
    const normModel = normalizeClientModel(activeOpts.model);
    activeOpts.model = normModel;

    setPreparing(true);
    setPreparingModel(normModel);
    setPrepChars(0);
    setPrepElapsed(0);
    setError('');
    if (prepTimer.current) clearInterval(prepTimer.current);
    const startedAt = Date.now();
    prepTimer.current = setInterval(() => setPrepElapsed(Math.max(1, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    const c = new AbortController();
    controller.current = c;

    const planTokenBudget = normModel === 'deepseek-reasoner' ? 6144 : 4096;
    const planPrompt = `请根据以下仿写任务设计恰好5个差异鲜明的不同剧情走向，不生成正文。
要求：直接输出纯JSON数组（禁止输出Markdown代码块或任何解释文字），内容简练，总输出控制在1200字以内。
每项包含4个字段：title（8～16字标题）、summary（40～80字剧情梗概）、events（3～4条简明关键事件字符串数组）、pace（15～35字节奏安排）。
任务：
${prompt}`;
    let result = '';
    let responseModel = normModel;
    try {
      for await (const chunk of generateTextStream(planPrompt, {
        ...activeOpts,
        maxOutputTokens: Math.min(activeOpts.maxOutputTokens || planTokenBudget, planTokenBudget),
        targetChars: undefined,
        taskPrompt: '设计剧情方案',
        signal: c.signal,
        autoRecover: false,
        onModelUsed: (used) => {
          if (used) responseModel = used;
        },
      })) {
        result += chunk;
        setPrepChars(countContentChars(result));
      }
      const parsed = parsePlansResponse(result);
      const cloned = parsed.map((p: Direction) => ({ ...p, events: [...p.events] }));
      snapshot.current = { prompt, options: { ...activeOpts } };
      draftOptions.current = {};
      setPlans(cloned);
      setOriginalPlans(cloned.map((p: Direction) => ({ ...p, events: [...p.events] })));
      setPlanModel(normModel);
      setVerifiedServerModel(responseModel);
      setSelected([0]);
      setActive(0);
      setDrafts({});
    } catch (e: any) {
      if (!c.signal.aborted && e?.message !== 'Aborted') {
        let recovered = false;
        if (result.trim() && String(e?.message || '').includes('完成确认')) {
          try {
            const fallbackParsed = parsePlansResponse(result);
            const cloned = fallbackParsed.map((p: Direction) => ({ ...p, events: [...p.events] }));
            snapshot.current = { prompt, options: { ...activeOpts } };
            draftOptions.current = {};
            setPlans(cloned);
            setOriginalPlans(cloned.map((p: Direction) => ({ ...p, events: [...p.events] })));
            setPlanModel(normModel);
            setVerifiedServerModel(responseModel);
            setSelected([0]);
            setActive(0);
            setDrafts({});
            recovered = true;
          } catch {
            // keep original interruption error when JSON is incomplete
          }
        }
        if (!recovered) setError(e.message || '方案生成失败');
      }
    } finally {
      if (controller.current === c) {
        if (prepTimer.current) {
          clearInterval(prepTimer.current);
          prepTimer.current = null;
        }
        controller.current = null;
        setPreparing(false);
        setPreparingModel(null);
      }
    }
  };

  const run = async (ids: number[], resume = false, regenerate = false) => {
    if (busy || !snapshot.current) return;
    let activePlans = plans;
    if (editingIndex !== null) {
      const committed = commitEdit();
      if (!committed) return;
      activePlans = committed;
    }
    setGenerating(true);
    paused.current = false;
    setError('');
    setSavedHintIndex(null);
    await Promise.all(
      ids
        .filter((id) => regenerate || resume || !drafts[id])
        .map(async (id) => {
          if (paused.current) return;
          const c = new AbortController();
          controllers.current.add(c);
          let text = resume ? drafts[id]?.text || '' : '';
          const resolvedOptions =
            resume && draftOptions.current[id]
              ? draftOptions.current[id]
              : { ...snapshot.current.options, ...latestOptions.current };
          if (!resume) draftOptions.current[id] = resolvedOptions;
          const update = (status: string, extra: any = {}) =>
            setDrafts((prev) => ({ ...prev, [id]: { text, status, ...extra } }));
          update('正在生成');
          try {
            const confirmedPlan = formatPlanForGeneration(activePlans[id]);
            const task = `${snapshot.current.prompt}\n【最终确认的剧情走向（请严格以此为准进行创作）】\n${confirmedPlan}\n严格按以上确认的剧情走向与关键事件顺序写一篇完整故事，不要擅自偏离已修改的情节，只输出这篇正文。${resolvedOptions.bodyInstruction || ''}`;
            for await (const chunk of generateTextStream(task, {
              ...resolvedOptions,
              taskPrompt: task,
              initialText: text,
              enforceTargetLength: false,
              autoRecover: true,
              stageControl: true,
              signal: c.signal,
              onStatus: (status: string) => update(status),
            })) {
              text += chunk;
              update('正在生成');
            }
            update('已完成');
            setSelected((prev) => prev.filter((value) => value !== id));
          } catch (e: any) {
            update(c.signal.aborted ? '已暂停' : '生成中断', {
              error: c.signal.aborted ? undefined : e.message,
              resumable:
                c.signal.aborted ||
                Boolean(text.trim()) ||
                (e instanceof GenerationInterrupted && e.recoverable),
            });
          } finally {
            controllers.current.delete(c);
          }
        })
    );
    setGenerating(false);
  };

  const activePlan = plans[active];
  const activeModified = isPlanModified(activePlan, originalPlans[active]);
  const isEditingActive = editingIndex === active && editDraft !== null;
  const activeModelLabel = getModelLabel(activeModel);
  const planModelLabel = planModel ? getModelLabel(planModel) : '';
  const modelChangedSincePlans = Boolean(plans.length > 0 && planModel && planModel !== activeModel && !preparing);

  return (
    <section className="p-6 space-y-5 h-full overflow-auto bg-slate-50 dark:bg-gray-950">
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold">选择剧情走向</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300">
              当前模型：{activeModelLabel}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            先看脉络并按需编辑微调剧情，确认后再开始仿写；切换左侧模型或修改内容后，点击右侧按钮即可用当前模型重新设计方案。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={generating || (preparing && preparingModel === activeModel)}
            onClick={() => void prepare()}
            className="transition-all active:scale-95 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-900 px-4 py-2 font-medium flex items-center gap-2 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {preparing && <ArrowPath className="w-4 h-4 animate-spin text-sky-600" />}
            <span>
              {preparing
                ? preparingModel && preparingModel !== activeModel
                  ? `改用 ${activeModelLabel} 重新设计`
                  : plans.length
                  ? `正在用 ${activeModelLabel} 重新设计…`
                  : `正在用 ${activeModelLabel} 设计方案…`
                : plans.length
                ? modelChangedSincePlans
                  ? `用 ${activeModelLabel} 重新设计方案`
                  : '重新设计方案'
                : '生成5个剧情方案'}
            </span>
          </button>
          {preparing && (
            <button
              type="button"
              onClick={stopPrepare}
              className="transition-transform active:scale-95 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-3 py-2 text-sm font-medium flex items-center gap-1 hover:bg-rose-100"
            >
              <X className="w-4 h-4" />
              取消
            </button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            disabled={generating}
            onClick={() => void prepare()}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 flex-shrink-0"
          >
            用 {activeModelLabel} 重试
          </button>
        </div>
      )}

      {modelChangedSincePlans && (
        <div
          role="status"
          className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <span className="text-sky-900 dark:text-sky-200">
            模型已切换为 <strong>{activeModelLabel}</strong>（当前显示的方案由 {planModelLabel} 生成）
          </span>
          <button
            type="button"
            disabled={generating}
            onClick={() => void prepare()}
            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
          >
            立即用 {activeModelLabel} 重新生成方案
          </button>
        </div>
      )}

      {!modelChangedSincePlans && plans.length > 0 && planModel && !preparing && (
        <p className="text-xs text-gray-500">
          当前 5 个方案已由 <strong>{planModelLabel}</strong>
          {verifiedServerModel && verifiedServerModel !== planModel ? `（实际调用：${verifiedServerModel}）` : ''} 生成
        </p>
      )}

      {preparing && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/40 px-5 py-4 space-y-2 animate-fade-in"
        >
          <div className="flex items-center justify-between gap-3 text-sm font-medium text-sky-800 dark:text-sky-200">
            <div className="flex items-center gap-2.5">
              <ArrowPath className="w-4 h-4 animate-spin text-sky-600 flex-shrink-0" />
              <span>
                {prepChars > 0
                  ? `正在使用 ${getModelLabel(preparingModel || activeModel)} 生成 5 个剧情方案…（已接收 ${prepChars} 字 · ${prepElapsed}s）`
                  : `正在使用 ${getModelLabel(preparingModel || activeModel)} 分析并设计 5 个剧情方案…（已耗时 ${prepElapsed}s）`}
              </span>
            </div>
            <span className="text-xs text-sky-600 dark:text-sky-400">完成后将自动刷新方案</span>
          </div>
          <div className="w-full h-1.5 bg-sky-100 dark:bg-sky-900/60 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-sky-500 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {preparing && plans.length === 0 && (
        <div aria-hidden="true" className="grid grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 animate-pulse"
            >
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {plans.length > 0 && activePlan && (
        <div className={`space-y-5 transition-opacity ${preparing ? 'opacity-45 pointer-events-none select-none' : ''}`}>
          <div role="tablist" aria-label="剧情方案" className="grid grid-cols-5 gap-3">
            {plans.map((p, i) => {
              const customized = isPlanModified(p, originalPlans[i]);
              return (
                <button
                  key={i}
                  role="tab"
                  aria-selected={active === i}
                  onClick={() => handleSelectTab(i)}
                  className={`rounded-2xl border p-4 text-left transition-all motion-safe:active:scale-95 motion-safe:hover:-translate-y-1 motion-safe:hover:scale-105 focus-visible:ring-2 ring-sky-500 ${
                    drafts[i]?.status === '已完成'
                      ? `bg-yellow-100 border-yellow-300 text-yellow-950 ${active === i ? 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.55)]' : ''}`
                      : active === i
                      ? 'bg-sky-100 border-sky-500 text-sky-900'
                      : 'bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span>
                      方案 {i + 1} · {drafts[i]?.status || '待生成'}
                    </span>
                    {customized && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                        已微调
                      </span>
                    )}
                  </div>
                  <strong className="block mt-2">{p.title}</strong>
                  <span className="block mt-2 text-xs">{selected.includes(i) ? '✓ 已选择' : '未选择'}</span>
                </button>
              );
            })}
          </div>

          <article role="tabpanel" className="p-6 bg-white dark:bg-gray-900 rounded-2xl border space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-lg font-bold">
                  {isEditingActive ? `编辑方案 ${active + 1}` : activePlan.title}
                </h4>
                {activeModified && !isEditingActive && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    已手动微调
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isEditingActive ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={commitEdit}
                      className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      确认修改
                    </button>
                  </>
                ) : (
                  <>
                    {activeModified && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => revertPlan(active)}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <ArrowUturnLeft className="w-3.5 h-3.5" />
                        恢复原方案
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(active)}
                      className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 px-3 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Pencil className="w-4 h-4" />
                      编辑方案
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditingActive ? (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">方案标题</label>
                  <input
                    type="text"
                    value={editDraft.title}
                    onChange={(e) => {
                      setEditError('');
                      setEditDraft({ ...editDraft, title: e.target.value });
                    }}
                    placeholder="输入方案标题..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">剧情梗概</label>
                  <textarea
                    rows={3}
                    value={editDraft.summary}
                    onChange={(e) => {
                      setEditError('');
                      setEditDraft({ ...editDraft, summary: e.target.value });
                    }}
                    placeholder="修改这段剧情的核心矛盾与故事走向..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">主要事件（AI 将按顺序展开）</label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditDraft({
                          ...editDraft,
                          events: [...editDraft.events, ''],
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加事件
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editDraft.events.map((ev, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                        <input
                          type="text"
                          value={ev}
                          onChange={(e) => {
                            setEditError('');
                            const nextEvents = editDraft.events.map((item, i) => (i === idx ? e.target.value : item));
                            setEditDraft({ ...editDraft, events: nextEvents });
                          }}
                          placeholder={`输入第 ${idx + 1} 条关键事件...`}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          type="button"
                          disabled={editDraft.events.length <= 1}
                          onClick={() => {
                            if (editDraft.events.length <= 1) return;
                            setEditDraft({
                              ...editDraft,
                              events: editDraft.events.filter((_, i) => i !== idx),
                            });
                          }}
                          title="删除此事件"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">节奏安排</label>
                  <input
                    type="text"
                    value={editDraft.pace}
                    onChange={(e) => {
                      setEditError('');
                      setEditDraft({ ...editDraft, pace: e.target.value });
                    }}
                    placeholder="例如：开篇快速入局，中段层层反转，结尾干脆收束..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {editError && (
                  <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                    {editError}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="leading-relaxed">{activePlan.summary}</p>
                <div>
                  <strong>主要事件</strong>
                  <ol className="list-decimal pl-6 mt-1 space-y-1">
                    {activePlan.events.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ol>
                </div>
                <p>
                  <strong>节奏：</strong>
                  {activePlan.pace}
                </p>
                {savedHintIndex === active && (
                  <div
                    role="status"
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                  >
                    ✓ 已确认剧情微调，接下来点击下方「{drafts[active] ? '重新生成当前篇' : '开始仿写'}」将严格按修改后的剧情进行创作。
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-400">
                    想调整结局、人物冲突或事件顺序？可点击右上角「编辑方案」微调后再生成
                  </span>
                  <button
                    type="button"
                    aria-pressed={selected.includes(active)}
                    disabled={busy || !!drafts[active]}
                    onClick={() =>
                      setSelected((prev) => (prev.includes(active) ? prev.filter((i) => i !== active) : [...prev, active]))
                    }
                    className={`min-h-[44px] rounded-xl border px-4 py-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected.includes(active)
                        ? 'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {selected.includes(active) ? '✓ 已选择此剧情' : '选择此剧情'}
                  </button>
                </div>
              </>
            )}
          </article>

          <div className="flex flex-wrap gap-3">
            {generating ? (
              <button
                onClick={() => {
                  paused.current = true;
                  controller.current?.abort();
                  controllers.current.forEach((c) => c.abort());
                }}
                className="transition-transform active:scale-95 bg-rose-500 text-white rounded-xl px-5 py-3"
              >
                停止生成
              </button>
            ) : (
              <>
                <button
                  disabled={busy || !selected.some((id) => !drafts[id])}
                  onClick={() => run(selected)}
                  className="transition-transform active:scale-95 bg-sky-600 text-white rounded-xl px-5 py-3 disabled:opacity-50"
                >
                  {isEditingActive && selected.includes(active) && !drafts[active]
                    ? `确认剧情并开始仿写 · 待生成 ${selected.filter((id) => !drafts[id]).length} 篇`
                    : `开始仿写 · 待生成 ${selected.filter((id) => !drafts[id]).length} 篇`}
                </button>
                {drafts[active]?.resumable && (
                  <button
                    disabled={busy}
                    onClick={() => run([active], true)}
                    className="transition-transform active:scale-95 rounded-xl border px-5 disabled:opacity-50"
                  >
                    继续生成当前篇
                  </button>
                )}
                {drafts[active] && (
                  <button
                    disabled={busy}
                    onClick={() => run([active], false, true)}
                    className="transition-transform active:scale-95 rounded-xl border px-5 disabled:opacity-50"
                  >
                    {isEditingActive ? '确认修改并重新生成当前篇' : '重新生成当前篇'}
                  </button>
                )}
              </>
            )}
          </div>

          {drafts[active] && (
            <div className="rounded-2xl bg-white dark:bg-gray-900 p-6 border">
              <h4 className="font-bold mb-3">
                方案 {active + 1} · {activePlan.title} · 仿写正文
              </h4>
              <p role="status" className="text-sky-600">
                {drafts[active].status === '已完成' ? '' : `${drafts[active].status} · `}
                已生成 {countContentChars(drafts[active].text)} 字
                {drafts[active].status === '正在生成' ? ' · 请稍候…' : ''}
              </p>
              {drafts[active].error && (
                <p role="alert" className="text-amber-700">
                  {drafts[active].error}
                </p>
              )}
              <div className="my-3 flex items-center gap-3">
                <button
                  onClick={copyCurrent}
                  className="min-h-[44px] border rounded-xl px-4 py-2 transition-all active:scale-95 hover:bg-sky-50 focus-visible:ring-2 ring-sky-400"
                >
                  复制当前篇
                </button>
                <span role="status" className="text-sm text-sky-600">
                  {copied === active ? '已复制' : ''}
                </span>
              </div>
              <div className="whitespace-pre-wrap">{drafts[active].text}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
