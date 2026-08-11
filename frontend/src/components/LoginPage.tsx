import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(username.trim(), password);
      else await register(username.trim(), password, displayName.trim());
      // 登录成功统一回首页：退出时 URL 可能停留在管理页/详情页
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-canvas grid place-items-center p-4">
      <div className="panel relative w-full max-w-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-csg-400 via-cyan-400 to-emerald-400" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full border border-csg-100" />
        <div className="p-6 sm:p-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-csg-50 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-csg-700 ring-1 ring-csg-100">
            <span className="h-1.5 w-1.5 rounded-full bg-csg-500 shadow-[0_0_8px_rgba(7,152,141,0.7)]" />
            CSG DIGITAL OPERATIONS
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-1 rounded-full bg-csg-500" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">数智运营中心平台运维团队平台组业务服务系统</h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">归谁办 · 做什么交什么 · 在哪些系统怎么操作</p>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs">
            <button type="button" onClick={() => setMode("login")} className={(mode === "login" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500") + " rounded-md py-2 font-medium"}>账号登录</button>
            <button type="button" onClick={() => setMode("register")} className={(mode === "register" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500") + " rounded-md py-2 font-medium"}>用户注册</button>
          </div>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {mode === "register" && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-medium text-slate-500">姓名</label>
                <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="focus-csg block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-slate-500">
                账号
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="focus-csg block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-500">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                required
                className="focus-csg block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
              {submitting ? "提交中…" : mode === "login" ? "登 录" : "注册并进入系统"}
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            {mode === "login" ? "普通用户可查看流程并建立个人办理事件；管理员可维护流程、台账与用户。" : "注册账号默认为普通用户，管理员权限需由系统管理员授予。"}
          </p>
          <div className="mt-3 text-center text-xs">
            {mode === "login" ? <Link to="/register" className="font-medium text-csg-700 hover:underline">没有账号？进入注册页面 →</Link> : <Link to="/" className="font-medium text-csg-700 hover:underline">已有账号？返回登录 →</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
