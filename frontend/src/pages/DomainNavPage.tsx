import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import PageShell from "../components/PageShell";
import Toast from "../components/Toast";
import { useDialog } from "../components/DialogProvider";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import type { BusinessDomain, User } from "../types";

const ICONS: Record<string, string> = {
  server: "▣",
  storage: "▤",
  backup: "◫",
  cloud: "☁",
  software: "⌘",
  "resource-delivery": "↯",
  compute: "⚡",
  chip: "◧",
  data: "◍",
  network: "⌁",
};

const ICON_OPTIONS = Object.entries(ICONS);

interface DomainForm {
  name: string;
  description: string;
  icon: string;
  order_index: string; // 输入框用字符串，空 = 自动排最后
}

const EMPTY_FORM: DomainForm = { name: "", description: "", icon: "server", order_index: "" };

export default function DomainNavPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const isAdmin = user.role === "admin";
  const dialog = useDialog();
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessDomain | null>(null);
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const publishedFlowCount = domains.reduce((sum, domain) => sum + domain.published_flow_count, 0);

  const load = useCallback(async () => {
    try {
      setDomains(await api<BusinessDomain[]>("/domains"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载业务域失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(domain: BusinessDomain) {
    setEditing(domain);
    setForm({
      name: domain.name,
      description: domain.description,
      icon: domain.icon,
      order_index: String(domain.order_index),
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        icon: form.icon,
        order_index: form.order_index.trim() === "" ? null : Number(form.order_index),
      };
      if (editing) {
        await api(`/domains/${editing.id}`, { method: "PUT", body });
        setToast("业务域已更新");
      } else {
        await api("/domains", { method: "POST", body });
        setToast(`已新增业务域「${form.name.trim()}」`);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDomain(domain: BusinessDomain) {
    if (!await dialog.confirm(`确认删除业务域「${domain.name}」？其下仍有流程时系统会阻止删除。`, { title: "删除业务域", danger: true })) return;
    try {
      await api(`/domains/${domain.id}`, { method: "DELETE" });
      setToast(`已删除业务域「${domain.name}」`);
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title="数智运营中心平台运维团队平台组业务服务系统"
      subtitle="选择已投运业务域，进入流程办事地图。"
      wide
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="mb-8 grid gap-4 lg:grid-cols-[1.45fr_1fr]" aria-label="业务工作台">
        <Link
          to="/my-guides"
          className="group relative overflow-hidden rounded-2xl border border-csg-200 bg-gradient-to-br from-csg-700 via-csg-600 to-csg-500 p-5 text-white shadow-[0_16px_36px_rgba(7,95,165,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(7,95,165,0.28)] sm:p-6"
        >
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute right-8 top-8 h-28 w-28 rounded-full border border-cyan-200/20" />
          <div className="relative flex h-full min-h-36 flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-cyan-50 ring-1 ring-white/15">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
                个人业务工作区
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-wide">继续我的办理</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-blue-50/85">集中查看办理事项、继续未完成流程，或回顾已经完成的操作步骤。</p>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-blue-100">办理进度自动归入个人事项</span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl text-csg-700 shadow-lg transition group-hover:translate-x-1">→</span>
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <div className="panel flex flex-col justify-between p-4">
            <span className="text-xs font-medium text-slate-400">业务域</span>
            <strong className="mt-2 text-3xl font-semibold text-csg-800">{domains.length}</strong>
            <span className="mt-1 text-xs text-slate-500">个已投运领域</span>
          </div>
          <div className="panel flex flex-col justify-between p-4">
            <span className="text-xs font-medium text-slate-400">流程资源</span>
            <strong className="mt-2 text-3xl font-semibold text-csg-800">{publishedFlowCount}</strong>
            <span className="mt-1 text-xs text-slate-500">条已发布流程</span>
          </div>
          {isAdmin ? (
            <>
              <Link to="/ledgers" className="group rounded-2xl border border-csg-100 bg-white p-4 shadow-sm transition hover:border-csg-300 hover:bg-csg-50">
                <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-csg-50 text-lg text-csg-700">▦</span><span className="text-csg-500 transition group-hover:translate-x-0.5">→</span></div>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">台账管理</h3>
                <p className="mt-1 text-[11px] text-slate-400">团队、人员与负责人</p>
              </Link>
              <Link to="/users" className="group rounded-2xl border border-csg-100 bg-white p-4 shadow-sm transition hover:border-csg-300 hover:bg-csg-50">
                <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-csg-50 text-lg text-csg-700">◎</span><span className="text-csg-500 transition group-hover:translate-x-0.5">→</span></div>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">用户管理</h3>
                <p className="mt-1 text-[11px] text-slate-400">账号、角色与使用状态</p>
              </Link>
            </>
          ) : (
            <div className="col-span-2 rounded-2xl border border-csg-100 bg-white p-4 text-sm text-slate-500 shadow-sm">
              从下方选择业务域，查看完整流程地图和操作指引。
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-csg-600"><span className="h-px w-6 bg-csg-400" /> BUSINESS DOMAINS</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">业务域导航</h2>
            <p className="mt-1 text-sm text-slate-500">选择业务领域，进入流程列表、地图和带我办理。</p>
          </div>
          {isAdmin && <button type="button" className="btn-primary" onClick={openCreate}>＋ 新增业务域</button>}
        </div>

        <div className="relative">
        {/* 单线图母线 */}
        <div className="pointer-events-none absolute left-4 right-4 top-8 h-px bg-csg-200 sm:left-6 sm:right-6" />
        <div className="pointer-events-none absolute left-4 right-4 top-[30px] h-[3px] bg-gradient-to-r from-csg-100 via-csg-400 to-csg-100 opacity-70 sm:left-6 sm:right-6" />

        <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => (
            /* 业务域全部已投运：一律可进入（管理员在内设计/发布流程） */
            <div key={domain.id} className="flex flex-col">
              <Link to={`/domains/${domain.id}`} className="block flex-1">
                <article className="group relative h-full rounded-2xl border border-white bg-white/95 p-5 pt-12 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-csg-300 hover:shadow-[0_20px_42px_rgba(0,71,133,0.13)]">
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-csg-400 via-cyan-400 to-emerald-400 opacity-0 transition group-hover:opacity-100" />
                  {/* 断路器节点 */}
                  <div className="absolute left-5 top-0 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-2xl border-[3px] border-white bg-gradient-to-br from-csg-500 to-csg-800 font-mono text-xl text-white shadow-[0_8px_20px_rgba(0,71,133,0.25)] transition group-hover:scale-105">
                    {ICONS[domain.icon] ?? "○"}
                  </div>

                  <div className="absolute right-5 top-5 flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                    <span className="font-medium text-csg-700">已投运</span>
                  </div>

                  <h2 className="text-lg font-semibold tracking-wide text-slate-900 transition group-hover:text-csg-800">{domain.name}</h2>
                  <p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-500">{domain.description}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="mono text-slate-400">
                      BUS-{String(domain.order_index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium text-csg-600">
                      {domain.published_flow_count > 0
                        ? `${domain.published_flow_count} 条已发布流程 →`
                        : "进入 →"}
                    </span>
                  </div>
                </article>
              </Link>

              {/* 管理条：在卡片正下方独立成行，不压卡片内容、防点错 */}
              {isAdmin && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1 text-xs"
                    onClick={() => openEdit(domain)}
                  >
                    ✎ 编辑
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-transparent px-2.5 py-1 text-xs text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    onClick={() => void deleteDomain(domain)}
                  >
                    × 删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {domains.length === 0 && (
          <div className="panel relative p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-csg-50 text-xl text-csg-600">◇</div>
            <h3 className="mt-3 font-semibold text-slate-800">暂无业务域</h3>
            <p className="mt-1 text-sm text-slate-500">{isAdmin ? "新建第一个业务域后即可开始配置流程。" : "请联系管理员配置业务域。"}</p>
          </div>
        )}
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setFormOpen(false)}>
          <div className="panel w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-800">
              {editing ? `编辑业务域「${editing.name}」` : "新增业务域"}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如 智能算力资源管理"
                  className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">说明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">图标</label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map(([key, symbol]) => (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      onClick={() => setForm({ ...form, icon: key })}
                      className={
                        "grid h-9 w-9 place-items-center rounded-md border font-mono text-base transition " +
                        (form.icon === key
                          ? "border-csg-500 bg-csg-50 text-csg-700 ring-2 ring-csg-100"
                          : "border-slate-200 bg-white text-slate-500 hover:border-csg-300")
                      }
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">排序（留空自动排最后）</label>
                <input
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: e.target.value.replace(/[^\d]/g, "") })}
                  inputMode="numeric"
                  className="focus-csg block w-32 rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !form.name.trim()}
                onClick={() => void submitForm()}
              >
                {busy ? "保存中…" : editing ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
