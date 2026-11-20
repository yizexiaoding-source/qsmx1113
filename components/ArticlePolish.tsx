import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  PaintBrush,
  Sparkles,
  Pencil,
  ClipboardDocumentCheck,
  ChevronDoubleLeft,
  CloudArrowUp,
  Database,
  BookOpen,
  Trash,
  Copy,
  Check,
  Stop,
  Play,
  ArrowPath,
  AdjustmentsHorizontal,
  InformationCircle,
  ExclamationCircle,
  ArrowUturnLeft,
  FloppyDisk,
  LockClosed,
  LockOpen,
  Eye,
} from './Icon';
import { ALL_MODEL_OPTIONS } from '../constants';
import CustomSelect from './CustomSelect';
import TargetLength from './TargetLength';
import SaveToCreationModal from './SaveToCreationModal';
import PolishImportModal from './polish/PolishImportModal';
import PolishHistoryModal from './polish/PolishHistoryModal';
import {
  generateTextStream,
  countContentChars,
  GenerationInterrupted,
  normalizeClientModel,
} from '../services/geminiService';
import { getCurrentUserId, saveMaterial } from '../services/supabaseService';
import { extractTextFromFile } from '../utils/fileText';
import { splitReviewText, scrollToTextOffset } from '../utils/reviewPosition';
import {
  PolishMode,
  PolishTaskRecord,
  PolishVersionRecord,
  SkeletonCardKey,
  SKELETON_CARD_META,
  LIGHT_POLISH_FOCUSES,
  EDITORIAL_FOCUSES,
  createInitialTask,
  getPolishModeLabel,
  supportsSamplingParams,
  classifyPolishError,
  buildLightPolishPrompt,
  splitLightPolishOutput,
  buildLightChanges,
  buildLightDiffSegments,
  applyLightChangesToText,
  buildExtractSkeletonPrompt,
  parseSkeletonResponse,
  buildDeepRewritePrompt,
  buildConsistencyCheckPrompt,
  parseConsistencyDeviations,
  buildEditorialSuggestionsPrompt,
  parseEditorialSuggestionsResponse,
  rebuildEditorialState,
  spliceScopeResultIntoFullText,
  loadPolishTasks,
  savePolishTasks,
  computeTaskStatusLabel,
  deriveTitleFromText,
  stripThinkBlocks,
} from '../utils/articlePolishEngine';

interface ArticlePolishProps {
  isActive: boolean;
  onSendToImitate: (content: string, title: string) => void;
  onUnsavedStateChange?: (hasUnsaved: boolean) => void;
}

const PERSPECTIVE_OPTIONS = [
  '保持原稿人称与视角',
  '第一人称（“我”视角）',
  '第三人称限知视角',
  '第三人称全知视角',
];

const ENDING_OPTIONS = [
  '保持原稿结局',
  '保留结局事件，强化余韵表达',
  '按补充要求调整结局呈现',
];

const ArticlePolish: React.FC<ArticlePolishProps> = ({
  isActive,
  onSendToImitate,
  onUnsavedStateChange,
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [tasks, setTasks] = useState<PolishTaskRecord[]>([]);
  const [activeTask, setActiveTask] = useState<PolishTaskRecord | null>(null);
  const [pageView, setPageView] = useState<'home' | 'workspace'>('home');
  const [selectedHomeMode, setSelectedHomeMode] = useState<PolishMode | null>(null);
  const [activeMode, setActiveMode] = useState<PolishMode>('light');

  // Common Workspace Controls
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [saveCreationModal, setSaveCreationModal] = useState<{ open: boolean; content: string }>({
    open: false,
    content: '',
  });
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [mobilePane, setMobilePane] = useState<'original' | 'result'>('original');

  // Unsaved & Overwrite Confirmation Modals
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Generation Runtime State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState('');
  const [generatingChars, setGeneratingChars] = useState(0);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastDeepPromptRef = useRef<{ prompt: string; targetChars?: number; model: string; temperature: number; topP: number } | null>(null);
  const lastLightPromptRef = useRef<{ prompt: string; model: string; temperature: number; topP: number } | null>(null);

  // Mode-specific interactive UI states
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [deepCompareTab, setDeepCompareTab] = useState<'split' | 'skeleton' | 'result'>('split');
  const [editorialViewTab, setEditorialViewTab] = useState<'locate' | 'edit'>('locate');
  const [editorialFilter, setEditorialFilter] = useState<'all' | 'pending' | 'accepted' | 'kept'>('all');
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const [editorialDocView, setEditorialDocView] = useState<'original' | 'working'>('original');

  // Feedback / Toast / Copy states
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copyErrorMsg, setCopyErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const originalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorialLocateRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 3200);
  }, []);

  // Load auth & local task history on mount
  useEffect(() => {
    let mounted = true;
    getCurrentUserId()
      .then((uid) => {
        if (!mounted) return;
        setUserId(uid);
        setAuthLoaded(true);
        setTasks(loadPolishTasks(uid));
      })
      .catch(() => {
        if (!mounted) return;
        setUserId(null);
        setAuthLoaded(true);
        setTasks(loadPolishTasks(null));
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Abort active requests and clear timers on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Track unsaved modifications for App navigation guard
  const hasUnsavedChanges = useMemo(() => {
    if (pageView !== 'workspace' || !activeTask) return false;
    return (
      activeTask.light.hasUnsavedResult ||
      activeTask.deep.hasUnsavedResult ||
      activeTask.editorial.hasUnsavedResult
    );
  }, [pageView, activeTask]);

  useEffect(() => {
    onUnsavedStateChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedStateChange]);

  // Warn browser tab close if unsaved
  useEffect(() => {
    if (!hasUnsavedChanges || !isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, isActive]);

  // Persist active task into recent tasks list whenever it meaningfully changes
  const persistTask = useCallback(
    (updated: PolishTaskRecord) => {
      const hasMeaningfulData =
        updated.originalText.trim().length > 0 ||
        updated.versions.length > 0 ||
        updated.light.prosePreview.length > 0 ||
        updated.deep.rewrittenText.length > 0 ||
        updated.deep.skeleton !== null ||
        updated.editorial.suggestions.length > 0;

      const stamped: PolishTaskRecord = {
        ...updated,
        updatedAt: new Date().toISOString(),
        statusLabel: computeTaskStatusLabel(updated),
      };

      setActiveTask(stamped);
      if (!hasMeaningfulData) return;

      setTasks((prev) => {
        const rest = prev.filter((t) => t.id !== stamped.id);
        const next = [stamped, ...rest].slice(0, 20);
        savePolishTasks(userId, next);
        return next;
      });
    },
    [userId]
  );

  const updateActiveTask = useCallback(
    (updater: (prev: PolishTaskRecord) => PolishTaskRecord) => {
      setActiveTask((prev) => {
        if (!prev) return prev;
        const nextRaw = updater(prev);
        const stamped: PolishTaskRecord = {
          ...nextRaw,
          updatedAt: new Date().toISOString(),
          statusLabel: computeTaskStatusLabel(nextRaw),
        };
        const hasMeaningfulData =
          stamped.originalText.trim().length > 0 ||
          stamped.versions.length > 0 ||
          stamped.light.prosePreview.length > 0 ||
          stamped.deep.rewrittenText.length > 0 ||
          stamped.deep.skeleton !== null ||
          stamped.editorial.suggestions.length > 0;
        if (hasMeaningfulData) {
          setTasks((list) => {
            const nextList = [stamped, ...list.filter((t) => t.id !== stamped.id)].slice(0, 20);
            savePolishTasks(userId, nextList);
            return nextList;
          });
        }
        return stamped;
      });
    },
    [userId]
  );

  // Navigation Handlers
  const enterModeFromHome = (mode: PolishMode) => {
    setSelectedHomeMode(mode);
    if (activeTask) {
      setActiveMode(mode);
      updateActiveTask((t) => ({ ...t, lastMode: mode }));
      setPageView('workspace');
      return;
    }
    const fresh = createInitialTask();
    fresh.lastMode = mode;
    setActiveTask(fresh);
    setActiveMode(mode);
    setSelectedChangeId(null);
    setActiveSuggestionId(null);
    setPageView('workspace');
  };

  const openExistingTask = (task: PolishTaskRecord) => {
    setActiveTask(task);
    setActiveMode(task.lastMode || 'light');
    setSelectedChangeId(null);
    setActiveSuggestionId(null);
    setPageView('workspace');
  };

  const startFreshTask = () => {
    const run = () => {
      const fresh = createInitialTask();
      fresh.lastMode = activeMode;
      setActiveTask(fresh);
      setSelectedChangeId(null);
      setActiveSuggestionId(null);
      setUploadError('');
    };
    if (hasUnsavedChanges) {
      setConfirmModal({
        title: '有未保存的修改结果',
        message: '当前工作区还有未保存为新版本的处理结果，新建空白稿件将切换离开当前任务（已自动保留在「最近的润色」列表中）。确定继续吗？',
        confirmLabel: '新建空白稿件',
        onConfirm: () => {
          setConfirmModal(null);
          run();
        },
      });
      return;
    }
    run();
  };

  const returnToHome = () => {
    if (isGenerating) {
      showToast('请先停止当前生成任务后再返回首页');
      return;
    }
    const goHome = () => {
      setPageView('home');
    };
    if (hasUnsavedChanges) {
      setConfirmModal({
        title: '仍有未另存的修改结果',
        message: '当前模式存在尚未保存为新版本的处理结果。返回首页后该草稿仍会保留在「最近的润色」中，确认返回首页吗？',
        confirmLabel: '返回首页',
        onConfirm: () => {
          setConfirmModal(null);
          goHome();
        },
      });
      return;
    }
    goHome();
  };

  const deleteRecentTask = (id: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      savePolishTasks(userId, next);
      return next;
    });
    if (activeTask?.id === id) {
      setActiveTask(null);
    }
  };

  const handleSwitchMode = (mode: PolishMode) => {
    if (mode === activeMode) return;
    if (isGenerating) {
      showToast('当前正在生成中，请先点击「停止生成」后再切换模式');
      return;
    }
    // Switching preserves originalText and each mode's independent state; never auto-triggers AI.
    setActiveMode(mode);
    setMobilePane('original');
    updateActiveTask((prev) => ({ ...prev, lastMode: mode }));
  };

  // Scope & Input Handlers
  const getTargetScopeText = useCallback(
    (task: PolishTaskRecord): { text: string; start: number; end: number } => {
      if (task.scope === 'selection' && task.selectionEnd > task.selectionStart) {
        const start = Math.max(0, Math.min(task.originalText.length, task.selectionStart));
        const end = Math.max(start, Math.min(task.originalText.length, task.selectionEnd));
        return { text: task.originalText.slice(start, end), start, end };
      }
      return { text: task.originalText, start: 0, end: task.originalText.length };
    },
    []
  );

  const captureTextareaSelection = () => {
    const el = originalTextareaRef.current;
    if (!el || !activeTask) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end > start) {
      updateActiveTask((prev) => ({ ...prev, selectionStart: start, selectionEnd: end }));
    }
  };

  const applyNewOriginalText = (newText: string, newTitle?: string) => {
    if (!activeTask) return;
    const apply = () => {
      updateActiveTask((prev) => ({
        ...prev,
        title: newTitle || (prev.title === '未命名稿件' ? deriveTitleFromText(newText) : prev.title),
        originalText: newText,
        selectionStart: 0,
        selectionEnd: 0,
      }));
    };
    if (hasUnsavedChanges && activeTask.originalText.trim() && newText !== activeTask.originalText) {
      setConfirmModal({
        title: '替换原稿前请确认',
        message: '当前存在尚未保存的修改结果。导入新原稿不会删除各模式旧结果，但可能与新原稿内容不匹配。是否导入新原稿？',
        confirmLabel: '确认导入',
        onConfirm: () => {
          setConfirmModal(null);
          apply();
        },
      });
      return;
    }
    apply();
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setIsUploadingFile(true);
    setUploadError('');
    try {
      const content = await extractTextFromFile(file);
      const baseTitle = file.name.replace(/\.[^.]+$/, '');
      applyNewOriginalText(content, baseTitle);
      showToast(`已导入《${file.name}》（${countContentChars(content)} 字）`);
    } catch (e: any) {
      setUploadError(e?.message || '读取文件失败，请确认文件为支持的文本格式');
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Copy Helper (3s "已复制", failure fallback)
  const handleCopyText = async (text: string) => {
    setCopyErrorMsg('');
    if (!text.trim()) {
      setCopyStatus('error');
      setCopyErrorMsg('当前暂无可复制的结果内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 3000);
    } catch {
      setCopyStatus('error');
      setCopyErrorMsg('写入剪贴板失败，请检查浏览器权限或手动全选复制');
    }
  };

  // Stop Active Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingStage('已暂停，原稿与已有内容均已保留');

    if (activeMode === 'light') {
      updateActiveTask((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          statusText: '已手动停止，保留当前草稿',
          resumable: Boolean(prev.light.rawOutput.trim()),
        },
      }));
    } else if (activeMode === 'deep') {
      updateActiveTask((prev) => ({
        ...prev,
        deep: {
          ...prev.deep,
          statusText: '已手动停止，保留当前草稿',
          resumable: Boolean(prev.deep.rewrittenText.trim()),
        },
      }));
    } else if (activeMode === 'editorial') {
      updateActiveTask((prev) => ({
        ...prev,
        editorial: {
          ...prev.editorial,
          statusText: '已手动停止建议分析',
        },
      }));
    }
  };

  // ============================================================
  // Mode 1: Light Polish Execution & Actions
  // ============================================================

  const runLightPolish = async (isContinue = false) => {
    if (!activeTask || isGenerating) return;
    const scopeInfo = getTargetScopeText(activeTask);
    if (!isContinue && !scopeInfo.text.trim()) {
      showToast(
        activeTask.scope === 'selection'
          ? '请先在原稿文本框中选中需要润色的段落'
          : '请先输入、上传或导入需要润色的原稿'
      );
      return;
    }

    const startTask = async () => {
      const selectedModel = normalizeClientModel(activeTask.model);
      const sourceText = isContinue ? activeTask.light.sourceSnapshot || scopeInfo.text : scopeInfo.text;
      const scopeStart = isContinue ? activeTask.light.scopeOffset : scopeInfo.start;
      const scopeEnd = isContinue ? activeTask.light.scopeEndOffset : scopeInfo.end;

      const prompt = isContinue && lastLightPromptRef.current
        ? lastLightPromptRef.current.prompt
        : buildLightPolishPrompt({ text: sourceText, focuses: activeTask.light.focuses });

      lastLightPromptRef.current = {
        prompt,
        model: selectedModel,
        temperature: activeTask.temperature,
        topP: activeTask.topP,
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsGenerating(true);
      setGeneratingStage('正在分析原稿');
      setGeneratingChars(0);
      setSelectedChangeId(null);

      let rawAcc = isContinue ? activeTask.light.rawOutput : '';
      let actualModelUsed = selectedModel;

      updateActiveTask((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          sourceSnapshot: sourceText,
          scopeOffset: scopeStart,
          scopeEndOffset: scopeEnd,
          rawOutput: rawAcc,
          prosePreview: splitLightPolishOutput(rawAcc).prose,
          changes: isContinue ? prev.light.changes : [],
          statusText: '正在分析原稿',
          errorText: '',
          errorCategory: undefined,
          resumable: false,
        },
      }));

      try {
        const stream = generateTextStream(prompt, {
          model: selectedModel,
          temperature: activeTask.temperature,
          topP: activeTask.topP,
          maxOutputTokens: 32768,
          initialText: rawAcc || undefined,
          autoRecover: true,
          enforceTargetLength: false,
          signal: controller.signal,
          onModelUsed: (m) => {
            actualModelUsed = m;
          },
          onStatus: (st) => {
            setGeneratingStage(st || '正在润色');
          },
        });

        for await (const chunk of stream) {
          rawAcc += chunk;
          const parsed = splitLightPolishOutput(rawAcc);
          const chars = countContentChars(parsed.prose);
          setGeneratingChars(chars);
          setGeneratingStage(`正在润色 · 已生成 ${chars} 字`);

          updateActiveTask((prev) => ({
            ...prev,
            light: {
              ...prev.light,
              rawOutput: rawAcc,
              prosePreview: parsed.prose,
              modelUsed: actualModelUsed,
              statusText: `正在润色 · 已生成 ${chars} 字`,
            },
          }));
        }

        if (!controller.signal.aborted) {
          const finalParsed = splitLightPolishOutput(rawAcc);
          const changes = buildLightChanges(sourceText, finalParsed.prose, finalParsed.notes);
          const finalChars = countContentChars(finalParsed.prose);

          updateActiveTask((prev) => ({
            ...prev,
            light: {
              ...prev.light,
              rawOutput: rawAcc,
              prosePreview: finalParsed.prose,
              changes,
              modelUsed: actualModelUsed,
              statusText:
                changes.length > 0
                  ? `润色完成 · 识别 ${changes.length} 处修改 · 预览 ${finalChars} 字`
                  : `润色完成 · 预览 ${finalChars} 字（与原稿一致）`,
              errorText: '',
              resumable: false,
              hasUnsavedResult: true,
            },
          }));
          setMobilePane('result');
        }
      } catch (e: any) {
        if (!controller.signal.aborted && e?.message !== 'Aborted') {
          const classified = classifyPolishError(e?.message || String(e));
          const parsedPartial = splitLightPolishOutput(rawAcc);
          const partialChanges = parsedPartial.prose
            ? buildLightChanges(sourceText, parsedPartial.prose, parsedPartial.notes)
            : [];
          const canContinue =
            Boolean(rawAcc.trim()) &&
            (!(e instanceof GenerationInterrupted) || e.recoverable !== false);

          updateActiveTask((prev) => ({
            ...prev,
            light: {
              ...prev.light,
              rawOutput: rawAcc,
              prosePreview: parsedPartial.prose,
              changes: partialChanges,
              modelUsed: actualModelUsed,
              statusText: parsedPartial.prose
                ? `润色未完成（已保留 ${countContentChars(parsedPartial.prose)} 字草稿）`
                : '润色未能完成',
              errorText: `${classified.title}：${classified.detail}`,
              errorCategory: classified.category,
              resumable: canContinue,
              hasUnsavedResult: Boolean(parsedPartial.prose),
            },
          }));
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    };

    if (!isContinue && (activeTask.light.prosePreview.trim() || activeTask.light.changes.length > 0)) {
      setConfirmModal({
        title: '确认重新生成轻度润色',
        message: '当前轻度润色区已有处理结果。从头重新生成将替换当前润色草稿（已保存的历史版本不受影响），确定继续吗？',
        confirmLabel: '确认重新生成',
        onConfirm: () => {
          setConfirmModal(null);
          void startTask();
        },
      });
      return;
    }

    await startTask();
  };

  const setLightChangeStatus = (changeId: string, status: 'pending' | 'accepted' | 'rejected') => {
    updateActiveTask((prev) => ({
      ...prev,
      light: {
        ...prev.light,
        changes: prev.light.changes.map((c) => (c.id === changeId ? { ...c, status } : c)),
        hasUnsavedResult: true,
      },
    }));
  };

  const bulkSetLightChanges = (status: 'pending' | 'accepted' | 'rejected') => {
    updateActiveTask((prev) => ({
      ...prev,
      light: {
        ...prev.light,
        changes: prev.light.changes.map((c) => ({ ...c, status })),
        hasUnsavedResult: true,
      },
    }));
  };

  // ============================================================
  // Mode 2: Deep Rewrite Multi-Step Workflow
  // ============================================================

  const runExtractSkeleton = async () => {
    if (!activeTask || isGenerating) return;
    const scopeInfo = getTargetScopeText(activeTask);
    if (!scopeInfo.text.trim()) {
      showToast(
        activeTask.scope === 'selection'
          ? '请先在原稿中选中需要重写的段落'
          : '请先输入、上传或导入原稿'
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const selectedModel = normalizeClientModel(activeTask.model);
    let actualModelUsed = selectedModel;

    setIsGenerating(true);
    setGeneratingStage('正在分析原稿并提取故事骨架');
    setGeneratingChars(0);

    updateActiveTask((prev) => ({
      ...prev,
      deep: {
        ...prev.deep,
        step: 'skeleton',
        skeletonStatus: '正在提取故事骨架…',
        errorText: '',
        errorCategory: undefined,
      },
    }));

    let raw = '';
    try {
      const prompt = buildExtractSkeletonPrompt(scopeInfo.text);
      const stream = generateTextStream(prompt, {
        model: selectedModel,
        temperature: Math.min(0.4, activeTask.temperature),
        topP: activeTask.topP,
        maxOutputTokens: 8192,
        autoRecover: false,
        enforceTargetLength: false,
        signal: controller.signal,
        onModelUsed: (m) => {
          actualModelUsed = m;
        },
      });
      for await (const chunk of stream) {
        raw += chunk;
        const chars = countContentChars(raw);
        setGeneratingChars(chars);
        setGeneratingStage(`正在提取故事骨架 · 已分析 ${chars} 字`);
      }

      if (!controller.signal.aborted) {
        const parsedSkeleton = parseSkeletonResponse(raw);
        updateActiveTask((prev) => ({
          ...prev,
          deep: {
            ...prev.deep,
            step: 'skeleton',
            skeleton: parsedSkeleton,
            skeletonStatus: '骨架已提取，请核对修改并锁定关键细节（不会自动生成全文）',
            modelUsed: actualModelUsed,
            errorText: '',
            hasUnsavedResult: true,
          },
        }));
      }
    } catch (e: any) {
      if (!controller.signal.aborted && e?.message !== 'Aborted') {
        const classified = classifyPolishError(e?.message || String(e));
        updateActiveTask((prev) => ({
          ...prev,
          deep: {
            ...prev.deep,
            skeletonStatus: '骨架提取未完成',
            errorText: `${classified.title}：${classified.detail}`,
            errorCategory: classified.category,
          },
        }));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const runDeepRewrite = async (isContinue = false) => {
    if (!activeTask || isGenerating) return;
    if (!activeTask.deep.skeleton) {
      showToast('请先提取并确认故事骨架');
      return;
    }
    const scopeInfo = getTargetScopeText(activeTask);
    if (!isContinue && !scopeInfo.text.trim()) {
      showToast('原稿内容为空');
      return;
    }

    const executeRewrite = async () => {
      const selectedModel = normalizeClientModel(activeTask.model);
      const targetChars = activeTask.deep.targetChars > 0 ? activeTask.deep.targetChars : undefined;

      const prompt =
        isContinue && lastDeepPromptRef.current
          ? lastDeepPromptRef.current.prompt
          : buildDeepRewritePrompt({
              sourceText: scopeInfo.text,
              skeleton: activeTask.deep.skeleton!,
              perspective: activeTask.deep.perspective,
              endingPreference: activeTask.deep.endingPreference,
              styleNotes: activeTask.deep.styleNotes,
            });

      lastDeepPromptRef.current = {
        prompt,
        targetChars,
        model: selectedModel,
        temperature: activeTask.temperature,
        topP: activeTask.topP,
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsGenerating(true);
      setGeneratingStage('正在重写');
      setGeneratingChars(isContinue ? countContentChars(activeTask.deep.rewrittenText) : 0);

      let rewrittenAcc = isContinue ? activeTask.deep.rewrittenText : '';
      let actualModelUsed = selectedModel;

      const rewriteSource = isContinue && activeTask.deep.sourceSnapshot ? activeTask.deep.sourceSnapshot : scopeInfo.text;
      const rewriteScopeStart = isContinue && typeof activeTask.deep.scopeOffset === 'number' ? activeTask.deep.scopeOffset : scopeInfo.start;
      const rewriteScopeEnd = isContinue && typeof activeTask.deep.scopeEndOffset === 'number' ? activeTask.deep.scopeEndOffset : scopeInfo.end;

      updateActiveTask((prev) => ({
        ...prev,
        deep: {
          ...prev.deep,
          step: 'result',
          sourceSnapshot: rewriteSource,
          scopeOffset: rewriteScopeStart,
          scopeEndOffset: rewriteScopeEnd,
          rewrittenText: rewrittenAcc,
          statusText: rewrittenAcc
            ? `正在接续重写 · 已生成 ${countContentChars(rewrittenAcc)} 字`
            : '正在重写',
          errorText: '',
          errorCategory: undefined,
          resumable: false,
          deviations: [],
          deviationChecked: false,
          deviationNotice: '',
        },
      }));
      setDeepCompareTab('split');
      setMobilePane('result');

      try {
        const stream = generateTextStream(prompt, {
          model: selectedModel,
          temperature: activeTask.temperature,
          topP: activeTask.topP,
          maxOutputTokens: 32768,
          targetChars,
          stageControl: Boolean(targetChars),
          enforceTargetLength: false,
          autoRecover: true,
          initialText: rewrittenAcc || undefined,
          signal: controller.signal,
          onModelUsed: (m) => {
            actualModelUsed = m;
          },
          onStatus: (st) => {
            setGeneratingStage(st || '正在重写');
          },
        });

        for await (const chunk of stream) {
          rewrittenAcc += chunk;
          const clean = stripThinkBlocks(rewrittenAcc);
          const chars = countContentChars(clean);
          setGeneratingChars(chars);
          setGeneratingStage(`正在重写 · 已生成 ${chars} 字`);
          updateActiveTask((prev) => ({
            ...prev,
            deep: {
              ...prev.deep,
              rewrittenText: rewrittenAcc,
              modelUsed: actualModelUsed,
              statusText: `正在重写 · 已生成 ${chars} 字`,
            },
          }));
        }

        if (!controller.signal.aborted) {
          const finalClean = stripThinkBlocks(rewrittenAcc);
          const actual = countContentChars(finalClean);
          updateActiveTask((prev) => ({
            ...prev,
            deep: {
              ...prev.deep,
              step: 'result',
              rewrittenText: finalClean,
              modelUsed: actualModelUsed,
              statusText: `已完成 · 实际 ${actual} 字`,
              errorText: '',
              resumable: false,
              hasUnsavedResult: true,
            },
          }));
        }
      } catch (e: any) {
        if (!controller.signal.aborted && e?.message !== 'Aborted') {
          const classified = classifyPolishError(e?.message || String(e));
          const partialClean = stripThinkBlocks(rewrittenAcc);
          const canContinue =
            Boolean(partialClean.trim()) &&
            (!(e instanceof GenerationInterrupted) || e.recoverable !== false);

          updateActiveTask((prev) => ({
            ...prev,
            deep: {
              ...prev.deep,
              step: 'result',
              rewrittenText: partialClean,
              modelUsed: actualModelUsed,
              statusText: partialClean
                ? `生成中断 · 已保留 ${countContentChars(partialClean)} 字草稿`
                : '重写未完成',
              errorText: `${classified.title}：${classified.detail}`,
              errorCategory: classified.category,
              resumable: canContinue,
              hasUnsavedResult: Boolean(partialClean.trim()),
            },
          }));
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    };

    if (!isContinue && activeTask.deep.rewrittenText.trim()) {
      setConfirmModal({
        title: '确认重新生成重写稿',
        message: '当前深度重写区已有成文草稿，从头重新生成将替换该草稿（已保存的历史版本不受影响）。确认继续吗？',
        confirmLabel: '确认重新生成',
        onConfirm: () => {
          setConfirmModal(null);
          void executeRewrite();
        },
      });
      return;
    }

    await executeRewrite();
  };

  const runDeviationCheck = async () => {
    if (!activeTask?.deep.skeleton || !activeTask.deep.rewrittenText.trim() || isCheckingConsistency || isGenerating) {
      return;
    }
    setIsCheckingConsistency(true);
    updateActiveTask((prev) => ({
      ...prev,
      deep: { ...prev.deep, deviationNotice: '正在核对骨架与锁定细节…', deviations: [] },
    }));

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let raw = '';
    try {
      const prompt = buildConsistencyCheckPrompt({
        skeleton: activeTask.deep.skeleton,
        rewrittenText: activeTask.deep.rewrittenText,
      });
      const stream = generateTextStream(prompt, {
        model: normalizeClientModel(activeTask.model),
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4096,
        autoRecover: false,
        enforceTargetLength: false,
        signal: controller.signal,
      });
      for await (const chunk of stream) {
        raw += chunk;
      }
      if (!controller.signal.aborted) {
        const deviations = parseConsistencyDeviations(raw);
        updateActiveTask((prev) => ({
          ...prev,
          deep: {
            ...prev.deep,
            deviations,
            deviationChecked: true,
            deviationNotice:
              deviations.length === 0
                ? '核查完成：暂未发现明确偏离已锁定要素的段落（仍建议对照终稿人工复看）。'
                : `核查完成：发现 ${deviations.length} 处可能偏离骨架/锁定要求的片段，请作者核对。`,
          },
        }));
      }
    } catch (e: any) {
      if (!controller.signal.aborted && e?.message !== 'Aborted') {
        const classified = classifyPolishError(e?.message || String(e));
        updateActiveTask((prev) => ({
          ...prev,
          deep: {
            ...prev.deep,
            deviationChecked: false,
            deviationNotice: `${classified.title}：${classified.detail}`,
          },
        }));
      }
    } finally {
      setIsCheckingConsistency(false);
      abortControllerRef.current = null;
    }
  };

  // ============================================================
  // Mode 3: Editorial Suggestions Execution & Offset-Safe Apply
  // ============================================================

  const runEditorialSuggestions = async () => {
    if (!activeTask || isGenerating) return;
    const scopeInfo = getTargetScopeText(activeTask);
    if (!scopeInfo.text.trim()) {
      showToast(
        activeTask.scope === 'selection'
          ? '请先在原稿框中选中需要审核的片段'
          : '请先输入、上传或导入需要审查的稿件'
      );
      return;
    }

    const executeEditorial = async () => {
      const sourceText = scopeInfo.text;
      const selectedModel = normalizeClientModel(activeTask.model);
      let actualModelUsed = selectedModel;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsGenerating(true);
      setGeneratingStage('正在分析原稿并定位问题');
      setGeneratingChars(0);
      setActiveSuggestionId(null);

      updateActiveTask((prev) => ({
        ...prev,
        editorial: {
          ...prev.editorial,
          sourceSnapshot: sourceText,
          scopeOffset: scopeInfo.start,
          scopeEndOffset: scopeInfo.end,
          workingText: sourceText,
          suggestions: [],
          rawOutput: '',
          statusText: '正在分析原稿并生成建议…',
          errorText: '',
          errorCategory: undefined,
        },
      }));

      let raw = '';
      try {
        const prompt = buildEditorialSuggestionsPrompt({
          text: sourceText,
          focuses: activeTask.editorial.focuses,
        });
        const stream = generateTextStream(prompt, {
          model: selectedModel,
          temperature: Math.min(0.4, activeTask.temperature),
          topP: activeTask.topP,
          maxOutputTokens: 16384,
          autoRecover: false,
          enforceTargetLength: false,
          signal: controller.signal,
          onModelUsed: (m) => {
            actualModelUsed = m;
          },
        });

        for await (const chunk of stream) {
          raw += chunk;
          const chars = countContentChars(raw);
          setGeneratingChars(chars);
          setGeneratingStage(`正在分析原稿并整理修改建议 · 已返回 ${chars} 字`);
        }

        if (!controller.signal.aborted) {
          const suggestions = parseEditorialSuggestionsResponse(raw, sourceText);
          const rebuilt = rebuildEditorialState(sourceText, suggestions);
          updateActiveTask((prev) => ({
            ...prev,
            editorial: {
              ...prev.editorial,
              rawOutput: raw,
              sourceSnapshot: sourceText,
              workingText: rebuilt.workingText,
              suggestions: rebuilt.suggestions,
              modelUsed: actualModelUsed,
              statusText: `分析完成 · 生成 ${rebuilt.suggestions.length} 条定位建议`,
              errorText: '',
              hasUnsavedResult: rebuilt.suggestions.length > 0,
            },
          }));
          if (rebuilt.suggestions[0]) {
            setActiveSuggestionId(rebuilt.suggestions[0].id);
          }
          setEditorialDocView('original');
          setEditorialViewTab('locate');
          setMobilePane('result');
        }
      } catch (e: any) {
        if (!controller.signal.aborted && e?.message !== 'Aborted') {
          const classified = classifyPolishError(e?.message || String(e));
          updateActiveTask((prev) => ({
            ...prev,
            editorial: {
              ...prev.editorial,
              rawOutput: raw,
              modelUsed: actualModelUsed,
              statusText: '获取建议未完成',
              errorText: `${classified.title}：${classified.detail}`,
              errorCategory: classified.category,
            },
          }));
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    };

    if (activeTask.editorial.suggestions.length > 0) {
      setConfirmModal({
        title: '确认重新获取编辑建议',
        message: '重新获取将替换当前列表中的建议及处理状态，确认继续吗？',
        confirmLabel: '重新获取建议',
        onConfirm: () => {
          setConfirmModal(null);
          void executeEditorial();
        },
      });
      return;
    }

    await executeEditorial();
  };

  const updateSuggestionDecision = (id: string, status: 'pending' | 'accepted' | 'kept') => {
    updateActiveTask((prev) => {
      const nextList = prev.editorial.suggestions.map((s) =>
        s.id === id ? { ...s, status } : s
      );
      const rebuilt = rebuildEditorialState(prev.editorial.sourceSnapshot, nextList);
      return {
        ...prev,
        editorial: {
          ...prev.editorial,
          suggestions: rebuilt.suggestions,
          workingText: rebuilt.workingText,
          hasUnsavedResult: true,
        },
      };
    });
  };

  // Scroll to highlighted suggestion inside original or working text without forcing user to search manually
  useEffect(() => {
    if (!activeSuggestionId || !activeTask || !editorialLocateRef.current || editorialViewTab !== 'locate') return;
    const item = activeTask.editorial.suggestions.find((s) => s.id === activeSuggestionId);
    if (!item) return;
    const offset = editorialDocView === 'original' ? item.startOffset : item.currentStartOffset;
    if (offset >= 0) {
      requestAnimationFrame(() => {
        if (editorialLocateRef.current) {
          scrollToTextOffset(editorialLocateRef.current, offset);
        }
      });
    }
  }, [activeSuggestionId, editorialDocView, editorialViewTab, activeTask?.editorial.workingText]);

  // ============================================================
  // Version Saving, Restoration & Imitation Handoff
  // ============================================================

  const getActiveModeConfirmedOutput = (): { content: string; modelUsed: string; summary: string } | null => {
    if (!activeTask) return null;
    if (activeMode === 'light') {
      const scope = activeTask.light.sourceSnapshot;
      if (!scope && !activeTask.light.prosePreview) return null;
      // If user has accepted/rejected any items, build from confirmed; if none accepted yet, check if preview exists
      const hasChanges = activeTask.light.changes.length > 0;
      const acceptedCount = activeTask.light.changes.filter((c) => c.status === 'accepted').length;
      const rejectedCount = activeTask.light.changes.filter((c) => c.status === 'rejected').length;
      const pendingCount = activeTask.light.changes.filter((c) => c.status === 'pending').length;

      const scopedResult = hasChanges
        ? applyLightChangesToText(
            scope,
            activeTask.light.changes,
            acceptedCount === 0 && pendingCount > 0 ? 'preview_pending' : 'confirmed'
          )
        : activeTask.light.prosePreview;

      const fullContent = spliceScopeResultIntoFullText(
        activeTask.originalText,
        activeTask.light.scopeOffset === 0 && activeTask.light.scopeEndOffset === activeTask.originalText.length
          ? 'full'
          : 'selection',
        activeTask.light.scopeOffset,
        activeTask.light.scopeEndOffset,
        scopedResult
      );
      return {
        content: fullContent,
        modelUsed: activeTask.light.modelUsed || activeTask.model,
        summary: hasChanges
          ? `已采纳 ${acceptedCount} 处 · 保留 ${rejectedCount} 处${pendingCount > 0 ? ` · 未决 ${pendingCount} 处` : ''}`
          : '轻度润色成稿',
      };
    }

    if (activeMode === 'deep') {
      if (!activeTask.deep.rewrittenText.trim()) return null;
      const scopeStart = typeof activeTask.deep.scopeOffset === 'number' ? activeTask.deep.scopeOffset : 0;
      const scopeEnd =
        typeof activeTask.deep.scopeEndOffset === 'number'
          ? activeTask.deep.scopeEndOffset
          : activeTask.originalText.length;
      const isFull = scopeStart === 0 && scopeEnd === activeTask.originalText.length;
      const fullContent = spliceScopeResultIntoFullText(
        activeTask.originalText,
        isFull ? 'full' : 'selection',
        scopeStart,
        scopeEnd,
        activeTask.deep.rewrittenText
      );
      return {
        content: fullContent,
        modelUsed: activeTask.deep.modelUsed || activeTask.model,
        summary: '深度重写成稿',
      };
    }

    // Editorial mode
    if (!activeTask.editorial.sourceSnapshot) return null;
    const accepted = activeTask.editorial.suggestions.filter((s) => s.status === 'accepted').length;
    const kept = activeTask.editorial.suggestions.filter((s) => s.status === 'kept').length;
    const fullContent = spliceScopeResultIntoFullText(
      activeTask.originalText,
      activeTask.editorial.scopeOffset === 0 && activeTask.editorial.scopeEndOffset === activeTask.originalText.length
        ? 'full'
        : 'selection',
      activeTask.editorial.scopeOffset,
      activeTask.editorial.scopeEndOffset,
      activeTask.editorial.workingText
    );
    return {
      content: fullContent,
      modelUsed: activeTask.editorial.modelUsed || activeTask.model,
      summary: `逐条处理：采纳 ${accepted} 条 · 保留 ${kept} 条`,
    };
  };

  const handleSaveNewVersion = async (alsoSaveToMaterials = false) => {
    if (!activeTask) return;
    const out = getActiveModeConfirmedOutput();
    if (!out || !out.content.trim()) {
      showToast('当前模式下暂无可保存的新版本内容');
      return;
    }

    const versionIdx = activeTask.versions.length + 1;
    const versionTitle = `${activeTask.title || '未命名稿件'} · ${getPolishModeLabel(activeMode)} v${versionIdx}`;
    const newVersion: PolishVersionRecord = {
      id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: versionTitle,
      mode: activeMode,
      content: out.content,
      charCount: countContentChars(out.content),
      modelUsed: out.modelUsed,
      createdAt: new Date().toISOString(),
      summary: out.summary,
    };

    updateActiveTask((prev) => ({
      ...prev,
      versions: [newVersion, ...prev.versions],
      light: activeMode === 'light' ? { ...prev.light, hasUnsavedResult: false } : prev.light,
      deep: activeMode === 'deep' ? { ...prev.deep, hasUnsavedResult: false } : prev.deep,
      editorial: activeMode === 'editorial' ? { ...prev.editorial, hasUnsavedResult: false } : prev.editorial,
    }));

    if (alsoSaveToMaterials && userId) {
      const res = await saveMaterial(versionTitle, out.content, 'idea', [
        '文章润色',
        getPolishModeLabel(activeMode),
      ]);
      if (res.success) {
        showToast(`已另存为「${versionTitle}」并同步存入云端素材库`);
        return;
      }
    }

    showToast(
      userId
        ? `已另存为「${versionTitle}」（原稿完整保留，可通过上方「存入作品」同步至云端作品）`
        : `已另存为本地新版本「${versionTitle}」（访客模式保存在当前浏览器，原稿已保留）`
    );
  };

  const handleRestoreVersion = (version: PolishVersionRecord) => {
    if (!activeTask) return;
    updateActiveTask((prev) => {
      if (version.mode === 'deep') {
        return {
          ...prev,
          lastMode: 'deep',
          deep: {
            ...prev.deep,
            step: 'result',
            rewrittenText: version.content,
            statusText: `已恢复历史版本（${version.charCount} 字）`,
            hasUnsavedResult: true,
          },
        };
      }
      if (version.mode === 'light') {
        const rebuiltChanges = buildLightChanges(prev.originalText, version.content, []);
        return {
          ...prev,
          lastMode: 'light',
          light: {
            ...prev.light,
            sourceSnapshot: prev.originalText,
            scopeOffset: 0,
            scopeEndOffset: prev.originalText.length,
            prosePreview: version.content,
            changes: rebuiltChanges,
            statusText: `已恢复历史版本（${version.charCount} 字）`,
            hasUnsavedResult: true,
          },
        };
      }
      return {
        ...prev,
        lastMode: 'editorial',
        editorial: {
          ...prev.editorial,
          sourceSnapshot: version.content,
          workingText: version.content,
          scopeOffset: 0,
          scopeEndOffset: prev.originalText.length,
          statusText: `已将历史版本加载为当前修订基线（${version.charCount} 字）`,
          hasUnsavedResult: true,
        },
      };
    });
    setActiveMode(version.mode);
    showToast(`已恢复版本「${version.title}」（原稿未受影响）`);
  };

  const handleSendActiveResultToImitate = () => {
    if (!activeTask) return;
    const out = getActiveModeConfirmedOutput();
    const contentToSend = out?.content?.trim() ? out.content : activeTask.originalText;
    if (!contentToSend.trim()) {
      showToast('请先导入原稿或完成润色后再用于文风仿写');
      return;
    }
    const label = out?.content?.trim()
      ? `${activeTask.title || '润色稿'}（${getPolishModeLabel(activeMode)}）`
      : activeTask.title || '原稿';
    onSendToImitate(contentToSend, label);
  };

  // Computed Metrics for Light Mode
  const lightMetrics = useMemo(() => {
    if (!activeTask) return { sourceChars: 0, confirmedChars: 0, previewChars: 0, accepted: 0, rejected: 0, pending: 0, confirmedText: '' };
    const { light } = activeTask;
    const src = light.sourceSnapshot || activeTask.originalText;
    const accepted = light.changes.filter((c) => c.status === 'accepted').length;
    const rejected = light.changes.filter((c) => c.status === 'rejected').length;
    const pending = light.changes.filter((c) => c.status === 'pending').length;
    const applyMode = accepted === 0 && pending > 0 ? 'preview_pending' : 'confirmed';
    const confirmedScoped =
      light.changes.length > 0
        ? applyLightChangesToText(src, light.changes, applyMode)
        : light.prosePreview || src;
    const confirmedFull = spliceScopeResultIntoFullText(
      activeTask.originalText,
      light.scopeOffset === 0 && light.scopeEndOffset === activeTask.originalText.length ? 'full' : 'selection',
      light.scopeOffset,
      light.scopeEndOffset,
      confirmedScoped
    );
    return {
      sourceChars: countContentChars(src),
      confirmedChars: countContentChars(confirmedScoped),
      previewChars: countContentChars(light.prosePreview),
      accepted,
      rejected,
      pending,
      confirmedText: confirmedFull,
    };
  }, [activeTask]);

  const lightDiffSegments = useMemo(() => {
    if (!activeTask || !activeTask.light.sourceSnapshot) return [];
    return buildLightDiffSegments(activeTask.light.sourceSnapshot, activeTask.light.changes);
  }, [activeTask]);

  const selectedLightChange = useMemo(() => {
    if (!activeTask || !selectedChangeId) return null;
    return activeTask.light.changes.find((c) => c.id === selectedChangeId) || null;
  }, [activeTask, selectedChangeId]);

  const filteredEditorialSuggestions = useMemo(() => {
    if (!activeTask) return [];
    const list = activeTask.editorial.suggestions;
    if (editorialFilter === 'all') return list;
    return list.filter((s) => s.status === editorialFilter);
  }, [activeTask, editorialFilter]);

  const editorialHighlightParts = useMemo(() => {
    if (!activeTask) return [];
    const baseText =
      editorialDocView === 'original'
        ? activeTask.editorial.sourceSnapshot || activeTask.originalText
        : activeTask.editorial.workingText || activeTask.editorial.sourceSnapshot || activeTask.originalText;
    const ranges = activeTask.editorial.suggestions
      .map((s) => {
        const start = editorialDocView === 'original' ? s.startOffset : s.currentStartOffset;
        const end = editorialDocView === 'original' ? s.endOffset : s.currentEndOffset;
        return { startIndex: start, endIndex: end, suggestion: s };
      })
      .filter((r) => r.startIndex >= 0 && r.endIndex > r.startIndex && r.endIndex <= baseText.length);

    const parts = splitReviewText(baseText, ranges.map((r) => ({ startIndex: r.startIndex, endIndex: r.endIndex })));
    return parts.map((p) => ({
      ...p,
      text: baseText.slice(p.start, p.end),
      suggestion: p.sentenceIndex !== undefined ? ranges[p.sentenceIndex]?.suggestion : undefined,
    }));
  }, [activeTask, editorialDocView]);

  // ============================================================
  // Confirmation Dialog Portal
  // ============================================================
  const renderConfirmModal = () => {
    if (!confirmModal) return null;
    return createPortal(
      <div
        className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={() => setConfirmModal(null)}
      >
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800 font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{confirmModal.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{confirmModal.message}</p>
          <div className="mt-6 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmModal.onConfirm}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white"
            >
              {confirmModal.confirmLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ============================================================
  // PAGE 1: MODE SELECTION LANDING PAGE
  // ============================================================
  if (pageView === 'home' || !activeTask) {
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-sky-50/60 via-white to-gray-50 dark:from-black dark:via-gray-950 dark:to-black p-6 md:p-10 font-sans">
        {renderConfirmModal()}
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2.5 text-sky-600 dark:text-sky-400">
                <PaintBrush className="w-6 h-6" />
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  文章润色
                </h1>
              </div>
              <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
                先选一种修改方式，保留你的创作主导权。
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                适用于仿写前的原稿整理，也适用于自己的作品修改。
              </p>
            </div>
            {activeTask && activeTask.originalText.trim() && (
              <button
                type="button"
                onClick={() => setPageView('workspace')}
                className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0"
              >
                继续当前工作区（{activeTask.title}）
              </button>
            )}
          </div>

          {/* Three Side-by-Side Mode Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: Light Polish (Sky/Blue Primary) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => enterModeFromHome('light')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterModeFromHome('light');
                }
              }}
              className={`group text-left bg-white dark:bg-gray-900 rounded-2xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] ${
                selectedHomeMode === 'light'
                  ? 'border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900'
                  : 'border-sky-200/80 dark:border-sky-900/50 hover:border-sky-400'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">轻度润色</h2>
                    <p className="text-sm font-semibold text-sky-600 dark:text-sky-400 mt-1">
                      保留故事 · 精简表达
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-gray-800 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">适用场景：</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">原稿去冗余、初稿整理</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    精简空泛修饰、减少重复表达、保留人物口吻。支持逐句对照改动原因并单条或批量采纳。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enterModeFromHome('light');
                }}
                className="mt-6 w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-all active:scale-[0.99]"
              >
                进入轻度润色
              </button>
            </div>

            {/* Card 2: Deep Rewrite (Soft Purple Accent) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => enterModeFromHome('deep')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterModeFromHome('deep');
                }
              }}
              className={`group text-left bg-white dark:bg-gray-900 rounded-2xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] ${
                selectedHomeMode === 'deep'
                  ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-900'
                  : 'border-purple-200/80 dark:border-purple-900/50 hover:border-purple-400'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">深度重写</h2>
                    <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 mt-1">
                      确认骨架 · 重写全文
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Pencil className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-gray-800 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">适用场景：</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">故事有吸引力，但表达需要整体重做</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    先确认故事骨架、锁定重要细节、自选模型与写法。再按确认后的骨架重塑全文语言与节奏。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enterModeFromHome('deep');
                }}
                className="mt-6 w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all active:scale-[0.99]"
              >
                进入深度重写
              </button>
            </div>

            {/* Card 3: Editorial Suggestions (Existing Amber/Yellow Accent) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => enterModeFromHome('editorial')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  enterModeFromHome('editorial');
                }
              }}
              className={`group text-left bg-white dark:bg-gray-900 rounded-2xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] ${
                selectedHomeMode === 'editorial'
                  ? 'border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900'
                  : 'border-amber-200/80 dark:border-amber-900/50 hover:border-amber-400'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">编辑建议</h2>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-1">
                      作者决定 · 逐条修改
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <ClipboardDocumentCheck className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-gray-800 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">适用场景：</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">自己的稿件精修与复盘</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    问题定位到原文、解释修改理由、逐条采纳或保留。点击建议自动滚屏高亮，不遗漏前后衔接。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enterModeFromHome('editorial');
                }}
                className="mt-6 w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-all active:scale-[0.99]"
              >
                进入编辑建议
              </button>
            </div>
          </div>

          {/* Guarantee Statement */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 text-xs text-sky-800 dark:text-sky-300">
            <span className="font-semibold">原稿始终保留，修改结果另存为新版本。</span>
            <span className="text-sky-700/80 dark:text-sky-400/80">
              {authLoaded && userId
                ? '已登录账号：版本记录本地可查，定稿可一键存入创作中心作品或素材库'
                : '访客体验模式：最近任务与新版本保存在当前浏览器本地，登录后可存入云端作品'}
            </span>
          </div>

          {/* Recent Polish Tasks (Strictly Real Persisted Tasks Only) */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">最近的润色</h3>
              <span className="text-xs text-gray-400 tabular-nums">
                {tasks.length > 0 ? `共 ${tasks.length} 项真实任务记录` : '暂无历史任务'}
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="py-12 px-6 text-center space-y-2">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">暂无最近的润色任务</p>
                <p className="text-xs text-gray-400">
                  点击上方任一模式卡片导入或粘贴原稿后，真实产生的润色任务会记录在此处以便随时继续查看。
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-sky-50/30 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {task.title || '未命名稿件'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        <span className="font-medium text-sky-700 dark:text-sky-400">
                          {getPolishModeLabel(task.lastMode)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{task.statusLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>原稿 {countContentChars(task.originalText)} 字</span>
                        <span aria-hidden="true">·</span>
                        <span>更新于 {new Date(task.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openExistingTask(task)}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        继续查看
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecentTask(task.id)}
                        aria-label={`删除 ${task.title}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ============================================================
  // PAGE 2: SHARED WORKSPACE FOR THE 3 MODES
  // ============================================================
  const scopeInfo = getTargetScopeText(activeTask);
  const fullOrigChars = countContentChars(activeTask.originalText);
  const scopeChars = countContentChars(scopeInfo.text);
  const currentModelSupportsSampling = supportsSamplingParams(activeTask.model);
  const activeConfirmedOutput = getActiveModeConfirmedOutput();

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-black overflow-hidden font-sans relative">
      {renderConfirmModal()}

      <PolishImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(payload) => {
          applyNewOriginalText(payload.content, payload.title);
          showToast(`已从${payload.sourceLabel}导入原稿（${countContentChars(payload.content)} 字）`);
        }}
      />

      <PolishHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        originalText={activeTask.originalText}
        versions={activeTask.versions}
        onRestoreVersion={handleRestoreVersion}
        onSendToImitate={(content, title) => onSendToImitate(content, title)}
        onSaveToCreation={(content) => setSaveCreationModal({ open: true, content })}
      />

      <SaveToCreationModal
        isOpen={saveCreationModal.open}
        onClose={() => setSaveCreationModal({ open: false, content: '' })}
        content={saveCreationModal.content}
        onSuccess={(msg) => showToast(msg)}
      />

      {/* Top Workspace Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 py-3 z-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back + Title + Mode Switcher */}
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={returnToHome}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 whitespace-nowrap shrink-0"
            >
              <ChevronDoubleLeft className="w-4 h-4" /> 返回首页
            </button>

            <input
              type="text"
              value={activeTask.title}
              onChange={(e) => updateActiveTask((prev) => ({ ...prev, title: e.target.value }))}
              aria-label="稿件标题"
              placeholder="输入稿件标题..."
              className="px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white w-40 sm:w-52 focus:ring-2 focus:ring-sky-500 outline-none"
            />

            {/* Mode Switcher Tabs (Preserve manuscript & independent results, no auto request) */}
            <div className="flex items-center bg-sky-50 dark:bg-gray-800 p-1 rounded-xl border border-sky-100 dark:border-gray-700">
              {(
                [
                  { id: 'light', label: '轻度润色', activeClass: 'bg-sky-600 text-white shadow-sm' },
                  { id: 'deep', label: '深度重写', activeClass: 'bg-purple-600 text-white shadow-sm' },
                  { id: 'editorial', label: '编辑建议', activeClass: 'bg-amber-500 text-white shadow-sm' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSwitchMode(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeMode === tab.id
                      ? tab.activeClass
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Model Selector + Params + History + New Task */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44 sm:w-48">
              <CustomSelect
                value={activeTask.model}
                onChange={(val) => updateActiveTask((prev) => ({ ...prev, model: val }))}
                options={ALL_MODEL_OPTIONS}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowModelConfig((v) => !v)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                showModelConfig
                  ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 text-sky-700 dark:text-sky-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50'
              }`}
            >
              <AdjustmentsHorizontal className="w-4 h-4" /> 参数
            </button>

            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 whitespace-nowrap shrink-0 tabular-nums"
            >
              历史版本 ({activeTask.versions.length})
            </button>

            <button
              type="button"
              onClick={startFreshTask}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-sky-600 hover:border-sky-300 whitespace-nowrap shrink-0"
            >
              新稿件
            </button>
          </div>
        </div>

        {/* Expandable Model Parameter Panel (Strictly Honest About Real API Support) */}
        {showModelConfig && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 bg-sky-50/40 dark:bg-gray-800/40 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                <label htmlFor="polish-temp">温度 (Temperature)</label>
                <span>{activeTask.temperature}</span>
              </div>
              <input
                id="polish-temp"
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                disabled={!currentModelSupportsSampling}
                value={activeTask.temperature}
                onChange={(e) =>
                  updateActiveTask((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                }
                title={!currentModelSupportsSampling ? '当前 Gemini 4 接口未传递此参数，调整不生效' : undefined}
                style={!currentModelSupportsSampling ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                className="w-full h-1.5 bg-sky-100 rounded-lg appearance-none accent-sky-600 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                <label htmlFor="polish-topp">核采样 (Top P)</label>
                <span>{activeTask.topP}</span>
              </div>
              <input
                id="polish-topp"
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={!currentModelSupportsSampling}
                value={activeTask.topP}
                onChange={(e) =>
                  updateActiveTask((prev) => ({ ...prev, topP: parseFloat(e.target.value) }))
                }
                title={!currentModelSupportsSampling ? '当前 Gemini 4 接口未传递此参数，调整不生效' : undefined}
                style={!currentModelSupportsSampling ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                className="w-full h-1.5 bg-sky-100 rounded-lg appearance-none accent-sky-600 cursor-pointer"
              />
            </div>

            {!currentModelSupportsSampling && (
              <p role="note" className="md:col-span-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <InformationCircle className="w-4 h-4 shrink-0" />
                当前 Gemini 4 接口未传递温度和 Top P，以上对应滑块不生效，已禁用；切换至千问或 DeepSeek 后可正常调节。
              </p>
            )}
          </div>
        )}

        {/* Toast & Persistence Strip */}
        {(toastMsg || hasUnsavedChanges) && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              {hasUnsavedChanges
                ? '当前模式存在尚未另存为新版本的结果，原稿始终保持独立。'
                : '原稿始终独立保留；所有模式互不覆盖。'}
            </span>
            {toastMsg && (
              <span role="status" className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {toastMsg}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Small-screen Pane Switcher */}
      <div className="lg:hidden flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex gap-2">
        <button
          type="button"
          onClick={() => setMobilePane('original')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
            mobilePane === 'original'
              ? 'bg-sky-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          原稿输入（{fullOrigChars} 字）
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('result')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
            mobilePane === 'result'
              ? 'bg-sky-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          {getPolishModeLabel(activeMode)}工作区
        </button>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT PANE: COMMON MANUSCRIPT INPUT & SCOPE */}
        <section
          className={`${
            mobilePane === 'original' ? 'flex' : 'hidden'
          } lg:flex flex-col w-full lg:w-[44%] xl:w-[45%] border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden`}
        >
          {/* Manuscript Toolbar */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2 bg-sky-50/30 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white">原稿内容</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {fullOrigChars.toLocaleString()} 字
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleFileUpload(file);
                }}
              />
              <button
                type="button"
                disabled={isUploadingFile}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 whitespace-nowrap"
              >
                <CloudArrowUp className="w-3.5 h-3.5" />
                {isUploadingFile ? '读取中…' : '上传文件'}
              </button>

              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5 text-sky-600" /> 从作品/素材导入
              </button>

              {activeTask.originalText && (
                <button
                  type="button"
                  onClick={() => {
                    const clear = () =>
                      updateActiveTask((prev) => ({
                        ...prev,
                        originalText: '',
                        selectionStart: 0,
                        selectionEnd: 0,
                      }));
                    if (hasUnsavedChanges) {
                      setConfirmModal({
                        title: '确认清空原稿',
                        message: '当前存在未保存结果，确认清空编辑区原稿文本吗？',
                        confirmLabel: '确认清空',
                        onConfirm: () => {
                          setConfirmModal(null);
                          clear();
                        },
                      });
                    } else {
                      clear();
                    }
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  title="清空原稿"
                >
                  <Trash className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Scope Bar: Full Text vs Selected Portion */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-black/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">处理范围：</span>
              <div className="flex bg-gray-200/70 dark:bg-gray-800 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => updateActiveTask((prev) => ({ ...prev, scope: 'full' }))}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    activeTask.scope === 'full'
                      ? 'bg-white dark:bg-gray-700 text-sky-700 dark:text-sky-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  处理全文
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveTask((prev) => ({ ...prev, scope: 'selection' }))}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    activeTask.scope === 'selection'
                      ? 'bg-white dark:bg-gray-700 text-sky-700 dark:text-sky-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  仅处理选中部分
                </button>
              </div>
            </div>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {activeTask.scope === 'selection'
                ? scopeChars > 0
                  ? `已选中 ${scopeChars} 字`
                  : '请在下方拖选需要处理的段落'
                : `待处理 ${fullOrigChars} 字`}
            </span>
          </div>

          {uploadError && (
            <p role="alert" className="px-4 py-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100">
              {uploadError}
            </p>
          )}

          {/* Editorial Locator Switch when Editorial Mode has suggestions */}
          {activeMode === 'editorial' && activeTask.editorial.suggestions.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditorialViewTab('locate')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    editorialViewTab === 'locate'
                      ? 'bg-amber-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-amber-100/60'
                  }`}
                >
                  原文定位高亮
                </button>
                <button
                  type="button"
                  onClick={() => setEditorialViewTab('edit')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    editorialViewTab === 'edit'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-amber-100/60'
                  }`}
                >
                  编辑原稿文本
                </button>
              </div>
              {editorialViewTab === 'locate' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditorialDocView('original')}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      editorialDocView === 'original'
                        ? 'text-amber-700 dark:text-amber-300 underline font-bold'
                        : 'text-gray-500'
                    }`}
                  >
                    看保留原稿
                  </button>
                  <span className="text-gray-300">/</span>
                  <button
                    type="button"
                    onClick={() => setEditorialDocView('working')}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      editorialDocView === 'working'
                        ? 'text-sky-700 dark:text-sky-300 underline font-bold'
                        : 'text-gray-500'
                    }`}
                  >
                    看当前修订稿
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Left Pane Body: Either Editorial Highlight Locator OR Editable Manuscript Textarea */}
          {activeMode === 'editorial' &&
          activeTask.editorial.suggestions.length > 0 &&
          editorialViewTab === 'locate' ? (
            <div
              ref={editorialLocateRef}
              className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap select-text"
            >
              {editorialHighlightParts.map((part, idx) => {
                if (!part.suggestion) {
                  return (
                    <span key={idx} data-text-start={part.start} data-text-end={part.end}>
                      {part.text}
                    </span>
                  );
                }
                const s = part.suggestion;
                const isFocused = s.id === activeSuggestionId;
                const toneClass =
                  s.status === 'accepted'
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 border-b-2 border-emerald-500'
                    : s.status === 'kept'
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-400'
                      : 'bg-amber-100/90 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 border-b-2 border-amber-500';
                return (
                  <mark
                    key={`${s.id}-${idx}`}
                    data-text-start={part.start}
                    data-text-end={part.end}
                    onClick={() => setActiveSuggestionId(s.id)}
                    className={`cursor-pointer rounded px-0.5 transition-all ${toneClass} ${
                      isFocused ? 'ring-2 ring-amber-500 dark:ring-amber-400 font-medium' : ''
                    }`}
                    title={s.issue}
                  >
                    {part.text}
                  </mark>
                );
              })}
            </div>
          ) : (
            <div
              className="flex-1 flex flex-col overflow-hidden"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            >
              <textarea
                ref={originalTextareaRef}
                value={activeTask.originalText}
                onChange={(e) =>
                  updateActiveTask((prev) => ({
                    ...prev,
                    title:
                      prev.title === '未命名稿件' && e.target.value.trim()
                        ? deriveTitleFromText(e.target.value)
                        : prev.title,
                    originalText: e.target.value,
                  }))
                }
                onSelect={captureTextareaSelection}
                onMouseUp={captureTextareaSelection}
                onKeyUp={captureTextareaSelection}
                placeholder="在此直接粘贴小说或文章原稿，或点击上方「上传文件」导入 .txt / .md / .docx，也可拖拽文件到此处..."
                className="flex-1 w-full p-5 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 leading-relaxed resize-none outline-none"
              />
              {activeTask.scope === 'selection' && scopeChars > 0 && (
                <div className="flex-shrink-0 px-4 py-2 bg-sky-50/70 dark:bg-sky-950/20 border-t border-sky-100 dark:border-sky-900/40 text-xs text-sky-800 dark:text-sky-300 flex items-center justify-between gap-2">
                  <span className="truncate">
                    已选片段：「{scopeInfo.text.slice(0, 40)}
                    {scopeInfo.text.length > 40 ? '…' : ''}」（{scopeChars} 字）
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveTask((prev) => ({ ...prev, selectionStart: 0, selectionEnd: 0 }))
                    }
                    className="text-sky-600 hover:underline shrink-0"
                  >
                    清除选区
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT PANE: MODE-SPECIFIC WORKFLOW */}
        <section
          className={`${
            mobilePane === 'result' ? 'flex' : 'hidden'
          } lg:flex flex-1 flex-col bg-gray-50/60 dark:bg-black/40 overflow-hidden`}
        >
          {/* ============================================================
              MODE 1: LIGHT POLISH WORKSPACE
          ============================================================ */}
          {activeMode === 'light' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Controls & Focuses */}
              <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                      轻度润色 · 保留故事，精简表达
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      默认保留人物关系、因果顺序、人称口吻、结局、伏笔线索与有意设计的情绪节奏；不擅自新增事件与对话。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isGenerating ? (
                      <button
                        type="button"
                        onClick={handleStopGeneration}
                        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <Stop className="w-4 h-4" /> 停止生成
                      </button>
                    ) : (
                      <>
                        {activeTask.light.resumable && (
                          <button
                            type="button"
                            onClick={() => void runLightPolish(true)}
                            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                          >
                            <Play className="w-4 h-4" /> 继续生成
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void runLightPolish(false)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                            activeTask.light.resumable || activeTask.light.prosePreview
                              ? 'border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 hover:bg-sky-100'
                              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm'
                          }`}
                        >
                          {activeTask.light.prosePreview ? (
                            <>
                              <ArrowPath className="w-4 h-4" /> 重新生成
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" /> 开始润色
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Focus Checkboxes */}
                <div className="flex flex-wrap gap-2">
                  {LIGHT_POLISH_FOCUSES.map((focus) => {
                    const checked = activeTask.light.focuses.includes(focus.id);
                    return (
                      <button
                        key={focus.id}
                        type="button"
                        onClick={() =>
                          updateActiveTask((prev) => {
                            const has = prev.light.focuses.includes(focus.id);
                            return {
                              ...prev,
                              light: {
                                ...prev.light,
                                focuses: has
                                  ? prev.light.focuses.filter((x) => x !== focus.id)
                                  : [...prev.light.focuses, focus.id],
                              },
                            };
                          })
                        }
                        title={focus.description}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                          checked
                            ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-500 text-sky-700 dark:text-sky-300'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-sky-300'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 text-sky-600" />}
                        <span>{focus.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Status & Honest Error Banner */}
                {(isGenerating || activeTask.light.statusText || activeTask.light.errorText) && (
                  <div className="space-y-2">
                    {(isGenerating || activeTask.light.statusText) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sky-50/80 dark:bg-sky-950/30 text-xs text-sky-800 dark:text-sky-300 tabular-nums">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isGenerating && <ArrowPath className="w-3.5 h-3.5 animate-spin" />}
                          {isGenerating ? generatingStage : activeTask.light.statusText}
                        </span>
                        {activeTask.light.modelUsed && (
                          <span className="text-sky-700/80 dark:text-sky-400/80">
                            使用模型：{activeTask.light.modelUsed}
                          </span>
                        )}
                      </div>
                    )}
                    {activeTask.light.errorText && (
                      <div
                        role="alert"
                        className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
                      >
                        <ExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{activeTask.light.errorText}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Diff Comparison + Single/Batch Actions */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                {!activeTask.light.prosePreview && !isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                    <Sparkles className="w-12 h-12 mb-3 text-sky-200 dark:text-sky-900" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      选择润色侧重点后点击「开始润色」
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-md">
                      完成后将展示删增对照视图；点击任意改动可查看“为什么这样改”，并支持单条采纳、保留原文或撤销。
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Metrics & Bulk Controls */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-gray-600 dark:text-gray-300 tabular-nums space-x-2">
                        <span>原稿 {lightMetrics.sourceChars} 字</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-sky-700 dark:text-sky-400">
                          当前采纳成稿 {lightMetrics.confirmedChars} 字
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>润色预览 {lightMetrics.previewChars} 字</span>
                        {activeTask.light.changes.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              待决定 {lightMetrics.pending} · 已采纳 {lightMetrics.accepted} · 保留原文 {lightMetrics.rejected}
                            </span>
                          </>
                        )}
                      </div>

                      {activeTask.light.changes.length > 0 && !isGenerating && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => bulkSetLightChanges('accepted')}
                            className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                          >
                            全部采纳
                          </button>
                          <button
                            type="button"
                            onClick={() => bulkSetLightChanges('rejected')}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold"
                          >
                            全部保留原文
                          </button>
                          <button
                            type="button"
                            onClick={() => bulkSetLightChanges('pending')}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 text-xs font-semibold"
                          >
                            全部撤销
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Interactive Inline Diff Prose View */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800 text-xs">
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          润色对照视图（点击高亮处可查看修改原因并逐条决定）
                        </span>
                        <div className="flex items-center gap-3 text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded bg-rose-200 dark:bg-rose-900/60" /> 删除
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded bg-sky-200 dark:bg-sky-900/60" /> 建议新增/改写
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded bg-emerald-200 dark:bg-emerald-900/60" /> 已采纳
                          </span>
                        </div>
                      </div>

                      {isGenerating || lightDiffSegments.length === 0 ? (
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                          {activeTask.light.prosePreview}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                          {lightDiffSegments.map((seg, idx) => {
                            if (seg.type === 'equal' || !seg.change) {
                              return <span key={idx}>{seg.text}</span>;
                            }
                            const chg = seg.change;
                            const isSelected = selectedChangeId === chg.id;

                            if (chg.status === 'accepted') {
                              return (
                                <button
                                  key={chg.id}
                                  type="button"
                                  onClick={() => setSelectedChangeId(chg.id)}
                                  className={`inline text-left rounded px-1 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-b border-emerald-400 transition-all ${
                                    isSelected ? 'ring-2 ring-sky-500' : ''
                                  }`}
                                  title="已采纳：点击查看原因或撤销"
                                >
                                  {chg.revised || '（已删去冗余句）'}
                                </button>
                              );
                            }

                            if (chg.status === 'rejected') {
                              return (
                                <button
                                  key={chg.id}
                                  type="button"
                                  onClick={() => setSelectedChangeId(chg.id)}
                                  className={`inline text-left rounded px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-400 transition-all ${
                                    isSelected ? 'ring-2 ring-sky-500' : ''
                                  }`}
                                  title="已保留原文：点击查看建议或撤销"
                                >
                                  {chg.original}
                                </button>
                              );
                            }

                            // Pending diff: restrained rose strikethrough + sky insertion
                            return (
                              <button
                                key={chg.id}
                                type="button"
                                onClick={() => setSelectedChangeId(chg.id)}
                                className={`inline text-left rounded px-1 py-0.5 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 transition-all ${
                                  isSelected ? 'ring-2 ring-sky-500' : ''
                                }`}
                              >
                                {chg.original && (
                                  <del className="bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 line-through mr-1 px-0.5 rounded">
                                    {chg.original}
                                  </del>
                                )}
                                {chg.revised && (
                                  <ins className="no-underline bg-sky-100/80 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100 px-0.5 rounded font-medium">
                                    {chg.revised}
                                  </ins>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Selected Change Detail ("为什么这样改") */}
                    {selectedLightChange && (
                      <div className="bg-white dark:bg-gray-900 rounded-xl border border-sky-300 dark:border-sky-800 p-4 space-y-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                            为什么这样改 · 状态：
                            {selectedLightChange.status === 'accepted'
                              ? '已采纳'
                              : selectedLightChange.status === 'rejected'
                                ? '已保留原文'
                                : '待决定'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setLightChangeStatus(selectedLightChange.id, 'accepted')}
                              className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                            >
                              采纳
                            </button>
                            <button
                              type="button"
                              onClick={() => setLightChangeStatus(selectedLightChange.id, 'rejected')}
                              className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold"
                            >
                              保留原文
                            </button>
                            {selectedLightChange.status !== 'pending' && (
                              <button
                                type="button"
                                onClick={() => setLightChangeStatus(selectedLightChange.id, 'pending')}
                                className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <ArrowUturnLeft className="w-3.5 h-3.5" /> 撤销
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                          <span className="font-semibold text-gray-900 dark:text-white">修改理由：</span>
                          {selectedLightChange.reason}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
                            <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1">原句</div>
                            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {selectedLightChange.original || '（新增片段）'}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
                            <div className="font-semibold text-sky-700 dark:text-sky-300 mb-1">润色后</div>
                            <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                              {selectedLightChange.revised || '（建议删去此处）'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Light Mode Bottom Action Bar */}
              {activeTask.light.prosePreview && (
                <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    {copyErrorMsg ? (
                      <span role="alert" className="text-rose-600">{copyErrorMsg}</span>
                    ) : (
                      <span>
                        {lightMetrics.accepted > 0
                          ? `当前将按已采纳的 ${lightMetrics.accepted} 处修改保存/复制（其余保持原稿）`
                          : lightMetrics.rejected > 0 && lightMetrics.pending === 0
                            ? '当前全部选择保留原文，保存/复制将与原稿一致'
                            : '尚未逐条确认时，将按完整润色预览复制或另存新版本；也可先逐条采纳/保留原文'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyText(lightMetrics.confirmedText)}
                      className="px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      {copyStatus === 'copied' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> 复制结果
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveNewVersion(false)}
                      className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      <FloppyDisk className="w-3.5 h-3.5" /> 另存为新版本
                    </button>
                    {userId && activeConfirmedOutput && (
                      <button
                        type="button"
                        onClick={() => setSaveCreationModal({ open: true, content: activeConfirmedOutput.content })}
                        className="px-3.5 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs font-semibold hover:bg-sky-100"
                      >
                        存入创作中心
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSendActiveResultToImitate}
                      className="px-3.5 py-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-100 inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 用于文风仿写
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              MODE 2: DEEP REWRITE WORKSPACE (MULTI-STEP PIPELINE)
          ============================================================ */}
          {activeMode === 'deep' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Step Header */}
              <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                      深度重写 · 先确认故事骨架，再重构全文表达
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      提取骨架后不会自动重写，必须由你编辑、锁定关键要素并确认后再开始重写。
                    </p>
                  </div>

                  {/* Step Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      { id: 'input', label: '1. 提取骨架' },
                      { id: 'skeleton', label: '2. 确认与锁定骨架' },
                      { id: 'settings', label: '3. 模型与写法设置' },
                      { id: 'result', label: '4. 对照检查与定稿' },
                    ].map((s) => {
                      const canJump =
                        s.id === 'input' ||
                        (s.id === 'skeleton' && Boolean(activeTask.deep.skeleton)) ||
                        (s.id === 'settings' && Boolean(activeTask.deep.skeleton)) ||
                        (s.id === 'result' && Boolean(activeTask.deep.rewrittenText || isGenerating));
                      const active = activeTask.deep.step === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={!canJump || isGenerating}
                          onClick={() =>
                            updateActiveTask((prev) => ({
                              ...prev,
                              deep: { ...prev.deep, step: s.id as any },
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-purple-600 text-white'
                              : canJump
                                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status & Error */}
                {(isGenerating || activeTask.deep.statusText || activeTask.deep.skeletonStatus || activeTask.deep.errorText) && (
                  <div className="space-y-2">
                    {(isGenerating || activeTask.deep.statusText || activeTask.deep.skeletonStatus) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-purple-50/80 dark:bg-purple-950/30 text-xs text-purple-800 dark:text-purple-200 tabular-nums">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isGenerating && <ArrowPath className="w-3.5 h-3.5 animate-spin" />}
                          {isGenerating
                            ? generatingStage
                            : activeTask.deep.step === 'skeleton'
                              ? activeTask.deep.skeletonStatus
                              : activeTask.deep.statusText}
                        </span>
                        {activeTask.deep.modelUsed && (
                          <span>使用模型：{activeTask.deep.modelUsed}</span>
                        )}
                      </div>
                    )}
                    {activeTask.deep.errorText && (
                      <div
                        role="alert"
                        className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
                      >
                        <ExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{activeTask.deep.errorText}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Step 1: Extract Skeleton Prompt */}
                {activeTask.deep.step === 'input' && (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center space-y-4 max-w-xl mx-auto my-8">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
                      <Pencil className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      第一步：先提取原稿故事骨架
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      模型将从原稿中梳理出「人物关系、主要事件顺序、核心冲突、故事节奏、关键细节与结局」6 项骨架卡片。
                      提取完毕后会停在确认页供你编辑和锁定，不会擅自直接开始重写。
                    </p>
                    <div className="pt-2 flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => void runExtractSkeleton()}
                        className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        提取故事骨架（{scopeChars} 字）
                      </button>
                      {activeTask.deep.skeleton && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveTask((prev) => ({
                              ...prev,
                              deep: { ...prev.deep, step: 'skeleton' },
                            }))
                          }
                          className="px-4 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-sm font-semibold hover:bg-purple-50"
                        >
                          查看已有骨架
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Confirm & Lock 6 Skeleton Cards */}
                {activeTask.deep.step === 'skeleton' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                          确认与微调故事骨架
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          点击右上角「锁定」可要求后续重写尽量严格遵循该条目；生成后支持复查是否偏离锁定项（锁定属于强约束引导，建议生成后对照核对）。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isGenerating ? (
                          <button
                            type="button"
                            onClick={handleStopGeneration}
                            className="px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold flex items-center gap-1"
                          >
                            <Stop className="w-3.5 h-3.5" /> 停止提取
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void runExtractSkeleton()}
                            className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50"
                          >
                            重新提取骨架
                          </button>
                        )}
                        {activeTask.deep.skeleton && !isGenerating && (
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveTask((prev) => ({
                                ...prev,
                                deep: { ...prev.deep, step: 'settings' },
                              }))
                            }
                            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                          >
                            确认骨架，下一步设置写法
                          </button>
                        )}
                      </div>
                    </div>

                    {activeTask.deep.skeleton && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {SKELETON_CARD_META.map((meta) => {
                          const card = activeTask.deep.skeleton![meta.key];
                          return (
                            <div
                              key={meta.key}
                              className={`bg-white dark:bg-gray-900 rounded-xl border p-4 space-y-2.5 transition-colors ${
                                card.locked
                                  ? 'border-purple-400 dark:border-purple-700 bg-purple-50/20 dark:bg-purple-950/10'
                                  : 'border-gray-200 dark:border-gray-800'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {meta.label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActiveTask((prev) => {
                                      if (!prev.deep.skeleton) return prev;
                                      const cur = prev.deep.skeleton[meta.key];
                                      return {
                                        ...prev,
                                        deep: {
                                          ...prev.deep,
                                          skeleton: {
                                            ...prev.deep.skeleton,
                                            [meta.key]: { ...cur, locked: !cur.locked },
                                          },
                                        },
                                      };
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border transition-colors ${
                                    card.locked
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300'
                                  }`}
                                >
                                  {card.locked ? (
                                    <>
                                      <LockClosed className="w-3.5 h-3.5" /> 已锁定
                                    </>
                                  ) : (
                                    <>
                                      <LockOpen className="w-3.5 h-3.5" /> 锁定
                                    </>
                                  )}
                                </button>
                              </div>
                              <textarea
                                value={card.content}
                                onChange={(e) =>
                                  updateActiveTask((prev) => {
                                    if (!prev.deep.skeleton) return prev;
                                    const cur = prev.deep.skeleton[meta.key];
                                    return {
                                      ...prev,
                                      deep: {
                                        ...prev.deep,
                                        skeleton: {
                                          ...prev.deep.skeleton,
                                          [meta.key]: { ...cur, content: e.target.value },
                                        },
                                      },
                                    };
                                  })
                                }
                                placeholder={meta.placeholder}
                                rows={4}
                                className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-gray-200 leading-relaxed focus:ring-2 focus:ring-purple-500 outline-none resize-y"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Rewrite Settings (Reusing TargetLength!) */}
                {activeTask.deep.step === 'settings' && (
                  <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">
                        重写模型与写法设置
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveTask((prev) => ({
                            ...prev,
                            deep: { ...prev.deep, step: 'skeleton' },
                          }))
                        }
                        className="text-xs font-semibold text-purple-600 hover:underline"
                      >
                        返回修改骨架
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          人称与视角（默认保持原稿）
                        </label>
                        <CustomSelect
                          value={activeTask.deep.perspective}
                          onChange={(val) =>
                            updateActiveTask((prev) => ({
                              ...prev,
                              deep: { ...prev.deep, perspective: val },
                            }))
                          }
                          options={PERSPECTIVE_OPTIONS.map((p) => ({ value: p, label: p }))}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          结局处理（默认保持原稿结局）
                        </label>
                        <CustomSelect
                          value={activeTask.deep.endingPreference}
                          onChange={(val) =>
                            updateActiveTask((prev) => ({
                              ...prev,
                              deep: { ...prev.deep, endingPreference: val },
                            }))
                          }
                          options={ENDING_OPTIONS.map((p) => ({ value: p, label: p }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        希望的写法与补充要求
                      </label>
                      <textarea
                        value={activeTask.deep.styleNotes}
                        onChange={(e) =>
                          updateActiveTask((prev) => ({
                            ...prev,
                            deep: { ...prev.deep, styleNotes: e.target.value },
                          }))
                        }
                        placeholder="例如：加强冷峻压抑的氛围对比、减少直接心理独白、改为多用动作和对话推进冲突..."
                        rows={4}
                        className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>

                    {/* Reuse Site's Unified TargetLength Component */}
                    <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 space-y-2">
                      <TargetLength
                        value={activeTask.deep.targetChars}
                        onChange={(val) =>
                          updateActiveTask((prev) => ({
                            ...prev,
                            deep: { ...prev.deep, targetChars: val },
                          }))
                        }
                      />
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        说明：模型输出预算不直接等同中文字数，目标字数用于节奏分配参考，不保证模型必达精确字数；只要正常写完故事即判定「已完成」。
                      </p>
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => void runDeepRewrite(false)}
                        disabled={isGenerating}
                        className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        开始重写全文
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Deep Rewrite Result, 3-Way Comparison & Consistency Check */}
                {activeTask.deep.step === 'result' && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { id: 'split', label: '对照原稿与重写稿' },
                          { id: 'skeleton', label: '核对已确认骨架' },
                          { id: 'result', label: '专注阅读重写稿' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setDeepCompareTab(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              deepCompareTab === tab.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums ml-2">
                          原稿 {scopeChars} 字 · 重写稿 {countContentChars(activeTask.deep.rewrittenText)} 字
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isGenerating ? (
                          <button
                            type="button"
                            onClick={handleStopGeneration}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold flex items-center gap-1"
                          >
                            <Stop className="w-3.5 h-3.5" /> 停止生成
                          </button>
                        ) : (
                          <>
                            {activeTask.deep.resumable && (
                              <button
                                type="button"
                                onClick={() => void runDeepRewrite(true)}
                                className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1"
                              >
                                <Play className="w-3.5 h-3.5" /> 继续生成
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void runDeepRewrite(false)}
                              className="px-3.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 text-xs font-semibold flex items-center gap-1"
                            >
                              <ArrowPath className="w-3.5 h-3.5" /> 重新生成
                            </button>
                            <button
                              type="button"
                              disabled={isCheckingConsistency || !activeTask.deep.rewrittenText.trim()}
                              onClick={() => void runDeviationCheck()}
                              className="px-3.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 hover:bg-sky-100 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {isCheckingConsistency ? '核对中…' : '检查锁定细节一致性'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Locked-detail Consistency Check Result (Zero Fake Scores) */}
                    {(activeTask.deep.deviationNotice || activeTask.deep.deviations.length > 0) && (
                      <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          {activeTask.deep.deviationNotice}
                        </p>
                        {activeTask.deep.deviations.map((dev) => (
                          <div
                            key={dev.id}
                            className="p-3 rounded-lg bg-white dark:bg-gray-900 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-1"
                          >
                            <div className="font-bold text-gray-900 dark:text-white">
                              可能偏离项：{dev.fieldLabel}
                            </div>
                            {dev.paragraphExcerpt && (
                              <div className="text-gray-500 dark:text-gray-400">
                                相关片段：「{dev.paragraphExcerpt}」
                              </div>
                            )}
                            <div className="text-amber-800 dark:text-amber-300">{dev.note}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Compare Views */}
                    {deepCompareTab === 'skeleton' && activeTask.deep.skeleton ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {SKELETON_CARD_META.map((meta) => {
                          const item = activeTask.deep.skeleton![meta.key];
                          return (
                            <div
                              key={meta.key}
                              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-xs font-bold text-gray-900 dark:text-white">
                                <span>{meta.label}</span>
                                {item.locked && (
                                  <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                    <LockClosed className="w-3.5 h-3.5" /> 已锁定
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                {item.content || '（未填写）'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : deepCompareTab === 'split' ? (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                          <div className="text-xs font-bold text-gray-500 mb-3">原稿对照</div>
                          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[520px] overflow-y-auto">
                            {activeTask.deep.sourceSnapshot || scopeInfo.text}
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-purple-200 dark:border-purple-900/50 p-5">
                          <div className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-3">重写稿</div>
                          <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-h-[520px] overflow-y-auto">
                            {activeTask.deep.rewrittenText || (isGenerating ? '正在构思并生成正文…' : '暂无内容')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-gray-900 rounded-xl border border-purple-200 dark:border-purple-900/50 p-6">
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-w-3xl">
                          {activeTask.deep.rewrittenText}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Deep Rewrite Bottom Action Bar */}
              {activeTask.deep.rewrittenText.trim() && (
                <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    {copyErrorMsg ? (
                      <span role="alert" className="text-rose-600">{copyErrorMsg}</span>
                    ) : (
                      <span>原稿始终独立保留，可将重写稿另存为新版本或带入文风仿写。</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyText(activeConfirmedOutput?.content || activeTask.deep.rewrittenText)}
                      className="px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 inline-flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      {copyStatus === 'copied' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> 复制结果
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveNewVersion(false)}
                      className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <FloppyDisk className="w-3.5 h-3.5" /> 另存为新版本
                    </button>
                    {userId && activeConfirmedOutput && (
                      <button
                        type="button"
                        onClick={() => setSaveCreationModal({ open: true, content: activeConfirmedOutput.content })}
                        className="px-3.5 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs font-semibold"
                      >
                        存入创作中心
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSendActiveResultToImitate}
                      className="px-3.5 py-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 用于文风仿写
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              MODE 3: EDITORIAL SUGGESTIONS WORKSPACE
          ============================================================ */}
          {activeMode === 'editorial' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Controls */}
              <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                      编辑建议 · 定位具体问题，逐条决定采纳或保留
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      点击建议卡片即可在左侧定位高亮原文；采纳修改后将自动重算其余建议位置，避免错位。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isGenerating ? (
                      <button
                        type="button"
                        onClick={handleStopGeneration}
                        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Stop className="w-4 h-4" /> 停止生成
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runEditorialSuggestions()}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <ClipboardDocumentCheck className="w-4 h-4" />
                        {activeTask.editorial.suggestions.length > 0 ? '重新获取建议' : '获取建议'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Editorial Focus Selection */}
                <div className="flex flex-wrap gap-2">
                  {EDITORIAL_FOCUSES.map((focus) => {
                    const checked = activeTask.editorial.focuses.includes(focus.id);
                    return (
                      <button
                        key={focus.id}
                        type="button"
                        onClick={() =>
                          updateActiveTask((prev) => {
                            const has = prev.editorial.focuses.includes(focus.id);
                            return {
                              ...prev,
                              editorial: {
                                ...prev.editorial,
                                focuses: has
                                  ? prev.editorial.focuses.filter((x) => x !== focus.id)
                                  : [...prev.editorial.focuses, focus.id],
                              },
                            };
                          })
                        }
                        title={focus.description}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                          checked
                            ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-300'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-amber-300'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 text-amber-600" />}
                        <span>{focus.label}</span>
                      </button>
                    );
                  })}
                </div>

                {(isGenerating || activeTask.editorial.statusText || activeTask.editorial.errorText) && (
                  <div className="space-y-2">
                    {(isGenerating || activeTask.editorial.statusText) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 tabular-nums">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isGenerating && <ArrowPath className="w-3.5 h-3.5 animate-spin" />}
                          {isGenerating ? generatingStage : activeTask.editorial.statusText}
                        </span>
                        {activeTask.editorial.modelUsed && (
                          <span>使用模型：{activeTask.editorial.modelUsed}</span>
                        )}
                      </div>
                    )}
                    {activeTask.editorial.errorText && (
                      <div
                        role="alert"
                        className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
                      >
                        <ExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{activeTask.editorial.errorText}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Suggestion Filter + List */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                {activeTask.editorial.suggestions.length === 0 && !isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                    <ClipboardDocumentCheck className="w-12 h-12 mb-3 text-amber-200 dark:text-amber-900" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      选择关注方向后点击「获取建议」
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-md">
                      系统会针对实际文本定位具体问题，并逐条给出原因与参考改法，由你亲自决定采纳或保留。
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Filter Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {(
                          [
                            { id: 'all', label: `全部 (${activeTask.editorial.suggestions.length})` },
                            {
                              id: 'pending',
                              label: `待处理 (${activeTask.editorial.suggestions.filter((s) => s.status === 'pending').length})`,
                            },
                            {
                              id: 'accepted',
                              label: `已采纳 (${activeTask.editorial.suggestions.filter((s) => s.status === 'accepted').length})`,
                            },
                            {
                              id: 'kept',
                              label: `保留原文 (${activeTask.editorial.suggestions.filter((s) => s.status === 'kept').length})`,
                            },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setEditorialFilter(f.id)}
                            className={`px-3 py-1 rounded-lg font-semibold transition-colors tabular-nums ${
                              editorialFilter === f.id
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">
                        当前修订稿 {countContentChars(activeTask.editorial.workingText)} 字
                      </span>
                    </div>

                    {/* Suggestion Cards */}
                    <div className="space-y-3">
                      {filteredEditorialSuggestions.map((s, idx) => {
                        const isActiveCard = activeSuggestionId === s.id;
                        const statusLabel =
                          s.status === 'accepted'
                            ? '已采纳'
                            : s.status === 'kept'
                              ? '保留原文'
                              : '待处理';
                        const statusTextTone =
                          s.status === 'accepted'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : s.status === 'kept'
                              ? 'text-gray-500 dark:text-gray-400'
                              : 'text-amber-700 dark:text-amber-400';

                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              setActiveSuggestionId(s.id);
                              setEditorialViewTab('locate');
                            }}
                            className={`bg-white dark:bg-gray-900 rounded-xl border p-4 space-y-2.5 cursor-pointer transition-all ${
                              isActiveCard
                                ? 'border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900/50'
                                : 'border-gray-200 dark:border-gray-800 hover:border-amber-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  #{idx + 1} · {s.category}
                                </span>
                                <span aria-hidden="true" className="text-gray-300">·</span>
                                <span className={`font-semibold ${statusTextTone}`}>{statusLabel}</span>
                                {s.startOffset < 0 && (
                                  <span className="text-rose-500">（未能精确自动定位原文）</span>
                                )}
                              </div>
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={s.needsAuthorInput || s.startOffset < 0}
                                  onClick={() => updateSuggestionDecision(s.id, 'accepted')}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                    s.status === 'accepted'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-sky-600 hover:bg-sky-500 text-white disabled:bg-gray-200 disabled:text-gray-400'
                                  }`}
                                >
                                  {s.status === 'accepted' ? '已采纳' : '采纳修改'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateSuggestionDecision(s.id, 'kept')}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                    s.status === 'kept'
                                      ? 'bg-gray-700 text-white border-gray-700'
                                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  保留原文
                                </button>
                                {s.status !== 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => updateSuggestionDecision(s.id, 'pending')}
                                    className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 text-xs font-semibold inline-flex items-center gap-1"
                                  >
                                    <ArrowUturnLeft className="w-3 h-3" /> 撤销
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/70 text-xs text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-800">
                              <span className="font-semibold text-gray-500">对应原文：</span>
                              「{s.quote}」
                            </div>

                            <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1 leading-relaxed">
                              <p>
                                <span className="font-semibold text-gray-900 dark:text-white">具体问题：</span>
                                {s.issue}
                              </p>
                              <p>
                                <span className="font-semibold text-gray-900 dark:text-white">修改理由：</span>
                                {s.reason}
                              </p>
                            </div>

                            <div
                              className={`p-2.5 rounded-lg text-xs border ${
                                s.needsAuthorInput
                                  ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                                  : 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/40 text-gray-800 dark:text-gray-200'
                              }`}
                            >
                              <div className="font-semibold mb-0.5">
                                {s.needsAuthorInput
                                  ? '需作者补充信息（未直接写进正文）：'
                                  : '建议改法：'}
                              </div>
                              <div className="whitespace-pre-wrap">{s.suggestion}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Action Bar for Editorial Mode */}
              {activeTask.editorial.suggestions.length > 0 && (
                <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    {copyErrorMsg ? (
                      <span role="alert" className="text-rose-600">{copyErrorMsg}</span>
                    ) : (
                      <span>已采纳修改会自动合并为修订稿，原稿始终单独保留。</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyText(activeConfirmedOutput?.content || activeTask.editorial.workingText)}
                      className="px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 inline-flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      {copyStatus === 'copied' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> 复制修订稿
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveNewVersion(false)}
                      className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <FloppyDisk className="w-3.5 h-3.5" /> 另存为新版本
                    </button>
                    {userId && activeConfirmedOutput && (
                      <button
                        type="button"
                        onClick={() => setSaveCreationModal({ open: true, content: activeConfirmedOutput.content })}
                        className="px-3.5 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs font-semibold"
                      >
                        存入创作中心
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSendActiveResultToImitate}
                      className="px-3.5 py-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 用于文风仿写
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ArticlePolish;
