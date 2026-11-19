import ImitationDirections from './ImitationDirections';
import TargetLength from './TargetLength';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CREATIVE_MODULES } from '../constants';
import CreativeCard from './CreativeCard';
import { CreativeModule, Asset, Prompt } from '../types';
import { generateTextStream, countContentChars, GenerationInterrupted, resolveStoryTarget } from '../services/geminiService';
import { ChevronDoubleLeft, Sparkles, Copy, Database, AdjustmentsHorizontal, Search, DocumentText, X, BookOpen, ChevronDown, Check, Stop, InformationCircle, ArrowPath, Play } from './Icon';
import PromptSelectionModal from './PromptSelectionModal';
import AssetSelectionModal from './AssetSelectionModal'; 
import { saveMaterial, incrementPromptHeat, fetchMaterials } from '../services/supabaseService';
import LoadingOverlay from './LoadingOverlay';
import ImportAssetModal from './ImportAssetModal';
import CustomSelect from './CustomSelect';

interface CreativeGenerationProps {
  initialData?: {
    prompt?: Prompt;
    values?: Record<string, string>;
  };
  onClearInitialData?: () => void;
}

// 修改：增加更严格的“纯净输出”指令，禁止角色扮演式的开场白
const FORCE_LONG_INSTRUCTION = "\n\n【专业创作指令】：\n1. **深度扩写模式**：请采用“分层迭代生成”策略。不要概括情节，而是通过大量的细节描写（环境烘托、动作拆解、心理独白、感官体验）来丰富内容。如果用户要求长篇幅，请务必通过极其细腻的描写来达到字数要求，严禁敷衍或提前收尾。\n2. **字数突破**：请充分利用输出长度限制，将每一个细小的动作和心理变化都展开撰写，确保单次输出尽可能充实且逻辑严密。\n3. **严禁输出**任何与正文无关的对话填充内容（如：“你好！我是xx大神”、“根据您的要求...”、“以下是为您生成的...”等）。\n4. **直接输出**创作内容本身，不要有开场白或结束语。\n5. **逻辑一致性**：严格遵循前文设定的角色性格、世界观和逻辑。";

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
    
    // 新增：用于存储上一次完整的 Prompt，以便在“继续生成”时保持上下文一致性
    const lastPromptRef = useRef<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isUserScrollingRef = useRef(false);

    useEffect(() => {
        if (initialData?.prompt) {
            setSelectedModule(CREATIVE_MODULES.find(module => module.subCategories.some(category => initialData.prompt!.subCategories.includes(category))) || CREATIVE_MODULES[0]);
            setSelectedPrompt(initialData.prompt);
            if (initialData.values) {
                setFormState(initialData.values);
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
    };

    const resetState = () => {
        setFormState({});
        setFreeInput('');
        setGeneratedText('');
        setSelectedPrompt(null);
        setSelectedAssetIds(new Set());
        setSuccessMessage('');
        setIsGenerating(false);
        setIsWaitingForFirstChunk(false);
        isUserScrollingRef.current = false;
        lastPromptRef.current = '';
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const handleSelectModule = (m: CreativeModule) => {
        resetState();
        setSelectedModule(m);
    };

    const handleExitModule = () => {
        resetState();
        setSelectedModule(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const readers = files.map((file: File) => {
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        resolve(`【文件: ${file.name}】\n${ev.target?.result as string}\n`);
                    };
                    reader.readAsText(file);
                });
            });

            Promise.all(readers).then(contents => {
                setFormState(prev => ({
                    ...prev,
                    [fieldId]: (prev[fieldId] || '') + contents.join('\n')
                }));
            });
        }
    };

    const imitationMode = selectedPrompt?.subCategories?.includes('imitate') || selectedPrompt?.title.includes('仿写');
    const preparedPrompt = selectedPrompt ? selectedPrompt.fields.reduce((text, f) => text.split('${'+f.id+'}').join(formState[f.id] || ''), selectedPrompt.template) : freeInput;

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
        const assetContext = Array.from(selectedAssetIds).map(id => assets.find(a => a.id === id)).filter(Boolean).map(a => `【参考：${a!.name}】\n${a!.content}`).join('\n\n');
        
        let finalPrompt = assetContext ? `${assetContext}\n\n---\n\n${basePrompt}` : basePrompt;
        
        // 保存原始 Prompt 以便续写使用
        lastPromptRef.current = finalPrompt;

        // Append verbose instruction
        finalPrompt += FORCE_LONG_INSTRUCTION;

        const requestOptions = { model, taskPrompt: basePrompt, temperature, topP, maxOutputTokens, targetChars: targetChars || resolveStoryTarget(basePrompt) || undefined, autoRecover: true, onStatus: setGenerationStatus };
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
            for await (const chunk of generateTextStream(lastPromptRef.current + FORCE_LONG_INSTRUCTION, {
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
            {promptModalOpen && <PromptSelectionModal isOpen={promptModalOpen} onClose={() => setPromptModalOpen(false)} onSelect={setSelectedPrompt} initialSubCategory={selectedModule.subCategories[0] as any} />}
            <AssetSelectionModal isOpen={assetModalOpen} onClose={() => setAssetModalOpen(false)} assets={assets} selectedAssetIds={selectedAssetIds} onToggleAsset={(id) => setSelectedAssetIds(prev => { const next = new Set(prev); if(next.has(id)) next.delete(id); else next.add(id); return next; })} />

            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white dark:bg-gray-900 z-20 shadow-sm font-sans">
                <div className="flex items-center gap-3">
                    <button onClick={handleExitModule} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><ChevronDoubleLeft className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">{selectedModule.title}</h2>
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
                                {selectedPrompt ? (
                                    <div className="space-y-5 animate-fade-in">
                                        {selectedPrompt.fields.map((f, i) => (
                                            <div key={f.id} className="space-y-2">
                                                <div className="flex justify-between items-center mr-1">
                                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">
                                                        {i+1}. {f.label}
                                                        {f.required !== false ? (
                                                            <span className="ml-1 text-red-500 font-normal">* (必填)</span>
                                                        ) : (
                                                            <span className="ml-1 text-gray-400 font-normal"> (选填)</span>
                                                        )}
                                                    </label>
                                                    {f.maxLength && (
                                                        <span className={`text-[10px] ${(formState[f.id]?.length || 0) > f.maxLength ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                                            {formState[f.id]?.length || 0} / {f.maxLength}
                                                        </span>
                                                    )}
                                                </div>
                                                {f.type === 'file' ? (
                                                    <div className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl transition-all font-sans">
                                                        <input 
                                                            type="file"
                                                            multiple
                                                            accept=".txt,.md,.json,.csv"
                                                            onChange={(e) => handleFileChange(e, f.id)}
                                                            className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                                                        />
                                                        {formState[f.id] && (
                                                            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                                                已加载内容 (预览): {formState[f.id].substring(0, 50)}...
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : f.type === 'textarea' ? (
                                                    <textarea 
                                                        value={formState[f.id] || ''} 
                                                        onChange={e => setFormState({...formState, [f.id]: e.target.value})} 
                                                        placeholder={cleanPlaceholder(f.placeholder, f.label)} 
                                                        maxLength={f.maxLength}
                                                        className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm min-h-[100px] shadow-sm transition-all font-sans" 
                                                    />
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
                                        ))}
                                    </div>
                                ) : (
                                    <textarea value={freeInput} onChange={e => setFreeInput(e.target.value)} placeholder="请输入您的创作灵感或详细要求..." className="w-full h-40 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none shadow-sm transition-all font-sans" />
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
                        {imitationMode ? <ImitationDirections prompt={preparedPrompt + Array.from(selectedAssetIds).map(id=>assets.find(a=>a.id===id)?.content || '').join('\n')} options={{model,temperature,topP,maxOutputTokens,targetChars:targetChars||undefined,bodyInstruction:FORCE_LONG_INSTRUCTION}} /> : !generatedText && !isWaitingForFirstChunk && !generationError && !canResume ? (
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
                                    <div className="flex gap-2">
                                        <button onClick={() => { navigator.clipboard.writeText(generatedText); setSuccessMessage('已复制'); setShowInlineSuccess(true); setTimeout(()=>setShowInlineSuccess(false),3000); }} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors font-sans"><Copy className="w-4 h-4" /> 复制</button>
                                        <button onClick={() => setImportModalOpen(true)} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-sans"><Database className="w-4 h-4" /> 导入素材库</button>
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
