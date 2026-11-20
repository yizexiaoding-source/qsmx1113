import ImitationDirections from './ImitationDirections';
import TargetLength from './TargetLength';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CREATIVE_MODULES, PROMPTS } from '../constants';
import CreativeCard from './CreativeCard';
import { CreativeModule, Asset, Prompt, PromptCategory } from '../types';
import { generateTextStream, countContentChars, GenerationInterrupted, resolveStoryTarget } from '../services/geminiService';
import { ChevronDoubleLeft, Sparkles, Copy, Database, AdjustmentsHorizontal, Search, DocumentText, X, BookOpen, ChevronDown, Check, Stop, InformationCircle, ArrowPath, Play, CloudArrowUp, Trash, FloppyDisk } from './Icon';
import PromptSelectionModal from './PromptSelectionModal';
import AssetSelectionModal from './AssetSelectionModal'; 
import { saveMaterial, incrementPromptHeat, fetchMaterials, getCurrentUserId, fetchPrompts } from '../services/supabaseService';
import LoadingOverlay from './LoadingOverlay';
import ImportAssetModal from './ImportAssetModal';
import CustomSelect from './CustomSelect';
import { extractTextFromFile, isManuscriptField } from '../utils/fileText';
import {
  WorkbenchDraftRecord,
  ImitateDraftPayload,
  ImitationDraftSlot,
  saveWorkbenchDraft,
  buildDraftPreview,
  deriveDraftTitle,
} from '../utils/workbenchDrafts';

interface CreativeGenerationProps {
  initialData?: {
    prompt?: Prompt;
    values?: Record<string, string>;
    moduleId?: string;
    imitationManuscript?: {
      text: string;
      title?: string;
    };
    draftRestore?: WorkbenchDraftRecord | null;
    draftUpdatedReq?: { note?: string; model?: string; targetChars?: number } | null;
  };
  onClearInitialData?: () => void;
}

// 修改：增加更严格的“纯净输出”指令，禁止角色扮演式的开场白
const FORCE_LONG_INSTRUCTION = "\n\n【专业创作指令】：\n1. **深度扩写模式**：请采用“分层迭代生成”策略。不要概括情节，而是通过大量的细节描写（环境烘托、动作拆解、心理独白、感官体验）来丰富内容。如果用户要求长篇幅，请务必通过极其细腻的描写来达到字数要求，严禁敷衍或提前收尾。\n2. **字数突破**：请充分利用输出长度限制，将每一个细小的动作和心理变化都展开撰写，确保单次输出尽可能充实且逻辑严密。\n3. **严禁输出**任何与正文无关的对话填充内容（如：“你好！我是xx大神”、“根据您的要求...”、“以下是为您生成的...”等）。\n4. **直接输出**创作内容本身，不要有开场白或结束语。\n5. **逻辑一致性**：严格遵循前文设定的角色性格、世界观和逻辑。";
const TARGET_LENGTH_INSTRUCTION = "\n\n【专业创作指令】：\n1. **精准控字创作**：通过自然的场景、动作、对话与心理描写展开剧情，但必须严格围绕设定目标字数分配全篇节奏，严禁提前草草收尾，也严禁超出字数上限。\n2. **严禁输出**任何与正文无关的对话填充内容（如：“你好！我是xx大神”、“根据您的要求...”、“以下是为您生成的...”等）。\n3. **直接输出**创作内容本身，不要有开场白、结尾感言或字数说明。\n4. **逻辑一致性**：严格遵循前文设定的角色性格、世界观和逻辑。";

// 辅助函数：去除 Markdown 标记转为纯文本
const stripMarkdown = (text: string) => {
    return text
        .replace(/#+\s/g, '') // 去除标题 #
        .replace(/\*\*|\*/g, '') // 去除加粗和斜体 *
        .replace(/>\s/g, '') // 去除引用 >
        .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 去除链接，保留文字
        .replace(/`{1,3}.*?`{1,3}/gs, '') // 去除代码块
        .replace(/<think>[\s\S]*?<\/think>/g, '') // 去除 R1 思索过程
        .trim();
};

// 辅助函数：清洗 Placeholder，移除英文和变量符号
const cleanPlaceholder = (text: string | undefined, label: string) => {
    if (!text) return `请输入${label}...`;
    let cleaned = text.replace(/\$\{[^}]+\}/g, '');
    cleaned = cleaned.replace(/[a-zA-Z]/g, '');
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/^[:：]\s*/, '');
    if (!/[\u4e00-\u9fa50-9]/.test(cleaned)) {
         return `请输入${label}...`;
    }
    return cleaned;
};

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
    const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    return (
        <div className="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 leading-relaxed text-sm">
            {cleanedText.split('\n').map((line, index) => {
                const trimmedLine = line.trim();
                const isMarkdownHeader = trimmedLine.startsWith('#');
                
                if (isMarkdownHeader) {
                    const match = trimmedLine.match(/^(#+)\s*(.*)/);
                    if (match) {
                        const level = Math.min(match[1].length, 6);
                        const content = match[2];
                        
                        let className = "font-bold text-gray-900 dark:text-white ";
                        if (level === 1) className += "text-xl mt-6 mb-4";
                        else if (level === 2) className += "text-lg mt-5 mb-3";
                        else className += "text-base mt-4 mb-2";
                        
                        return <div key={index} className={className}>{content}</div>;
                    }
                }
                
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                    <div key={index} className="min-h-[1.5em] mb-1">
                        {parts.map((part, i) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                                return <span key={i} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</span>;
                            }
                            return <span key={i}>{part}</span>;
                        })}
                    </div>
                );
            })}
        </div>
    );
};

const CreativeGeneration: React.FC<CreativeGenerationProps> = ({ initialData, onClearInitialData }) => {
    const [selectedModule, setSelectedModule] = useState<CreativeModule | null>(null);
    const [model, setModel] = useState('deepseek-chat');
    const [temperature, setTemperature] = useState(1);
    const [topP, setTopP] = useState(0.95);
    const maxOutputTokens = 32768;
    const [targetChars, setTargetChars] = useState(0);
    const [generationStatus, setGenerationStatus] = useState('');
    const [generationError, setGenerationError] = useState('');
    const [canResume, setCanResume] = useState(false);
    const taskOptionsRef = useRef<any>(null);
    const [showConfig, setShowConfig] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [formState, setFormState] = useState<Record<string, string>>({});
    const [freeInput, setFreeInput] = useState('');
    const [generatedText, setGeneratedText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isWaitingForFirstChunk, setIsWaitingForFirstChunk] = useState(false);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [promptModalOpen, setPromptModalOpen] = useState(false);
    const [assetModalOpen, setAssetModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showInlineSuccess, setShowInlineSuccess] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
    
    const [uploadedManuscriptInfo, setUploadedManuscriptInfo] = useState<Record<string, { name: string; chars: number }>>({});
    const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
    const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
    const manuscriptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const [pendingImitationManuscript, setPendingImitationManuscript] = useState<{ text: string; title?: string } | null>(null);
    const [restoredImitationState, setRestoredImitationState] = useState<ImitateDraftPayload['imitationState'] | null>(null);
    const [draftRestoreNote, setDraftRestoreNote] = useState('');
    const [manualDraftMsg, setManualDraftMsg] = useState('');

    // 新增：用于存储上一次完整的 Prompt，以便在“继续生成”时保持上下文一致性
    const lastPromptRef = useRef<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isUserScrollingRef = useRef(false);
    const userIdRef = useRef<string | null>(null);
    const imitationSnapshotRef = useRef<ImitateDraftPayload['imitationState'] | null>(null);
    const latestWorkbenchRef = useRef<{
        selectedModule: CreativeModule | null;
        selectedPrompt: Prompt | null;
        formState: Record<string, string>;
        freeInput: string;
        selectedAssetIds: Set<string>;
        model: string;
        temperature: number;
        topP: number;
        targetChars: number;
        generatedText: string;
        imitationMode: boolean;
    }>({
        selectedModule: null,
        selectedPrompt: null,
        formState: {},
        freeInput: '',
        selectedAssetIds: new Set(),
        model: 'deepseek-chat',
        temperature: 1,
        topP: 0.95,
        targetChars: 0,
        generatedText: '',
        imitationMode: false,
    });

    useEffect(() => {
        getCurrentUserId()
            .then((uid) => {
                userIdRef.current = uid;
            })
            .catch(() => {
                userIdRef.current = null;
            });
    }, []);

    const saveCreativeDraft = useCallback(
        (
            saveType: 'manual' | 'auto',
            statusOverride?: string,
            imitationOverride?: ImitateDraftPayload['imitationState']
        ) => {
            const snap = latestWorkbenchRef.current;
            if (!snap.selectedModule) return null;
            const imitationData = snap.imitationMode
                ? (imitationOverride || imitationSnapshotRef.current || undefined)
                : undefined;
            const hasFieldValues = Object.values(snap.formState).some((v) => String(v || '').trim().length > 0);
            const hasImitationPlans = Boolean(imitationData?.plans?.length);
            const hasImitationDrafts = Boolean(
                imitationData?.drafts &&
                (Object.values(imitationData.drafts) as ImitationDraftSlot[]).some((d) => Boolean(d?.text?.trim()))
            );
            const hasContent = Boolean(
                snap.selectedPrompt ||
                snap.freeInput.trim() ||
                hasFieldValues ||
                snap.generatedText.trim() ||
                hasImitationPlans ||
                hasImitationDrafts
            );
            if (!hasContent) return null;

            const activeDraftSlot =
                imitationData?.drafts?.[imitationData.active] ||
                (imitationData?.drafts
                    ? (Object.values(imitationData.drafts) as ImitationDraftSlot[]).find((d) => Boolean(d?.text?.trim()))
                    : undefined);
            const outputText = snap.imitationMode
                ? (activeDraftSlot?.text ||
                    (imitationData?.plans || [])
                        .map((p, i) => `方案${i + 1}：${p.title}\n${p.summary}`)
                        .join('\n\n'))
                : snap.generatedText;

            const nonManuscriptValues = snap.selectedPrompt
                ? snap.selectedPrompt.fields
                      .filter((f) => String(snap.formState[f.id] || '').trim().length > 0 && countContentChars(snap.formState[f.id] || '') <= 300)
                      .map((f) => `${f.label}：${String(snap.formState[f.id] || '').trim()}`)
                : [];
            const requirementsParts = [
                snap.selectedPrompt ? `模板：${snap.selectedPrompt.title}` : '',
                ...nonManuscriptValues,
                !snap.selectedPrompt && snap.freeInput.trim() ? `要求：${buildDraftPreview(snap.freeInput, 80)}` : '',
                snap.targetChars > 0 ? `目标字数：${snap.targetChars} 字` : '',
            ].filter(Boolean);

            const longestFieldText = Object.values(snap.formState)
                .map((v) => String(v || ''))
                .sort((a, b) => b.length - a.length)[0] || '';
            const sourceText = longestFieldText || snap.freeInput || '';

            const payload: ImitateDraftPayload = {
                mode: snap.imitationMode ? 'directions' : 'standard',
                moduleId: snap.selectedModule.id,
                moduleTitle: snap.selectedModule.title,
                promptId: snap.selectedPrompt?.id,
                promptTitle: snap.selectedPrompt?.title,
                formState: { ...snap.formState },
                freeInput: snap.freeInput,
                selectedAssetIds: Array.from(snap.selectedAssetIds),
                model: snap.model,
                temperature: snap.temperature,
                topP: snap.topP,
                targetChars: snap.targetChars,
                generatedText: snap.generatedText,
                imitationState: imitationData,
            };

            const titleBase = snap.selectedPrompt?.title
                ? `${snap.selectedModule.title} · ${snap.selectedPrompt.title}`
                : deriveDraftTitle(outputText || sourceText, snap.selectedModule.title);

            const saved = saveWorkbenchDraft(userIdRef.current, {
                autoSlotKey: saveType === 'auto' ? `auto-imitate-${snap.selectedModule.id}` : undefined,
                category: 'imitate',
                saveType,
                title: titleBase,
                model: snap.model,
                requirementsNote: requirementsParts.join('；') || snap.selectedModule.title,
                outputPreview: buildDraftPreview(outputText || sourceText, 140),
                outputCharCount: countContentChars(activeDraftSlot?.text || snap.generatedText || ''),
                sourceCharCount: countContentChars(sourceText),
                statusLabel: statusOverride || (saveType === 'auto' ? '退出自动保留' : '手动存为草稿'),
                payload,
            });

            if (saveType === 'manual') {
                setManualDraftMsg('已存为草稿（可在个人中心 · 我的草稿查看）');
                setTimeout(() => setManualDraftMsg(''), 3200);
            }
            return saved;
        },
        []
    );

    useEffect(() => {
        if (initialData?.draftRestore) {
            const payload = initialData.draftRestore.payload as ImitateDraftPayload;
            const req = initialData.draftUpdatedReq;
            const targetModule =
                CREATIVE_MODULES.find((m) => m.id === payload.moduleId) ||
                CREATIVE_MODULES.find((m) => m.id === 'imitate-style') ||
                CREATIVE_MODULES[0];

            const nextModel = req?.model || payload.model || 'deepseek-chat';
            const nextTargetChars = req?.targetChars !== undefined ? req.targetChars : (payload.targetChars || 0);
            const nextNote = req?.note?.trim() || '';

            setSelectedModule(targetModule);
            setModel(nextModel);
            setTemperature(typeof payload.temperature === 'number' ? payload.temperature : 1);
            setTopP(typeof payload.topP === 'number' ? payload.topP : 0.95);
            setTargetChars(nextTargetChars);
            setSelectedAssetIds(new Set(payload.selectedAssetIds || []));
            setGeneratedText(payload.generatedText || '');
            setCanResume(Boolean(payload.generatedText?.trim()));
            setGenerationError('');
            setGenerationStatus(payload.generatedText?.trim() ? '草稿已载入' : '');
            setDraftRestoreNote(nextNote);

            const restoredForm: Record<string, string> = { ...(payload.formState || {}) };
            let nextFreeInput = payload.freeInput || '';

            const staticPrompt = payload.promptId ? PROMPTS.find((p) => p.id === payload.promptId) || null : null;
            const buildFallbackPrompt = (): Prompt | null => {
                if (!payload.promptId && !payload.promptTitle && Object.keys(restoredForm).length === 0) return null;
                const keys = Object.keys(restoredForm);
                const fields = (keys.length > 0 ? keys : ['content']).map((key) => ({
                    id: key,
                    label: key === 'content' ? '创作内容' : key,
                    type: 'textarea' as const,
                    placeholder: '请输入内容...',
                }));
                return {
                    id: payload.promptId || 'restored-prompt',
                    title: payload.promptTitle || targetModule.title,
                    description: '从草稿恢复的提示词模板',
                    content: '',
                    category: (targetModule.category || 'general') as PromptCategory,
                    subCategories: targetModule.subCategories || [],
                    fields,
                    template: fields.map((f) => `\${${f.id}}`).join('\n'),
                    heat: 0,
                    creator: 'user',
                };
            };

            const resolvedPrompt = staticPrompt || buildFallbackPrompt();
            if (resolvedPrompt && nextNote) {
                const textareaCount = resolvedPrompt.fields.filter((f) => f.type === 'textarea').length;
                const nonManuscriptField =
                    resolvedPrompt.fields.find((f) => !isManuscriptField(f, targetModule.id === 'imitate-style', textareaCount)) ||
                    resolvedPrompt.fields[0];
                if (nonManuscriptField) {
                    const prevVal = restoredForm[nonManuscriptField.id] || '';
                    if (!prevVal.includes(nextNote)) {
                        restoredForm[nonManuscriptField.id] = prevVal ? `${prevVal}\n【新要求】${nextNote}` : nextNote;
                    }
                }
            } else if (!resolvedPrompt && nextNote) {
                if (!nextFreeInput.includes(nextNote)) {
                    nextFreeInput = nextFreeInput ? `${nextFreeInput}\n【新要求】${nextNote}` : nextNote;
                }
            }

            setFormState(restoredForm);
            setFreeInput(nextFreeInput);
            setSelectedPrompt(resolvedPrompt);

            if (payload.imitationState) {
                setRestoredImitationState(payload.imitationState);
                imitationSnapshotRef.current = payload.imitationState;
            } else {
                setRestoredImitationState(null);
                imitationSnapshotRef.current = null;
            }

            // Reconstruct prompt ref for immediate "继续生成"
            const basePrompt = resolvedPrompt
                ? resolvedPrompt.fields.reduce(
                      (txt, f) => txt.split('${' + f.id + '}').join(restoredForm[f.id] || ''),
                      resolvedPrompt.template
                  )
                : nextFreeInput;
            lastPromptRef.current = basePrompt;
            const resolvedTarget = nextTargetChars || resolveStoryTarget(basePrompt) || undefined;
            taskOptionsRef.current = {
                model: nextModel,
                taskPrompt: basePrompt,
                temperature: typeof payload.temperature === 'number' ? payload.temperature : 1,
                topP: typeof payload.topP === 'number' ? payload.topP : 0.95,
                maxOutputTokens,
                targetChars: resolvedTarget,
                stageControl: Boolean(resolvedTarget),
                autoRecover: true,
                onStatus: setGenerationStatus,
            };

            // Hydrate exact DB prompt asynchronously if it wasn't in static PROMPTS
            if (payload.promptId && !staticPrompt) {
                fetchPrompts({ category: 'all', limit: 100, search: payload.promptTitle || '' })
                    .then((dbPrompts: any[]) => {
                        const hit = (dbPrompts || []).find((p) => p.id === payload.promptId);
                        if (!hit) return;
                        let parsedContent: any = {};
                        try {
                            parsedContent = JSON.parse(hit.content);
                        } catch {
                            parsedContent = { template: hit.content };
                        }
                        const hydrated: Prompt = {
                            id: hit.id,
                            title: hit.title,
                            description: parsedContent.description || '用户自定义提示词',
                            example: parsedContent.example || '',
                            content: parsedContent.template || hit.content,
                            category: (hit.main_category === 'long' ? 'long-story' : hit.main_category === 'short' ? 'short-story' : hit.main_category || 'general') as PromptCategory,
                            subCategories: parsedContent.subCategories || (hit.sub_category ? [hit.sub_category] : []),
                            fields: parsedContent.fields || [],
                            template: parsedContent.template || hit.content,
                            heat: hit.usage_count || 0,
                            creator: 'user',
                            authorName: hit.profiles?.username || parsedContent.authorName || '用户',
                        };
                        setSelectedPrompt(hydrated);
                    })
                    .catch(() => {});
            }

            if (onClearInitialData) {
                onClearInitialData();
            }
            return;
        }

        if (initialData?.prompt) {
            setSelectedModule(CREATIVE_MODULES.find(module => module.subCategories.some(category => initialData.prompt!.subCategories.includes(category))) || CREATIVE_MODULES[0]);
            setSelectedPrompt(initialData.prompt);
            setRestoredImitationState(null);
            setDraftRestoreNote('');
            if (initialData.values) {
                setFormState(initialData.values);
            }
            if (onClearInitialData) {
                onClearInitialData();
            }
        } else if (initialData?.moduleId) {
            const targetModule = CREATIVE_MODULES.find(module => module.id === initialData.moduleId);
            if (targetModule) {
                resetState();
                setSelectedModule(targetModule);
                if (initialData.imitationManuscript?.text) {
                    setPendingImitationManuscript(initialData.imitationManuscript);
                }
            }
            if (onClearInitialData) {
                onClearInitialData();
            }
        }
    }, [initialData, onClearInitialData]);

    useEffect(() => {
        if (assetModalOpen) {
            const loadAssets = async () => {
                const data = await fetchMaterials();
                setAssets(data.map((item: any) => ({
                    id: item.id, name: item.name, type: item.type === 'idea' ? 'inspiration' : item.type, content: item.content, tags: item.tags || []
                })));
            };
            loadAssets();
        }
    }, [assetModalOpen]);

    useEffect(() => {
        const loadAssets = async () => {
            const data = await fetchMaterials();
            setAssets(data.map((item: any) => ({
                id: item.id, name: item.name, type: item.type === 'idea' ? 'inspiration' : item.type, content: item.content, tags: item.tags || []
                })));
        };
        loadAssets();
    }, []);

    const selectedAssetNames = useMemo(() => Array.from(selectedAssetIds).map(id => assets.find(a => a.id === id)?.name).filter(Boolean).join(', '), [selectedAssetIds, assets]);

    useEffect(() => {
        if (isGenerating && !isUserScrollingRef.current && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'auto' });
        }
    }, [generatedText, isGenerating]);

    const handleScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight <= 50;
            isUserScrollingRef.current = !isAtBottom;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setGenerationStatus('已暂停，草稿已保留');
        setCanResume(true);
        setIsWaitingForFirstChunk(false);
        setShowLoadingOverlay(false);
        saveCreativeDraft('auto', '暂停生成自动保留');
    };

    const resetState = () => {
        setFormState({});
        setUploadedManuscriptInfo({});
        setUploadErrors({});
        setUploadingFieldId(null);
        setFreeInput('');
        setGeneratedText('');
        setSelectedPrompt(null);
        setSelectedAssetIds(new Set());
        setSuccessMessage('');
        setIsGenerating(false);
        setIsWaitingForFirstChunk(false);
        setPendingImitationManuscript(null);
        setRestoredImitationState(null);
        setDraftRestoreNote('');
        imitationSnapshotRef.current = null;
        isUserScrollingRef.current = false;
        lastPromptRef.current = '';
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const handleSelectPrompt = (prompt: Prompt) => {
        setSelectedPrompt(prompt);
        setUploadedManuscriptInfo({});
        setUploadErrors({});
        if (pendingImitationManuscript?.text) {
            const isImitate = Boolean(prompt.subCategories?.includes('imitate') || prompt.title.includes('仿写'));
            const textareaCount = prompt.fields.filter(field => field.type === 'textarea').length;
            const targetField =
                prompt.fields.find(f => f.type === 'textarea' && isManuscriptField(f, isImitate, textareaCount)) ||
                prompt.fields.find(f => f.type === 'textarea');
            if (targetField) {
                setFormState(prev => ({ ...prev, [targetField.id]: pendingImitationManuscript.text }));
                setUploadedManuscriptInfo({
                    [targetField.id]: {
                        name: pendingImitationManuscript.title || '来自文章润色',
                        chars: countContentChars(pendingImitationManuscript.text),
                    },
                });
                setPendingImitationManuscript(null);
            }
        }
    };

    const handleSelectModule = (m: CreativeModule) => {
        resetState();
        setSelectedModule(m);
    };

    const handleExitModule = () => {
        saveCreativeDraft('auto', '退出创作区自动保留');
        resetState();
        setSelectedModule(null);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            e.target.value = '';
            setUploadErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next; });
            try {
                const contents = await Promise.all(files.map(async (file: File) => {
                    const text = await extractTextFromFile(file);
                    return `【文件: ${file.name}】\n${text}\n`;
                }));
                setFormState(prev => ({
                    ...prev,
                    [fieldId]: (prev[fieldId] || '') + contents.join('\n')
                }));
            } catch (err: any) {
                setUploadErrors(prev => ({ ...prev, [fieldId]: err?.message || '读取文件失败，请检查文件格式' }));
            }
        }
    };

    const handleManuscriptFileUpload = async (file: File | undefined, fieldId: string) => {
        if (!file) return;
        setUploadingFieldId(fieldId);
        setUploadErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next; });
        try {
            const text = await extractTextFromFile(file);
            setFormState(prev => ({ ...prev, [fieldId]: text }));
            setUploadedManuscriptInfo(prev => ({
                ...prev,
                [fieldId]: { name: file.name, chars: countContentChars(text) }
            }));
        } catch (err: any) {
            setUploadErrors(prev => ({ ...prev, [fieldId]: err?.message || '上传原稿失败，请检查文件格式' }));
        } finally {
            setUploadingFieldId(null);
        }
    };

    const imitationMode = Boolean(
        selectedPrompt?.subCategories?.includes('imitate') ||
        selectedPrompt?.title.includes('仿写') ||
        Boolean(restoredImitationState)
    );
    const preparedPrompt = selectedPrompt
        ? selectedPrompt.fields.reduce((text, f) => text.split('${' + f.id + '}').join(formState[f.id] || ''), selectedPrompt.template)
        : freeInput;

    latestWorkbenchRef.current = {
        selectedModule,
        selectedPrompt,
        formState,
        freeInput,
        selectedAssetIds,
        model,
        temperature,
        topP,
        targetChars,
        generatedText,
        imitationMode,
    };

    useEffect(() => {
        const handleBeforeLeave = () => {
            saveCreativeDraft('auto', '退出自动保留');
        };
        window.addEventListener('beforeunload', handleBeforeLeave);
        window.addEventListener('pagehide', handleBeforeLeave);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeLeave);
            window.removeEventListener('pagehide', handleBeforeLeave);
            handleBeforeLeave();
        };
    }, [saveCreativeDraft]);

    const handleGenerate = async () => {
        if (isGenerating) return;
        setGenerationError(''); setCanResume(false); setGenerationStatus('正在生成');
        setIsGenerating(true);
        setIsWaitingForFirstChunk(true);
        isUserScrollingRef.current = false;
        setGeneratedText('');
        
        let basePrompt = selectedPrompt ? selectedPrompt.template : freeInput;
        if (selectedPrompt) {
            incrementPromptHeat(selectedPrompt.id);
            selectedPrompt.fields.forEach(f => basePrompt = basePrompt.replace(new RegExp(`\\$\\{${f.id}\\}`, 'g'), formState[f.id] || ''));
        }
        if (draftRestoreNote && !basePrompt.includes(draftRestoreNote)) {
            basePrompt += `\n\n【补充/新要求】\n${draftRestoreNote}`;
        }
        const assetContext = Array.from(selectedAssetIds).map(id => assets.find(a => a.id === id)).filter(Boolean).map(a => `【参考：${a!.name}】\n${a!.content}`).join('\n\n');
        
        let finalPrompt = assetContext ? `${assetContext}\n\n---\n\n${basePrompt}` : basePrompt;
        
        // 保存原始 Prompt 以便续写使用
        lastPromptRef.current = finalPrompt;

        const resolvedTarget = targetChars || resolveStoryTarget(basePrompt) || undefined;
        // Append instruction compatible with target length
        finalPrompt += resolvedTarget ? TARGET_LENGTH_INSTRUCTION : FORCE_LONG_INSTRUCTION;

        const requestOptions = { model, taskPrompt: basePrompt, temperature, topP, maxOutputTokens, targetChars: resolvedTarget, stageControl: Boolean(resolvedTarget), autoRecover: true, onStatus: setGenerationStatus };
        taskOptionsRef.current = requestOptions;
        const controller = new AbortController(); abortControllerRef.current = controller;
        let completedText = '';
        try {
            const stream = generateTextStream(finalPrompt, { ...requestOptions, signal: controller.signal });
            let first = true;
            for await (const chunk of stream) {
                if (first) { 
                    setShowLoadingOverlay(false); 
                    setIsWaitingForFirstChunk(false);
                    first = false; 
                }
                completedText += chunk;
                setGeneratedText(prev => prev + chunk);
            }
            if (!controller.signal.aborted) {
                setSuccessMessage(`生成完成 · 实际 ${countContentChars(completedText)} 字`);
                setShowInlineSuccess(true);
                setTimeout(() => setShowInlineSuccess(false), 3000);
            }
        } catch (e: any) {
            if (!controller.signal.aborted && e?.message !== 'Aborted') {
                const errMsg = e?.message || '生成请求异常，请重试或切换其他模型。';
                setGenerationError(errMsg); setGenerationStatus('生成未完成');
                setCanResume(Boolean(completedText.trim()) || (e instanceof GenerationInterrupted && e.recoverable));
                saveCreativeDraft('auto', '生成中断自动保留');
            }
        } finally {
            setIsGenerating(false);
            setIsWaitingForFirstChunk(false);
            setShowLoadingOverlay(false);
        }
    };

    const handleContinue = async () => {
        if (isGenerating || !taskOptionsRef.current) return;
        setIsGenerating(true); setCanResume(false); setGenerationError('');
        setGenerationStatus('正在接续同一篇正文');
        const controller = new AbortController(); abortControllerRef.current = controller;
        let latestText = generatedText;
        try {
            for await (const chunk of generateTextStream(lastPromptRef.current + (taskOptionsRef.current.targetChars ? TARGET_LENGTH_INSTRUCTION : FORCE_LONG_INSTRUCTION), {
                ...taskOptionsRef.current, initialText: generatedText, signal: controller.signal
            })) {
                latestText += chunk;
                setGeneratedText(prev => prev + chunk);
            }
            if (!controller.signal.aborted) {
                setSuccessMessage(`生成完成 · 实际 ${countContentChars(latestText)} 字`);
                setShowInlineSuccess(true);
                setTimeout(() => setShowInlineSuccess(false), 3000);
            }
        } catch (e: any) {
            if (!controller.signal.aborted && e?.message !== 'Aborted') {
                setGenerationError(e.message || '恢复失败，草稿已保留'); setGenerationStatus('生成未完成');
                setCanResume(Boolean(latestText.trim()) || (e instanceof GenerationInterrupted && e.recoverable));
                saveCreativeDraft('auto', '续写中断自动保留');
            }
        } finally { setIsGenerating(false); }
    };

    const handleImportAsset = (data: { name: string; type: Asset['type']; tags: string[]; content: string }) => {
        saveMaterial(data.name, data.content, data.type === 'inspiration' ? 'idea' : data.type, data.tags);
        setSuccessMessage('已导入素材库');
        setShowInlineSuccess(true);
        setTimeout(() => setShowInlineSuccess(false), 3000);
    };

    const MODEL_OPTIONS = [
        { value: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen" },
        { value: "gemini-4-argon", label: "Gemini 4 Argon" },
        { value: "gemini-4-carbon", label: "Gemini 4 Carbon" },
        { value: "qwen3.8-flash", label: "千问 Qwen3.8-Flash" },
        { value: "deepseek-chat", label: "DeepSeek V4.1 Flash" },
    ];

    if (!selectedModule) {
        return (
            <div className="p-8 h-full animate-fade-in font-sans">
                <div className="mb-8"><h1 className="text-3xl font-bold text-gray-900 dark:text-white">创意生成</h1></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {CREATIVE_MODULES.map(m => <CreativeCard key={m.id} module={m} onSelect={() => handleSelectModule(m)} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-black overflow-hidden relative font-sans">
            <LoadingOverlay isVisible={showLoadingOverlay} onClose={() => setShowLoadingOverlay(false)} />
            <ImportAssetModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} content={generatedText} onSave={handleImportAsset} />
            {promptModalOpen && <PromptSelectionModal isOpen={promptModalOpen} onClose={() => setPromptModalOpen(false)} onSelect={handleSelectPrompt} initialSubCategory={selectedModule.subCategories[0] as any} />}
            <AssetSelectionModal isOpen={assetModalOpen} onClose={() => setAssetModalOpen(false)} assets={assets} selectedAssetIds={selectedAssetIds} onToggleAsset={(id) => setSelectedAssetIds(prev => { const next = new Set(prev); if(next.has(id)) next.delete(id); else next.add(id); return next; })} />

            <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200 bg-white dark:bg-gray-900 z-20 shadow-sm font-sans">
                <div className="flex items-center gap-3">
                    <button onClick={handleExitModule} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><ChevronDoubleLeft className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">{selectedModule.title}</h2>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                    {manualDraftMsg && (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {manualDraftMsg}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => saveCreativeDraft('manual', '手动存为草稿')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-xs font-bold transition-colors whitespace-nowrap"
                    >
                        <FloppyDisk className="w-4 h-4" />
                        <span>存为草稿</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                {/* 修改：减少左侧栏宽度，约减少 1/7 */}
                <div className="w-full lg:w-[370px] xl:w-[410px] flex flex-col border-r border-gray-200 bg-white dark:bg-gray-900 overflow-hidden z-10 [scrollbar-gutter:stable] font-sans">
                    <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-sm uppercase tracking-wider">
                                <div className="p-1.5 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                                    <AdjustmentsHorizontal className="w-4 h-4" />
                                </div>
                                模型配置
                            </div>
                            <div className="bg-sky-50/50 dark:bg-sky-900/5 p-4 rounded-2xl border border-sky-100 dark:border-sky-900/30">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <CustomSelect 
                                            value={model} 
                                            onChange={setModel} 
                                            options={MODEL_OPTIONS}
                                        />
                                    </div>
                                    <button onClick={() => setShowConfig(!showConfig)} className="px-3 py-2 text-xs font-bold rounded-lg border border-sky-100 bg-white dark:bg-gray-800 text-sky-600 flex items-center gap-1 hover:bg-sky-50 font-sans"><AdjustmentsHorizontal className="w-4 h-4" />参数</button>
                                </div>
                                {showConfig && (
                                    <div className="mt-4 pt-4 border-t border-sky-100/50 space-y-6 animate-fade-in font-sans">
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-sky-400 flex justify-between uppercase">
                                                <span>温度 (Temperature): {temperature}</span>
                                            </label>
                                            <input type="range" min="0" max="1.5" step="0.1" disabled={model.startsWith('gemini-4-')} title={model.startsWith('gemini-4-') ? '当前接口未传递此参数，调整不生效' : undefined} style={model.startsWith('gemini-4-') ? { opacity: 0.4, cursor: 'not-allowed' } : undefined} value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                                            <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                                <InformationCircle className="w-3 h-3 inline mr-1" />
                                                控制创作随机性。值越高越有“创意”，值越低越严谨、稳定。
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-sky-400 flex justify-between uppercase">
                                                <span>核采样 (Top P): {topP}</span>
                                            </label>
                                            <input type="range" min="0" max="1" step="0.05" disabled={model.startsWith('gemini-4-')} title={model.startsWith('gemini-4-') ? '当前接口未传递此参数，调整不生效' : undefined} style={model.startsWith('gemini-4-') ? { opacity: 0.4, cursor: 'not-allowed' } : undefined} value={topP} onChange={e => setTopP(parseFloat(e.target.value))} className="w-full h-1 bg-sky-100 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                                            <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                                <InformationCircle className="w-3 h-3 inline mr-1" />
                                                控制词汇多样性。值越高选词越丰富，值越低则更倾向于常用、稳妥的词汇。
                                            </p>
                                        </div>
{model.startsWith('gemini-4-') && <p className="text-xs text-amber-700 dark:text-amber-300" role="note">当前 Gemini 4 接口未传递温度和 Top P，以上对应滑块不生效，已禁用。目标字数仍用于正文生成要求。</p>}<TargetLength value={targetChars} onChange={setTargetChars} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-sm uppercase tracking-wider">
                                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                提示词与素材
                            </div>
                            <div className="grid grid-cols-2 gap-3 font-sans">
                                <button onClick={() => setPromptModalOpen(true)} className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 ${selectedPrompt ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-inner' : 'bg-white dark:bg-gray-900 border-gray-100 text-gray-500 hover:border-purple-300'}`}>
                                    <Search className="w-6 h-6 flex-shrink-0" />
                                    <span className="font-bold text-[11px] truncate w-full text-center">{selectedPrompt ? selectedPrompt.title : '选择提示词'}</span>
                                </button>
                                <button onClick={() => setAssetModalOpen(true)} className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 ${selectedAssetIds.size > 0 ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-inner' : 'bg-white dark:bg-gray-900 border-gray-100 text-gray-500 hover:border-purple-300'}`}>
                                    <Database className="w-6 h-6 flex-shrink-0" />
                                    <span className="font-bold text-[11px] truncate w-full text-center">{selectedAssetIds.size > 0 ? selectedAssetNames : '关联素材'}</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 font-sans">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm uppercase tracking-wider">
                                <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                    <DocumentText className="w-4 h-4" />
                                </div>
                                创作内容
                            </div>
                            <div className="bg-emerald-50/20 dark:bg-emerald-900/5 p-4 rounded-2xl border border-emerald-100/50 space-y-5">
                                {draftRestoreNote && !imitationMode && (
                                    <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200 flex items-center justify-between gap-2">
                                        <span>已从草稿载入新要求：「{draftRestoreNote}」，可直接点击下方「开始创作」。</span>
                                        <button
                                            type="button"
                                            onClick={() => setDraftRestoreNote('')}
                                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                                {selectedPrompt ? (
                                    <div className="space-y-5 animate-fade-in">
                                        {(() => {
                                            const textareaCount = selectedPrompt.fields.filter(field => field.type === 'textarea').length;
                                            return selectedPrompt.fields.map((f, i) => {
                                                const showManuscriptUpload = isManuscriptField(f, Boolean(imitationMode), textareaCount);
                                                const uploadedInfo = uploadedManuscriptInfo[f.id];
                                                const uploadErr = uploadErrors[f.id];
                                                const isUploading = uploadingFieldId === f.id;
                                                return (
                                            <div key={f.id} className="space-y-2">
                                                <div className="flex justify-between items-center gap-2 mr-1">
                                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">
                                                        {i+1}. {f.label}
                                                        {f.required !== false ? (
                                                            <span className="ml-1 text-red-500 font-normal">* (必填)</span>
                                                        ) : (
                                                            <span className="ml-1 text-gray-400 font-normal"> (选填)</span>
                                                        )}
                                                    </label>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {showManuscriptUpload && (
                                                            <>
                                                                <input
                                                                    ref={el => { manuscriptInputRefs.current[f.id] = el; }}
                                                                    type="file"
                                                                    accept=".txt,.md,.docx,.csv,.json"
                                                                    className="hidden"
                                                                    onChange={e => {
                                                                        const file = e.target.files?.[0];
                                                                        e.target.value = '';
                                                                        void handleManuscriptFileUpload(file, f.id);
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={isUploading}
                                                                    onClick={() => manuscriptInputRefs.current[f.id]?.click()}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
                                                                >
                                                                    <CloudArrowUp className="w-3.5 h-3.5" />
                                                                    <span>{isUploading ? '读取中…' : '上传原稿'}</span>
                                                                </button>
                                                            </>
                                                        )}
                                                        {f.maxLength && (
                                                            <span className={`text-[10px] ${(formState[f.id]?.length || 0) > f.maxLength ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                                                {formState[f.id]?.length || 0} / {f.maxLength}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {showManuscriptUpload && uploadedInfo && (
                                                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-xs text-emerald-700 dark:text-emerald-300">
                                                        <span className="truncate">已导入《{uploadedInfo.name}》· {uploadedInfo.chars} 字</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFormState(prev => ({ ...prev, [f.id]: '' }));
                                                                setUploadedManuscriptInfo(prev => { const next = { ...prev }; delete next[f.id]; return next; });
                                                            }}
                                                            className="inline-flex items-center gap-0.5 text-gray-500 hover:text-rose-600 flex-shrink-0"
                                                            title="清空已上传原稿"
                                                        >
                                                            <Trash className="w-3.5 h-3.5" />
                                                            <span>清空</span>
                                                        </button>
                                                    </div>
                                                )}
                                                {uploadErr && (
                                                    <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 px-1">{uploadErr}</p>
                                                )}
                                                {f.type === 'file' ? (
                                                    <div className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl transition-all font-sans">
                                                        <input 
                                                            type="file" 
                                                            multiple
                                                            accept=".txt,.md,.docx,.json,.csv"
                                                            onChange={(e) => handleFileChange(e, f.id)}
                                                            className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                                                        />
                                                        {formState[f.id] && (
                                                            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                                                已加载内容 ({countContentChars(formState[f.id])} 字): {formState[f.id].substring(0, 50)}...
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : f.type === 'textarea' ? (
                                                    <div
                                                        onDragOver={showManuscriptUpload ? (e) => { e.preventDefault(); } : undefined}
                                                        onDrop={showManuscriptUpload ? (e) => {
                                                            e.preventDefault();
                                                            const file = e.dataTransfer.files?.[0];
                                                            if (file) void handleManuscriptFileUpload(file, f.id);
                                                        } : undefined}
                                                    >
                                                        <textarea 
                                                            value={formState[f.id] || ''} 
                                                            onChange={e => setFormState({...formState, [f.id]: e.target.value})} 
                                                            placeholder={showManuscriptUpload ? '可直接输入/粘贴小说原稿，或点击上方「上传原稿」一键导入 .txt / .md / .docx 文件（也支持拖拽文件到此处）...' : cleanPlaceholder(f.placeholder, f.label)} 
                                                            maxLength={showManuscriptUpload && uploadedInfo ? undefined : f.maxLength}
                                                            className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm min-h-[100px] shadow-sm transition-all font-sans" 
                                                        />
                                                    </div>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        value={formState[f.id] || ''} 
                                                        onChange={e => setFormState({...formState, [f.id]: e.target.value})} 
                                                        placeholder={cleanPlaceholder(f.placeholder, f.label)} 
                                                        maxLength={f.maxLength}
                                                        className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm shadow-sm transition-all font-sans" 
                                                    />
                                                )}
                                                {f.description && <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1.5 ml-1 leading-relaxed">💡 {f.description}</p>}
                                            </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {pendingImitationManuscript && (
                                            <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200 space-y-1.5">
                                                <div className="flex items-center justify-between gap-2 font-bold">
                                                    <span className="truncate">
                                                        已从文章润色带入《{pendingImitationManuscript.title || '润色稿件'}》（{countContentChars(pendingImitationManuscript.text)} 字）
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPendingImitationManuscript(null)}
                                                        className="text-gray-400 hover:text-rose-500 flex-shrink-0"
                                                    >
                                                        清除
                                                    </button>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-sky-700/90 dark:text-sky-300/90">
                                                    请在上方点击「选择提示词」选用文风仿写模板，带入的原稿将自动填入「小说原稿」框。
                                                </p>
                                            </div>
                                        )}
                                        <textarea value={freeInput} onChange={e => setFreeInput(e.target.value)} placeholder="请输入您的创作灵感或详细要求..." className="w-full h-40 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none shadow-sm transition-all font-sans" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {!imitationMode && <div className="p-2 border-t bg-white dark:bg-gray-900 font-sans">
                        <button onClick={isGenerating ? handleStop : handleGenerate} className={`w-full py-2 rounded-2xl font-black text-white shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${isGenerating ? 'bg-rose-500 shadow-rose-500/20' : 'bg-sky-600 hover:bg-sky-50 shadow-sky-500/20'}`}>
                            {isGenerating ? <><Stop className="w-5 h-5" />停止生成</> : <><Sparkles className="w-5 h-5" />开始创作</>}
                        </button>
                    </div>}
                </div>

                <div className="flex-1 bg-gray-50 dark:bg-black/50 flex flex-col overflow-hidden font-sans">
                    <div className="w-full bg-white dark:bg-gray-900 h-full shadow-sm flex flex-col relative overflow-hidden font-sans">
                        {imitationMode ? (() => {
                            const imitationTarget = targetChars || resolveStoryTarget(preparedPrompt) || undefined;
                            const promptWithAssets =
                                preparedPrompt +
                                Array.from(selectedAssetIds).map(id => assets.find(a => a.id === id)?.content || '').join('\n') +
                                (draftRestoreNote && !preparedPrompt.includes(draftRestoreNote) ? `\n【补充/新要求】${draftRestoreNote}` : '');
                            return (
                                <ImitationDirections
                                    prompt={promptWithAssets}
                                    options={{ model, temperature, topP, maxOutputTokens, targetChars: imitationTarget, stageControl: true, bodyInstruction: imitationTarget ? TARGET_LENGTH_INSTRUCTION : FORCE_LONG_INSTRUCTION }}
                                    initialDraftState={restoredImitationState}
                                    draftRestoreNote={draftRestoreNote}
                                    onStateChange={(state) => {
                                        imitationSnapshotRef.current = state;
                                    }}
                                    onSaveManualDraft={() => saveCreativeDraft('manual', '手动存为草稿')}
                                    onAutoSaveDraft={(reason, latestState) => {
                                        if (latestState) imitationSnapshotRef.current = latestState;
                                        saveCreativeDraft('auto', reason, latestState);
                                    }}
                                />
                            );
                        })() : !generatedText && !isWaitingForFirstChunk && !generationError && !canResume ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50 p-8"><Sparkles className="w-20 h-20 mb-6" /><p className="text-lg font-medium">在左侧输入灵感，开启 AI 创作之旅</p></div>
                        ) : (
                            <>
                                {/* 修改：减少顶部栏高度，padding 从 py-4 改为 py-3 */}
                                <div className="flex-shrink-0 bg-white dark:bg-gray-900 px-8 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center z-10 font-sans">
                                    <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold text-lg">
                                        <Sparkles className="w-5 h-5 text-sky-500" />
                                        <span>生成结果</span>
                                        {showInlineSuccess && (
                                            <span className="ml-3 text-xs font-bold text-emerald-500 animate-fade-in flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" /> {successMessage}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <button onClick={() => { navigator.clipboard.writeText(generatedText); setSuccessMessage('已复制'); setShowInlineSuccess(true); setTimeout(()=>setShowInlineSuccess(false),3000); }} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors font-sans whitespace-nowrap"><Copy className="w-4 h-4" /> 复制</button>
                                        <button onClick={() => setImportModalOpen(true)} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-sans whitespace-nowrap"><Database className="w-4 h-4" /> 导入素材库</button>
                                        <button onClick={() => saveCreativeDraft('manual', '手动存为草稿')} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-sans whitespace-nowrap"><FloppyDisk className="w-4 h-4" /> 存为草稿</button>
                                    </div>
                                </div>
                                <div role="status" aria-live="polite" className="px-8 py-3 border-b text-sm text-sky-700 bg-sky-50 dark:bg-gray-800 dark:text-sky-300">
                                    <div className="flex items-center gap-2">{isGenerating && <ArrowPath className="w-4 h-4 animate-spin" />}<span>{generationStatus} · 已生成 {countContentChars(generatedText)} 字{taskOptionsRef.current?.targetChars ? ` / 目标 ${taskOptionsRef.current.targetChars} 字` : ''}</span></div>
                                    {taskOptionsRef.current?.targetChars > 0 && <progress aria-label="实际字数进度" className="w-full h-1 mt-2" max={taskOptionsRef.current.targetChars} value={Math.min(countContentChars(generatedText), taskOptionsRef.current.targetChars)} />}
                                    {generationError && <p role="alert" className="mt-2 text-amber-700 dark:text-amber-300">{generationError}</p>}
                                </div>
                                <div className="flex-1 overflow-y-auto px-10 py-8 relative font-sans scroll-smooth" ref={scrollContainerRef} onScroll={handleScroll}>
                                    {isWaitingForFirstChunk && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-10 animate-fade-in font-sans">
                                            <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-4"></div>
                                            <p className="text-sky-600 font-bold text-sm animate-pulse tracking-widest">AI 思考中...</p>
                                        </div>
                                    )}
                                    <FormattedText text={generatedText} />
                                    {/* Smart Continue/Regenerate Button */}
                                    {!isGenerating && (generatedText || canResume) && (
                                        <div className="mt-8 mb-4 flex justify-center animate-fade-in">
                                            {canResume ? (<div className="flex gap-3">
                                                <button 
                                                    onClick={handleContinue}
                                                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-full shadow-lg hover:shadow-sky-500/30 flex items-center gap-2 transition-all active:scale-95 text-sm"
                                                >
                                                    <Play className="w-4 h-4" /> 继续生成
                                                </button>

<button onClick={handleGenerate} className="px-6 py-2 rounded-full border text-sky-700">重新生成</button></div>
                                            ) : (
                                                <button 
                                                    onClick={handleGenerate}
                                                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-full shadow-sm hover:shadow-md flex items-center gap-2 transition-all active:scale-95 text-sm"
                                                >
                                                    <ArrowPath className="w-4 h-4" /> 重新生成
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreativeGeneration;
