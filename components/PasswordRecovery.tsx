import React, { useEffect, useState } from 'react';
import { supabase, recoveryLinkError } from '../services/supabaseService';

const PasswordRecovery: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const [checking, setChecking] = useState(true);
    const [validSession, setValidSession] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        let active = true;
        // getSession waits for the SDK to finish processing the recovery callback.
        supabase.auth.getSession().then(({ data, error }) => {
            if (!active) return;
            const valid = !recoveryLinkError && !error && !!data.session;
            setValidSession(valid);
            if (!valid) setError('重置链接已失效或未完成验证，请返回登录页重新发送重置邮件，并使用最新邮件中的链接。');
        }).catch(() => {
            if (active) setError('无法验证重置链接，请检查网络后刷新此页。');
        }).finally(() => { if (active) setChecking(false); });
        return () => { active = false; };
    }, []);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !validSession) return;
        if (password.length < 6) { setError('新密码至少需要 6 位字符'); return; }
        if (password !== confirmation) { setError('两次输入的密码不一致'); return; }
        setBusy(true);
        setError('');
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                if (error.code === 'same_password') throw new Error('新密码不能与原密码相同');
                if (error.code === 'weak_password') throw new Error('密码强度不足，请使用更复杂的新密码');
                throw new Error('密码保存失败，可能是链接过期、网络异常或密码不符合要求，请重试或重新申请重置邮件。');
            }
            setPassword('');
            setConfirmation('');
            setSuccess(true);
        } catch (error) {
            setError(error instanceof Error ? error.message : '密码保存失败，请稍后重试');
        } finally { setBusy(false); }
    };

    const finish = async () => {
        setBusy(true);
        // Only clear this browser's recovery session; other devices stay signed in.
        try {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
            onDone();
        } catch {
            setError('密码已修改，但退出当前会话失败，请检查网络后再次点击返回登录。');
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
            <section className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-8 shadow-xl">
                <h1 className="text-2xl font-bold text-sky-600 mb-3">{success ? '密码修改成功' : '设置新密码'}</h1>
                <p className="text-sm text-gray-500 mb-6">{success ? '请使用新密码重新登录掌汇小说。' : '为你的账号设置新密码，无需输入原密码。'}</p>
                {checking ? <p role="status">正在验证重置链接…</p> : success ? (
                    <button disabled={busy} onClick={finish} className="w-full rounded-xl bg-sky-600 text-white p-3 disabled:opacity-50">返回登录</button>
                ) : validSession ? (
                    <form onSubmit={submit} className="space-y-4">
                        <label className="block text-sm">新密码
                            <input aria-label="新密码" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full border rounded-lg p-3 dark:bg-gray-800" />
                        </label>
                        <label className="block text-sm">确认新密码
                            <input aria-label="确认新密码" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full border rounded-lg p-3 dark:bg-gray-800" />
                        </label>
                        <button disabled={busy} className="w-full rounded-xl bg-sky-600 text-white p-3 disabled:opacity-50">{busy ? '正在保存…' : '保存新密码'}</button>
                    </form>
                ) : <button onClick={onDone} className="text-sky-600 underline">返回登录，重新申请重置</button>}
                {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
            </section>
        </main>
    );
};

export default PasswordRecovery;
