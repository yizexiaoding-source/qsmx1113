import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Sparkles, PaintBrush, Pencil, ClipboardDocumentCheck, FloppyDisk } from './Icon';

const CURRENT_VERSION = 'v2.1.0';
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
                                2026.11.19 · 全新「文章润色」与全局「我的草稿」正式上线
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <PaintBrush className="w-4 h-4 text-sky-500" />
                                全新「文章润色」三大独立模式
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                左侧导航新增「文章润色」，支持「轻度润色」「深度重写」「编辑建议」三大独立工作区。支持文件/作品导入与局部选段处理，原稿始终独立保留，修改结果另存为新版本，并可一键带入文风仿写。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <Pencil className="w-4 h-4 text-purple-500" />
                                轻度精修与可控方向的深度重写
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                轻度润色支持补充润色要求、逐句对照理由并单条或批量采纳；深度重写支持先锁定故事骨架（随时解锁微调），再自由输入改写方向与约束目标，保持克制文风、去浮夸并严控篇幅，中断支持一键继续生成。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <ClipboardDocumentCheck className="w-4 h-4 text-amber-500" />
                                编辑建议：内容精彩度与行文优化
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                区别于「审稿」查错查重，聚焦开篇钩子、冲突张力、人物对话火花、画面感与情绪节奏，支持填写自定义优化方向；点击建议自动定位高亮原文，可微调建议稿后逐条采纳。
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                                <FloppyDisk className="w-4 h-4 text-emerald-500" />
                                全局「我的草稿」与退出自动暂存
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                「个人中心」新增「我的草稿」，按仿写、润色、审稿分区管理。工作台支持手动保存草稿及切换离开/异常退出自动暂存，随时一键复用或重新输入修改要求继续生成。
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
