import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Sparkles, AdjustmentsHorizontal, DocumentPlus, Pencil, ArrowPath } from './Icon';

const CURRENT_VERSION = 'v2.0.0';
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in-up font-sans relative">
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
                                2026.11.19 · 仿写工作流升级，生成体验更稳定
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <DocumentPlus className="w-4 h-4 text-sky-500" />
                                文风仿写支持一键「上传原稿」
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                在文风仿写「小说原稿」框内支持直接点击上传或拖拽文件导入（兼容 .txt、.md、.docx 及常见编码格式），整本小说无需手动分段复制粘贴即可直接开写。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <Pencil className="w-4 h-4 text-indigo-500" />
                                支持手动编辑与微调剧情方案
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                生成剧情走向后，可在详情区点击「编辑方案」自由修改标题、剧情概括、主要事件与节奏，确认后再生成正文，让后续故事更契合您的创作构想。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <ArrowPath className="w-4 h-4 text-emerald-500" />
                                原页重设方案与模型切换更流畅
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                在文风仿写当前页更换文章、调整要求或切换不同模型后重新生成方案，支持实时查看生成进度并可随时取消与即时切换模型重跑，响应更快更顺畅。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <AdjustmentsHorizontal className="w-4 h-4 text-amber-500" />
                                目标字数更精准，千问 / DeepSeek 更稳定
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                成文篇幅可更稳定地贴近预设目标字数范围（±1000 字内）；同时提升千问与 DeepSeek 模型长文生成与剧情策划的连接稳定性，遇到异常时完整保留草稿。
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
