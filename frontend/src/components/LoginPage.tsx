import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
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
      <div className="panel w-full max-w-sm overflow-hidden">
        <div className="h-1.5 bg-csg-600" />
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-1.5 rounded-sm bg-csg-600" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">数智运营中心平台运维团队平台组业务服务系统</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">归谁办 · 做什么交什么 · 在哪些系统怎么操作</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                autoComplete="current-password"
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
              {submitting ? "登录中…" : "登 录"}
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            只读账号可查看流程；管理员账号可进入管理模式维护岗位责任人，全部变更留痕。
          </p>
        </div>
      </div>
    </div>
  );
}
