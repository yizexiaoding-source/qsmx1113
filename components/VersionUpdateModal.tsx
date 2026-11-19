import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Sparkles, ClipboardDocumentCheck, AdjustmentsHorizontal } from './Icon';

const CURRENT_VERSION = 'v1.10.1';
const STORAGE_KEY = `qisimiaoxie_version_seen_${CURRENT_VERSION}`;

const VersionUpdateModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (!seen) {
            setIsOpen(true);
        }
    }, []);

    const handleClose = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setIsOpen(false);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in-up font-sans relative">
                {/* Decorative Header Background */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-sky-500 to-indigo-600 opacity-10 pointer-events-none" />
                
                <div className="p-6 relative">
                    <button 
                        onClick={handleClose}
                        aria-label="关闭更新通知"
                        className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Header */}
                    <div className="flex items-center gap-4 mb-5 mt-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xl text-white shrink-0 ring-4 ring-white dark:ring-gray-900">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col pt-1">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                                奇思妙写 <span className="text-indigo-600 dark:text-indigo-400">{CURRENT_VERSION}</span>
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-bold tracking-wide">
                                2026.11.19 · 意外中断也能无缝继续写完
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3.5">
                        {/* Feature 1 */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-2">
                                <ClipboardDocumentCheck className="w-4 h-4 text-indigo-500" />
                                被迫中断支持“继续生成”与“重新生成”
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                文风仿写与创意生成过程中如遇限流、连接或异常中断，只要已有草稿内容，即与主动暂停一样同时提供「继续生成当前篇」与「重新生成当前篇」，不再被迫丢弃已写好的精彩段落。
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-2">
                                <AdjustmentsHorizontal className="w-4 h-4 text-sky-500" />
                                半句续写精准衔接，拒绝重开新篇
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                优化续写末尾锚点约束，自动清理“（接上文）”等提示语、消除半句截断或换行差异造成的重复句，并去除半句话中间多余空行，确保前后连贯成一整篇完整正文。
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                            <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-1.5 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                延续 v1.10.0 剧情方案多选与完成提示
                            </h3>
                            <p className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                                继续支持五个剧情方案先选再写、并行生成互不覆盖；续写完成后同样自动统计实际字数并展示完成提示。
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={handleClose}
                        className="mt-5 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xl shadow-indigo-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                    >
                        <Check className="w-4 h-4" /> 立即体验
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default VersionUpdateModal;
