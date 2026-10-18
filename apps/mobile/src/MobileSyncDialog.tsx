import { useEffect, useState } from 'react';
import { ArrowLeft, Link2, Loader2, RefreshCw, ShieldCheck, Smartphone, Unplug, X } from 'lucide-react';
import { AnimatedDialog } from '@renderer/components/AnimatedDialog';
import { clearSyncToken, loadSyncToken, saveSyncToken } from './platform';
import { openWorkspaceStorage } from './workspace-storage';
import { clearMobileSyncPreferences, pairMobileSync, saveMobileSyncPreferences, synchronizeMobileWorkspace, unpairMobileSync } from './mobile-sync';
import type { MobileSyncPreferences } from './workspace-api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSynced: () => Promise<void>;
}

export function MobileSyncDialog({ open, onClose, onSynced }: Props): JSX.Element | null {
  const [endpoint, setEndpoint] = useState('');
  const [code, setCode] = useState('');
  const [preferences, setPreferences] = useState<MobileSyncPreferences | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) { setToken(''); return; }
    let active = true;
    setBusy('loading');
    setError('');
    setMessage('');
    void (async () => {
      const storage = await openWorkspaceStorage();
      const state = await storage.read();
      const savedToken = await loadSyncToken();
      if (!active) return;
      setPreferences(state.sync ?? null);
      setEndpoint(state.sync?.endpoint ?? '');
      setToken(savedToken);
      if (state.sync && !savedToken) setMessage('配对令牌未找到，请重新配对；桌面也可撤销旧设备。');
    })().catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : '读取同步设置失败。');
    }).finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, [open]);

  async function syncNow(savedPreferences = preferences, savedToken = token) {
    if (!savedPreferences || !savedToken) return;
    setBusy('sync');
    setError('');
    setMessage('正在与桌面同步…');
    try {
      const storage = await openWorkspaceStorage();
      const result = await synchronizeMobileWorkspace(storage, {
        endpoint: savedPreferences.endpoint,
        deviceId: savedPreferences.deviceId,
        token: savedToken,
      });
      const next = (await storage.read()).sync ?? savedPreferences;
      setPreferences(next);
      await onSynced();
      setMessage(result.conflicts.length
        ? `同步完成：${result.projectCount} 个作品、${result.chapterCount} 章；发现 ${result.conflicts.length} 处冲突，桌面已保留副本。`
        : `同步完成：${result.projectCount} 个作品、${result.chapterCount} 章。`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '同步失败；本地书稿未被覆盖。');
      setMessage('');
    } finally { setBusy(null); }
  }

  async function pairAndSync() {
    if (busy) return;
    setBusy('pair');
    setError('');
    setMessage('正在配对…');
    try {
      const paired = await pairMobileSync(endpoint, code, 'InkForge Android');
      try { await saveSyncToken(paired.token); }
      catch (failure) {
        await unpairMobileSync(paired.endpoint, paired.token).catch(() => undefined);
        throw failure;
      }
      const saved: MobileSyncPreferences = {
        endpoint: paired.endpoint,
        deviceId: paired.deviceId,
        baseVersions: {},
        lastSyncedAt: null,
      };
      await saveMobileSyncPreferences(await openWorkspaceStorage(), saved);
      setPreferences(saved);
      setEndpoint(saved.endpoint);
      setToken(paired.token);
      setCode('');
      await syncNow(saved, paired.token);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '配对失败。');
      setMessage('');
    } finally { setBusy(null); }
  }

  async function disconnect() {
    if (busy || !preferences) return;
    setBusy('disconnect');
    setError('');
    setMessage('');
    let revocationFailed = false;
    try {
      if (token) await unpairMobileSync(preferences.endpoint, token);
    } catch { revocationFailed = true; }
    try {
      await clearSyncToken();
      await clearMobileSyncPreferences(await openWorkspaceStorage());
      setPreferences(null);
      setToken('');
      setCode('');
      setMessage(revocationFailed
        ? '本机凭据已清除；电脑离线，若设备仍显示在桌面列表，请在那里手动撤销。'
        : '已断开桌面同步。');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法清除本机同步凭据。');
    } finally { setBusy(null); }
  }

  const connected = !!preferences && !!token;
  const lastSynced = preferences?.lastSyncedAt ? new Date(preferences.lastSyncedAt).toLocaleString() : '尚未同步';

  return <AnimatedDialog open={open} onClose={() => { if (!busy) onClose(); }} ariaLabel="Tailnet 手机同步"
    overlayClassName="flex items-center justify-center p-4"
    panelClassName="max-h-[calc(100dvh-32px)] w-full max-w-[480px] overflow-auto rounded-xl border border-ink-700 bg-white text-ink-900 shadow-2xl">
    <div className="mobile-sync-dialog">
      <div className="mobile-sync-heading">
        <div className="mobile-sync-title"><div className="mobile-sync-icon"><ShieldCheck size={18} /></div><div><h2>Tailnet 同步</h2><p>手机与常开电脑之间的私有书稿副本</p></div></div>
        <button type="button" aria-label="关闭同步窗口" disabled={!!busy} onClick={onClose}><X size={20} /></button>
      </div>
      <div className="mobile-sync-note"><Smartphone size={16} /><span>手机与电脑都必须连接同一个 Tailscale 网络。令牌使用 Android Keystore 加密保存。</span></div>

      {connected && <div className="mobile-sync-connected">
        <span className="sync-dot" />已配对
        <span>上次同步：{lastSynced}</span>
      </div>}

      <label className="mobile-sync-field">桌面 Tailscale HTTPS 地址
        <input type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://电脑名.尾网.ts.net/inkforge"
          value={endpoint} disabled={connected || !!busy} onChange={event => setEndpoint(event.target.value)} />
      </label>

      {!connected && <label className="mobile-sync-field">一次性配对码
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="输入桌面设置中显示的 6 位码"
          value={code} disabled={!!busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      </label>}

      <div className="mobile-sync-actions">
        {connected
          ? <button type="button" className="sync-primary" disabled={!!busy} onClick={() => void syncNow()}>
              {busy === 'sync' ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}{busy === 'sync' ? '正在同步…' : '立即同步'}
            </button>
          : <button type="button" className="sync-primary" disabled={!!busy || !endpoint.trim() || code.length !== 6} onClick={() => void pairAndSync()}>
              {busy === 'pair' ? <Loader2 className="spin" size={17} /> : <Link2 size={17} />}{busy === 'pair' ? '正在配对…' : '配对并首次同步'}
            </button>}
        {connected && <button type="button" className="sync-secondary" disabled={!!busy} onClick={() => void disconnect()}><Unplug size={16} />断开</button>}
        {!connected && preferences && <button type="button" className="sync-secondary" disabled={!!busy} onClick={() => void disconnect()}><ArrowLeft size={16} />清除旧配对</button>}
      </div>

      {error && <p className="mobile-sync-error" role="alert">{error}</p>}
      {message && <p className="mobile-sync-message" role={error ? 'alert' : 'status'}>{message}</p>}
      <p className="mobile-sync-footnote">作品和章节正文会进入桌面书架。并发编辑时会保留冲突副本；永久删除不会自动传播，另一端仍存有的内容会恢复显示。</p>
    </div>
  </AnimatedDialog>;
}
