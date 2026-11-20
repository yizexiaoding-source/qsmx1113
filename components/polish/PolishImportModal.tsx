import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Database, Search, X, ArrowPath, Check, ChevronRight } from '../Icon';
import {
  fetchProjects,
  fetchChapters,
  fetchChapterContent,
  fetchMaterials,
  getCurrentUserId,
} from '../../services/supabaseService';
import { countContentChars } from '../../services/geminiService';

interface PolishImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (payload: { title: string; content: string; sourceLabel: string }) => void;
}

type ImportTab = 'works' | 'materials';

const PolishImportModal: React.FC<PolishImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [activeTab, setActiveTab] = useState<ImportTab>('works');
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Works state
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Materials state
  const [materials, setMaterials] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setErrorMsg('');
    setSearchTerm('');
    setSelectedProject(null);
    setChapters([]);

    const load = async () => {
      setLoading(true);
      try {
        const uid = await getCurrentUserId();
        if (cancelled) return;
        setUserId(uid);
        setAuthChecked(true);
        if (!uid) {
          setProjects([]);
          setMaterials([]);
          return;
        }
        const [projList, matList] = await Promise.all([
          fetchProjects(1, 50),
          fetchMaterials(),
        ]);
        if (cancelled) return;
        setProjects(Array.isArray(projList) ? projList : []);
        setMaterials(Array.isArray(matList) ? matList : []);
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || '读取云端内容失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleSelectProject = async (project: any) => {
    setSelectedProject(project);
    setChapters([]);
    setErrorMsg('');
    setLoadingChapters(true);
    try {
      const list = await fetchChapters(project.id);
      setChapters(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErrorMsg(e?.message || '获取章节列表失败');
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleImportChapter = async (chapter: any) => {
    if (!selectedProject) return;
    setLoadingContent(true);
    setErrorMsg('');
    try {
      const content = await fetchChapterContent(chapter.id);
      if (!content || !content.trim()) {
        setErrorMsg('该章节正文为空，暂无可导入文本');
        return;
      }
      const title = chapters.length > 1
        ? `${selectedProject.title} · ${chapter.title || '正文'}`
        : selectedProject.title;
      onImport({
        title,
        content,
        sourceLabel: `创作中心 · ${title}`,
      });
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message || '读取章节正文失败');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleImportMaterial = (material: any) => {
    const content = (material?.content || '').trim();
    if (!content) {
      setErrorMsg('该素材内容为空');
      return;
    }
    onImport({
      title: material.name || '导入素材',
      content,
      sourceLabel: `素材库 · ${material.name || '未命名素材'}`,
    });
    onClose();
  };

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.title || '').toLowerCase().includes(q));
  }, [projects, searchTerm]);

  const filteredMaterials = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
    );
  }, [materials, searchTerm]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-sky-50/40 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">从已有作品或素材导入</h3>
            <div className="flex bg-gray-200/70 dark:bg-gray-800 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => { setActiveTab('works'); setErrorMsg(''); }}
                className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'works'
                    ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> 创作中心作品
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('materials'); setErrorMsg(''); }}
                className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'materials'
                    ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <Database className="w-3.5 h-3.5" /> 素材库
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导入窗口"
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeTab === 'works' ? '搜索作品标题...' : '搜索素材名称或内容...'}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
          {errorMsg && (
            <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-gray-50/50 dark:bg-black/20">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-500">
              <ArrowPath className="w-4 h-4 animate-spin text-sky-500" /> 正在读取云端数据...
            </div>
          ) : authChecked && !userId ? (
            <div className="py-14 px-6 text-center space-y-2">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                当前处于访客模式，暂未读取云端作品与素材库
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                您可以直接在编辑区粘贴正文，或通过「上传原稿文件」导入 .txt / .md / .docx；登录账号后即可从创作中心作品和素材库一键导入。
              </p>
            </div>
          ) : activeTab === 'works' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  1. 选择作品（{filteredProjects.length}）
                </div>
                {filteredProjects.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    暂无可选作品
                  </div>
                ) : (
                  filteredProjects.map((proj) => {
                    const isSelected = selectedProject?.id === proj.id;
                    const typeLabel =
                      proj.type === 'novel' ? '长篇小说' : proj.type === 'short_story' ? '短篇小说' : '剧本';
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => void handleSelectProject(proj)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-500 text-sky-800 dark:text-sky-200'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-sky-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{proj.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{typeLabel}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  2. 选择要导入的章节 / 场次
                </div>
                {!selectedProject ? (
                  <div className="p-8 text-center text-xs text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                    请先在左侧点击一部作品
                  </div>
                ) : loadingChapters ? (
                  <div className="p-8 flex items-center justify-center gap-2 text-xs text-gray-500 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    <ArrowPath className="w-4 h-4 animate-spin text-sky-500" /> 加载章节中...
                  </div>
                ) : chapters.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                    该作品暂无可导入章节
                  </div>
                ) : (
                  chapters.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={loadingContent}
                      onClick={() => void handleImportChapter(ch)}
                      className="w-full text-left p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-sky-400 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition-all flex items-center justify-between gap-2 disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {ch.title || '未命名章节'}
                      </span>
                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 shrink-0 flex items-center gap-1">
                        {loadingContent ? <ArrowPath className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        导入
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMaterials.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">暂无匹配素材</div>
              ) : (
                filteredMaterials.map((mat) => {
                  const typeLabel = mat.type === 'character' ? '角色' : mat.type === 'plot' ? '剧情' : '灵光';
                  return (
                    <div
                      key={mat.id}
                      className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4 hover:border-sky-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                          <span className="truncate">{mat.name}</span>
                          <span className="text-xs font-normal text-gray-400 shrink-0">
                            · {typeLabel} · {countContentChars(mat.content || '')} 字
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                          {mat.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleImportMaterial(mat)}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shrink-0 transition-colors"
                      >
                        导入原文
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PolishImportModal;
