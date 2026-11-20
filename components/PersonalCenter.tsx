
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile } from '../types';
import EditProfileModal from './EditProfileModal';
import { Pencil, UserCircle, Sparkles, BookOpen, Box, ArrowPath, FloppyDisk, PaintBrush, ClipboardDocumentCheck, Trash, Play, X } from './Icon';
import { fetchUserLibrary, getCurrentUserId, deleteUserData, updateUserProfile } from '../services/supabaseService';
import { ALL_MODEL_OPTIONS } from '../constants';
import TargetLength from './TargetLength';
import {
    DraftCategory,
    WorkbenchDraftRecord,
    ImitateDraftPayload,
    PolishDraftPayload,
    WORKBENCH_DRAFTS_EVENT,
    loadWorkbenchDrafts,
    deleteWorkbenchDraft,
} from '../utils/workbenchDrafts';

const MOCK_USER_PROFILE: UserProfile = {
    id: 'user-123',
    nickname: '奇思妙想家',
    avatarUrl: 'https://source.unsplash.com/random/200x200?avatar,person',
    email: 'user@example.com' // Mock email
};

// --- Retention Modal ---
const RetentionModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
                        🥺
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">真的要离开吗？</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                        退出登录后，您未保存的灵感可能会丢失。<br/>
                        AI 助手会在这里等您回来继续创作。
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                    >
                        狠心退出
                    </button>
                    <button 
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-500 transition-colors shadow-lg shadow-sky-500/20"
                    >
                        我再想想
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Destroy Account Modal ---
const DestroyAccountModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up border border-red-100 dark:border-red-900/30">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-red-500">
                        ⚠️
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">确定要注销账号吗？</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                        此操作将<strong className="text-red-500">永久删除</strong>您所有的小说、剧本和素材数据。<br/>
                        您的提示词和工作流将被保留。<br/>
                        此操作不可撤销！
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors shadow-lg shadow-red-500/20"
                    >
                        确认注销
                    </button>
                </div>
            </div>
        </div>
    );
};

type LibraryTab = 'prompt' | 'character' | 'plot' | 'inspiration';

interface PersonalCenterProps {
    onLogout: () => void;
    isActive?: boolean;
    onOpenDraft?: (
        draft: WorkbenchDraftRecord,
        updatedReq?: { note?: string; model?: string; targetChars?: number }
    ) => void;
}

function getModelDisplayLabel(modelId: string): string {
    if (!modelId) return '默认模型';
    return ALL_MODEL_OPTIONS.find((m) => m.value === modelId)?.label || modelId;
}

function formatDraftTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return iso;
    }
}

function extractDraftInitialTargetChars(draft: WorkbenchDraftRecord): number {
    if (draft.category === 'imitate') {
        return Number((draft.payload as ImitateDraftPayload)?.targetChars || 0);
    }
    if (draft.category === 'polish') {
        const p = draft.payload as PolishDraftPayload;
        if (p?.activeMode === 'deep') return Number(p.task?.deep?.targetChars || 0);
        if (p?.activeMode === 'light') return Number(p.task?.light?.targetChars || 0);
    }
    return 0;
}

const PersonalCenter: React.FC<PersonalCenterProps> = ({ onLogout, isActive, onOpenDraft }) => {
    const [userProfile, setUserProfile] = useState<UserProfile>(MOCK_USER_PROFILE);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<'favorites' | 'drafts'>('favorites');
    const [activeTab, setActiveTab] = useState<LibraryTab>('prompt');
    const [activeDraftTab, setActiveDraftTab] = useState<DraftCategory>('imitate');
    const [isRetentionModalOpen, setRetentionModalOpen] = useState(false);
    const [isDestroyModalOpen, setDestroyModalOpen] = useState(false);
    
    // Data State
    const [myPrompts, setMyPrompts] = useState<any[]>([]);
    const [myMaterials, setMyMaterials] = useState<any[]>([]);
    const [myDrafts, setMyDrafts] = useState<WorkbenchDraftRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const userIdRef = useRef<string | null>(null);

    // Re-enter requirements modal state
    const [regenDraftModal, setRegenDraftModal] = useState<{
        draft: WorkbenchDraftRecord;
        note: string;
        model: string;
        targetChars: number;
    } | null>(null);

    const refreshDrafts = useCallback((uid: string | null) => {
        setMyDrafts(loadWorkbenchDrafts(uid));
    }, []);

    useEffect(() => {
        const init = async () => {
            const userId = await getCurrentUserId();
            userIdRef.current = userId;
            refreshDrafts(userId);
            const profile = await fetchUserLibrary();
            // Fetch basic profile info from Auth metadata
            import('../services/supabaseService').then(async (module) => {
                const metaProfile = await module.fetchUserProfile();
                if(metaProfile && userId) {
                    setUserProfile({
                        id: userId,
                        nickname: metaProfile.nickname || '奇思妙想家',
                        avatarUrl: metaProfile.avatarUrl,
                        email: metaProfile.email
                    });
                }
            });
            
            setMyPrompts(profile.prompts);
            setMyMaterials(profile.materials);
            setIsLoading(false);
        };
        init();
    }, [refreshDrafts]);

    useEffect(() => {
        if (isActive) {
            refreshDrafts(userIdRef.current);
        }
    }, [isActive, refreshDrafts]);

    useEffect(() => {
        const onDraftsUpdated = () => {
            refreshDrafts(userIdRef.current);
        };
        window.addEventListener(WORKBENCH_DRAFTS_EVENT, onDraftsUpdated);
        return () => window.removeEventListener(WORKBENCH_DRAFTS_EVENT, onDraftsUpdated);
    }, [refreshDrafts]);

    const handleProfileUpdate = async (newNickname: string, newAvatarUrl: string | null) => {
        // Save to Supabase Auth Metadata. We no longer allow email updates here.
        await updateUserProfile(newNickname, newAvatarUrl);
        // Update local state
        setUserProfile(prev => ({ ...prev, nickname: newNickname, avatarUrl: newAvatarUrl }));
    };

    const handleDestroyAccount = async () => {
        const success = await deleteUserData();
        if (success) {
            // Reload page to clear state and show login modal
            window.location.reload();
        }
    };

    const renderLibraryContent = () => {
        if (isLoading) {
            return <div className="p-8 text-center text-gray-400"><ArrowPath className="w-6 h-6 mx-auto animate-spin mb-2"/>加载中...</div>;
        }

        let items: any[] = [];
        let emptyMessage = "";

        switch(activeTab) {
            case 'prompt':
                items = myPrompts;
                emptyMessage = "您还没有创建过任何提示词。";
                break;
            case 'character':
                items = myMaterials.filter(m => m.type === 'character');
                emptyMessage = "您还没有创建过角色素材。";
                break;
            case 'plot':
                items = myMaterials.filter(m => m.type === 'plot');
                emptyMessage = "您还没有创建过剧情素材。";
                break;
            case 'inspiration':
                items = myMaterials.filter(m => m.type === 'idea');
                emptyMessage = "您还没有记录过灵感素材。";
                break;
        }

        if (items.length === 0) {
            return (
                <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500">
                    <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{emptyMessage}</p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-sky-400 transition-colors group relative">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-gray-900 dark:text-white truncate pr-2 flex-1">{item.title || item.name}</h4>
                            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-1 rounded">
                                {new Date(item.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 h-16 mb-2 leading-relaxed">
                            {activeTab === 'prompt' ? (JSON.parse(item.content).description || '无描述') : item.content}
                        </p>
                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                            {item.tags && item.tags.map((tag: string, i: number) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">#{tag}</span>
                            ))}
                            {(!item.tags || item.tags.length === 0) && <span className="text-xs text-gray-300 italic">未分类</span>}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const handleDeleteDraft = (draftId: string) => {
        const next = deleteWorkbenchDraft(userIdRef.current, draftId);
        setMyDrafts(next);
    };

    const openRegenerateModal = (draft: WorkbenchDraftRecord) => {
        setRegenDraftModal({
            draft,
            note: draft.requirementsNote || '',
            model: draft.model || 'deepseek-chat',
            targetChars: extractDraftInitialTargetChars(draft),
        });
    };

    const renderDraftsContent = () => {
        const filtered = myDrafts.filter((d) => d.category === activeDraftTab);
        const emptyHints: Record<DraftCategory, string> = {
            imitate: '暂无仿写草稿。在创意生成/文风仿写点击「存为草稿」，或离开/中断时将自动保留在此。',
            polish: '暂无润色草稿。在文章润色工作区点击「存为草稿」，或离开/中断时将自动保留在此。',
            review: '暂无审稿草稿。在审稿工作区点击「存为草稿」，或离开/中断时将自动保留在此。',
        };

        if (filtered.length === 0) {
            return (
                <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500">
                    <FloppyDisk className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{emptyHints[activeDraftTab]}</p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((draft) => (
                    <div
                        key={draft.id}
                        className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-sky-400 transition-colors flex flex-col justify-between gap-3"
                    >
                        <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                                <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1 flex-1" title={draft.title}>
                                    {draft.title}
                                </h4>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                {draft.saveType === 'auto' ? '自动暂存' : '手动保存'} · {getModelDisplayLabel(draft.model)} ·{' '}
                                {draft.outputCharCount > 0 ? `已生成 ${draft.outputCharCount} 字` : `原稿 ${draft.sourceCharCount} 字`} ·{' '}
                                {formatDraftTime(draft.updatedAt)}
                            </p>
                            <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                                状态：{draft.statusLabel}
                            </p>
                            {draft.requirementsNote && (
                                <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/70 text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                    <span className="font-semibold text-gray-700 dark:text-gray-200">要求：</span>
                                    {draft.requirementsNote}
                                </div>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                                {draft.outputPreview || '（暂无正文预览，点击继续复用恢复输入内容）'}
                            </p>
                        </div>

                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onOpenDraft?.(draft)}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                            >
                                <Play className="w-3.5 h-3.5" />
                                <span>继续复用</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => openRegenerateModal(draft)}
                                className="px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                            >
                                <ArrowPath className="w-3.5 h-3.5" />
                                <span>重新输入要求生成</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteDraft(draft.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                title="删除草稿"
                            >
                                <Trash className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full">
            <EditProfileModal
                isOpen={isEditModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSave={handleProfileUpdate}
                currentUser={userProfile}
            />
            <RetentionModal 
                isOpen={isRetentionModalOpen} 
                onClose={() => setRetentionModalOpen(false)} 
                onConfirm={onLogout} 
            />
            <DestroyAccountModal 
                isOpen={isDestroyModalOpen} 
                onClose={() => setDestroyModalOpen(false)} 
                onConfirm={handleDestroyAccount} 
            />

            {regenDraftModal && (
                <div
                    className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm"
                    onClick={() => setRegenDraftModal(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    重新输入要求生成
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    将保留草稿「{regenDraftModal.draft.title}」中的原稿与设定，并把新要求带入工作区。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRegenDraftModal(null)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                    使用模型
                                </label>
                                <select
                                    value={regenDraftModal.model}
                                    onChange={(e) =>
                                        setRegenDraftModal((prev) => (prev ? { ...prev, model: e.target.value } : null))
                                    }
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-500"
                                >
                                    {ALL_MODEL_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {regenDraftModal.draft.category !== 'review' && (
                                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                                    <TargetLength
                                        value={regenDraftModal.targetChars}
                                        onChange={(val) =>
                                            setRegenDraftModal((prev) => (prev ? { ...prev, targetChars: val } : null))
                                        }
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                    新的创作 / 修改要求
                                </label>
                                <textarea
                                    rows={4}
                                    value={regenDraftModal.note}
                                    onChange={(e) =>
                                        setRegenDraftModal((prev) => (prev ? { ...prev, note: e.target.value } : null))
                                    }
                                    placeholder={
                                        regenDraftModal.draft.category === 'polish'
                                            ? '输入新的润色或重写要求（如：保留原稿冷峻文风，调整中段冲突与结尾节奏）...'
                                            : regenDraftModal.draft.category === 'review'
                                              ? '输入本次审稿补充说明或需重点核查的人物/方向...'
                                              : '输入新的仿写或创作要求（如：强化悬疑氛围、改为第三人称推进）...'
                                    }
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setRegenDraftModal(null)}
                                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const current = regenDraftModal;
                                    setRegenDraftModal(null);
                                    onOpenDraft?.(current.draft, {
                                        note: current.note.trim(),
                                        model: current.model,
                                        targetChars:
                                            current.draft.category !== 'review' ? current.targetChars : undefined,
                                    });
                                }}
                                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
                            >
                                应用要求并前往生成
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
                {/* Profile Header */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 flex gap-2">
                         <button
                            onClick={() => setRetentionModalOpen(true)}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            退出登录
                        </button>
                        <button
                            onClick={() => setDestroyModalOpen(true)}
                            className="px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            注销账号
                        </button>
                    </div>

                    <div className="w-28 h-28 rounded-full overflow-hidden flex-shrink-0 border-4 border-white dark:border-gray-800 shadow-lg relative">
                        {userProfile.avatarUrl ? (
                            <img src={userProfile.avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                                <UserCircle className="w-16 h-16 text-sky-500 dark:text-sky-300" />
                            </div>
                        )}
                        <button 
                            onClick={() => setEditModalOpen(true)}
                            className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-1 text-center opacity-0 hover:opacity-100 transition-opacity"
                        >
                            更换
                        </button>
                    </div>
                    
                    <div className="flex-grow text-center md:text-left">
                        <div className="mb-2">
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-3">
                                {userProfile.nickname}
                                <button onClick={() => setEditModalOpen(true)} className="text-gray-400 hover:text-sky-500 transition-colors">
                                    <Pencil className="w-5 h-5" />
                                </button>
                            </h1>
                            {userProfile.email && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
                                    {userProfile.email}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-gray-500 dark:text-gray-400 mt-4">
                            <div className="flex items-center gap-1">
                                <Box className="w-4 h-4" />
                                <span>提示词: {myPrompts.length}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <BookOpen className="w-4 h-4" />
                                <span>素材: {myMaterials.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Library & Workbench Drafts Section */}
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-6">
                            <button
                                type="button"
                                onClick={() => setActiveSection('favorites')}
                                className={`text-2xl font-bold flex items-center gap-2 pb-1.5 border-b-2 transition-colors whitespace-nowrap ${
                                    activeSection === 'favorites'
                                        ? 'text-gray-900 dark:text-white border-purple-500'
                                        : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <Sparkles className="w-6 h-6 text-purple-500" />
                                <span>我的收藏</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    refreshDrafts(userIdRef.current);
                                    setActiveSection('drafts');
                                }}
                                className={`text-2xl font-bold flex items-center gap-2 pb-1.5 border-b-2 transition-colors whitespace-nowrap ${
                                    activeSection === 'drafts'
                                        ? 'text-gray-900 dark:text-white border-sky-500'
                                        : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <FloppyDisk className="w-6 h-6 text-sky-500" />
                                <span>我的草稿 ({myDrafts.length})</span>
                            </button>
                        </div>
                    </div>

                    {activeSection === 'favorites' ? (
                        <>
                            {/* Categorized Tabs */}
                            <div className="flex p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full md:w-fit overflow-x-auto">
                                {[
                                    { id: 'prompt', label: '提示词', icon: Box },
                                    { id: 'character', label: '角色', icon: UserCircle },
                                    { id: 'plot', label: '剧情', icon: BookOpen },
                                    { id: 'inspiration', label: '灵光', icon: Sparkles },
                                ].map((tab) => {
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as LibraryTab)}
                                            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
                                                activeTab === tab.id 
                                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 shadow-sm' 
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Content Area */}
                            <div className="min-h-[300px]">
                                {renderLibraryContent()}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Draft Sub-Category Tabs: 仿写 / 润色 / 审稿 */}
                            <div className="flex p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full md:w-fit overflow-x-auto">
                                {[
                                    { id: 'imitate' as DraftCategory, label: '仿写', icon: Sparkles },
                                    { id: 'polish' as DraftCategory, label: '润色', icon: PaintBrush },
                                    { id: 'review' as DraftCategory, label: '审稿', icon: ClipboardDocumentCheck },
                                ].map((tab) => {
                                    const Icon = tab.icon;
                                    const count = myDrafts.filter((d) => d.category === tab.id).length;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveDraftTab(tab.id)}
                                            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
                                                activeDraftTab === tab.id
                                                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 shadow-sm'
                                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{tab.label} ({count})</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Drafts Area */}
                            <div className="min-h-[300px]">
                                {renderDraftsContent()}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PersonalCenter;
