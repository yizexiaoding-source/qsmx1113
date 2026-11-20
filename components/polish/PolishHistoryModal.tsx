import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUturnLeft, Sparkles, Copy, Check, FloppyDisk } from '../Icon';
import { PolishVersionRecord, getPolishModeLabel } from '../../utils/articlePolishEngine';

interface PolishHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  versions: PolishVersionRecord[];
  onRestoreVersion: (version: PolishVersionRecord) => void;
  onSendToImitate: (content: string, title: string) => void;
  onSaveToCreation: (content: string) => void;
}

const PolishHistoryModal: React.FC<PolishHistoryModalProps> = ({
  isOpen,
  onClose,
  originalText,
  versions,
  onRestoreVersion,
  onSendToImitate,
  onSaveToCreation,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(versions[0]?.id || null);
  const [compareWithOriginal, setCompareWithOriginal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');

  if (!isOpen) return null;

  const activeVersion = versions.find((v) => v.id === selectedId) || versions[0] || null;

  const handleCopy = async (v: PolishVersionRecord) => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(v.content);
      setCopiedId(v.id);
      setTimeout(() => setCopiedId((prev) => (prev === v.id ? null : prev)), 3000);
    } catch {
      setCopyError('复制失败，请手动选中版本内容复制');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[84vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-sky-50/40 dark:bg-gray-900">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              已保存版本与历史记录（{versions.length}）
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              原稿始终独立保留，所有保存结果均为新版本，可随时查看、恢复或用于文风仿写。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭历史版本"
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {versions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">暂无已保存的新版本</p>
            <p className="text-xs mt-1">在任意模式完成修改并点击「另存为新版本」后，版本记录会显示在这里。</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 overflow-y-auto p-3 space-y-2 bg-gray-50/50 dark:bg-black/20">
              {versions.map((v) => {
                const isSelected = activeVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-gray-800 border-sky-500 shadow-sm'
                        : 'bg-white/70 dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-sky-300'
                    }`}
                  >
                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{v.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                      {getPolishModeLabel(v.mode)} · {v.charCount} 字
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeVersion && (
              <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {getPolishModeLabel(activeVersion.mode)} · {activeVersion.charCount} 字
                    {activeVersion.modelUsed ? ` · ${activeVersion.modelUsed}` : ''}
                    {activeVersion.summary ? ` · ${activeVersion.summary}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCompareWithOriginal((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        compareWithOriginal
                          ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 text-sky-700 dark:text-sky-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {compareWithOriginal ? '仅看该版本' : '对照原稿'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy(activeVersion)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1 active:scale-95 transition-all"
                    >
                      {copiedId === activeVersion.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> 复制版本
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreVersion(activeVersion);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 flex items-center gap-1"
                    >
                      <ArrowUturnLeft className="w-3.5 h-3.5" /> 恢复到此版本
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveToCreation(activeVersion.content);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 flex items-center gap-1"
                    >
                      <FloppyDisk className="w-3.5 h-3.5" /> 存入作品
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSendToImitate(activeVersion.content, activeVersion.title);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 用于文风仿写
                    </button>
                  </div>
                </div>

                {copyError && (
                  <p role="alert" className="px-5 py-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30">
                    {copyError}
                  </p>
                )}

                <div className="flex-1 overflow-y-auto p-5">
                  {compareWithOriginal ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50/60 dark:bg-black/20 overflow-y-auto">
                        <div className="text-xs font-bold text-gray-500 mb-2">保留原稿</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                          {originalText}
                        </div>
                      </div>
                      <div className="border border-sky-200 dark:border-sky-900 rounded-xl p-4 bg-sky-50/20 dark:bg-sky-950/10 overflow-y-auto">
                        <div className="text-xs font-bold text-sky-700 dark:text-sky-400 mb-2">
                          {activeVersion.title}
                        </div>
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                          {activeVersion.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-w-3xl">
                      {activeVersion.content}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PolishHistoryModal;
