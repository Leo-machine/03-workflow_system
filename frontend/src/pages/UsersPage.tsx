import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import PageShell from "../components/PageShell";
import Toast from "../components/Toast";
import type { User } from "../types";

export default function UsersPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", display_name: "", password: "" });

  const load = useCallback(async () => {
    try { setUsers(await api<User[]>("/users")); }
    catch (err) { setError(err instanceof Error ? err.message : "加载用户失败"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(target: User, body: object, message: string) {
    try {
      await api(`/users/${target.id}`, { method: "PATCH", body });
      setToast(message);
      await load();
    } catch (err) { setToast(err instanceof Error ? err.message : "操作失败"); }
  }

  async function createUser() {
    try {
      await api("/auth/register", { method: "POST", body: newUser, token: null });
      setToast("用户已创建"); setCreating(false);
      setNewUser({ username: "", display_name: "", password: "" });
      await load();
    } catch (err) { setToast(err instanceof Error ? err.message : "创建用户失败"); }
  }

  return (
    <PageShell user={user} onLogout={onLogout} title="用户管理" subtitle="管理注册用户的状态与权限。" backTo="/" backLabel="返回业务域" wide actions={<button className="btn-primary" onClick={() => setCreating(true)}>＋ 新增用户</button>}>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1.6fr] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500">
          <span>用户</span><span>账号</span><span>角色</span><span>管理操作</span>
        </div>
        {users.map((item) => (
          <div key={item.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_1.6fr] items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm last:border-0">
            <div><div className="font-medium text-slate-800">{item.display_name || "未填写姓名"}</div><div className={item.active ? "text-xs text-emerald-600" : "text-xs text-slate-400"}>{item.active ? "正常" : "已停用"}</div></div>
            <span className="mono text-xs text-slate-500">{item.username}</span>
            <select value={item.role} disabled={item.id === user.id} onChange={(e) => void patch(item, { role: e.target.value }, "用户角色已更新")} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs">
              <option value="viewer">普通用户</option><option value="admin">管理员</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={item.id === user.id} onClick={() => void patch(item, { active: !item.active }, item.active ? "用户已停用" : "用户已启用")} className="btn-ghost px-2.5 py-1 text-xs">{item.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => { setResetting(item); setPassword(""); }} className="btn-ghost px-2.5 py-1 text-xs">重置密码</button>
            </div>
          </div>
        ))}
      </div>
      {resetting && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setResetting(null)}><div className="panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}><h3 className="font-semibold text-slate-800">重置 {resetting.username} 的密码</h3><input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位新密码" className="focus-csg mt-4 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"/><div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setResetting(null)}>取消</button><button className="btn-primary" disabled={password.length < 8} onClick={() => { void patch(resetting, { new_password: password }, "密码已重置"); setResetting(null); }}>确认重置</button></div></div></div>}
      {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setCreating(false)}><div className="panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}><h3 className="font-semibold text-slate-800">新增普通用户</h3><div className="mt-4 space-y-3"><input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} placeholder="姓名" className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"/><input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="登录账号" className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"/><input type="password" minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="初始密码（至少 8 位）" className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"/></div><p className="mt-2 text-xs text-slate-400">新账号默认为普通用户，可创建个人办理事件。</p><div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setCreating(false)}>取消</button><button className="btn-primary" disabled={!newUser.display_name.trim() || newUser.username.length < 3 || newUser.password.length < 8} onClick={() => void createUser()}>创建用户</button></div></div></div>}
      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
