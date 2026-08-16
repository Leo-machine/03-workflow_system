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
  const [showPassword, setShowPassword] = useState(false);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setShowPassword(false);
    navigate(next === "register" ? "/register" : "/", { replace: true });
  }

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
    <div className="page-canvas flex min-h-screen items-center justify-center p-4 sm:p-6">
      <main className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/90 bg-white shadow-[0_28px_80px_rgba(0,71,133,0.18)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden bg-gradient-to-br from-csg-900 via-csg-700 to-csg-500 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute right-16 top-24 h-40 w-40 rounded-full border border-cyan-200/15" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full border border-white/10" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.2em] text-cyan-100 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_9px_rgba(103,232,249,0.9)]" /> CSG · DIGITAL OPERATIONS
            </div>
            <h1 className="mt-8 max-w-md text-3xl font-semibold leading-[1.45] tracking-wide">数智运营中心<br />平台组业务服务系统</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-blue-100/85">以清晰的业务地图和逐步操作指引，让每一项工作知道归谁办、如何办、下一步做什么。</p>
          </div>

          <div className="relative space-y-3">
            {[
              ["01", "业务流程一图总览", "快速理解完整业务链路与责任分工"],
              ["02", "带我办理逐步引导", "按环节推进，随时保存并继续办理"],
              ["03", "办理事项统一归档", "集中回顾多个关联流程的办理进度"],
            ].map(([code, title, note]) => (
              <div key={code} className="flex items-center gap-4 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <span className="mono grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-semibold text-cyan-100">{code}</span>
                <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-blue-100/65">{note}</p></div>
              </div>
            ))}
          </div>

          <div className="relative flex items-center justify-between text-[10px] tracking-wider text-blue-200/70"><span>POWER GRID DIGITAL SERVICE</span><span>安全 · 清晰 · 可追溯</span></div>
        </section>

        <section className="relative flex min-h-[600px] flex-col justify-center px-6 py-8 sm:px-12 lg:px-14">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-csg-50/70" />
          <div className="relative mx-auto w-full max-w-sm">
            <div className="mb-7 lg:hidden">
              <div className="inline-flex items-center gap-2 rounded-full bg-csg-50 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-csg-700 ring-1 ring-csg-100"><span className="h-1.5 w-1.5 rounded-full bg-csg-500" /> CSG DIGITAL OPERATIONS</div>
              <h1 className="mt-4 text-xl font-semibold leading-relaxed text-slate-900">数智运营中心平台组业务服务系统</h1>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs font-semibold tracking-[0.16em] text-csg-600">WELCOME</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">{mode === "login" ? "欢迎回来" : "创建用户账号"}</h2><p className="mt-2 text-sm text-slate-500">{mode === "login" ? "登录后继续您的业务办理事项。" : "注册后即可查看流程并使用带我办理。"}</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-csg-50 text-xl text-csg-700 ring-1 ring-csg-100">{mode === "login" ? "↗" : "+"}</span>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm">
              <button type="button" onClick={() => switchMode("login")} className={(mode === "login" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500 hover:text-slate-700") + " rounded-lg py-2.5 font-medium transition"}>账号登录</button>
              <button type="button" onClick={() => switchMode("register")} className={(mode === "register" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500 hover:text-slate-700") + " rounded-lg py-2.5 font-medium transition"}>用户注册</button>
            </div>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-medium text-slate-600">姓名</label>
                <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="请输入真实姓名" className="focus-csg block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm" />
              </div>
            )}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-slate-600">账号</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="请输入登录账号"
                className="focus-csg block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between"><label htmlFor="password" className="text-xs font-medium text-slate-600">密码</label>{mode === "register" && <span className="text-[10px] text-slate-400">至少 8 位</span>}</div>
              <div className="relative">
                <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required placeholder="请输入密码" className="focus-csg block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-14 text-sm" />
                <button type="button" className="absolute inset-y-0 right-0 px-3 text-xs text-slate-400 hover:text-csg-700" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隐藏" : "显示"}</button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"><span>!</span><span>{error}</span></div>
            )}

            <button type="submit" disabled={submitting || !username.trim() || !password || (mode === "register" && (!displayName.trim() || password.length < 8))} className="btn-primary mt-2 w-full py-3">
              {submitting ? "正在提交…" : mode === "login" ? "登录并进入系统  →" : "注册并进入系统  →"}
            </button>
          </form>

          <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
            {mode === "login" ? "普通用户可查看流程并建立个人办理事件；管理员可维护流程、台账与用户。" : "注册账号默认为普通用户，管理员权限需由系统管理员授予。"}
          </p>
          <div className="mt-4 text-center text-xs text-slate-400">
            {mode === "login" ? <>没有账号？<Link to="/register" onClick={(event) => { event.preventDefault(); switchMode("register"); }} className="ml-1 font-medium text-csg-700 hover:underline">立即注册</Link></> : <>已有账号？<Link to="/" onClick={(event) => { event.preventDefault(); switchMode("login"); }} className="ml-1 font-medium text-csg-700 hover:underline">返回登录</Link></>}
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}
