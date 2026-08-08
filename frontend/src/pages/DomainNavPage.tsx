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
  code: string;
  name: string;
  description: string;
  icon: string;
  order_index: string; // 输入框用字符串，空 = 自动排最后
}

const EMPTY_FORM: DomainForm = { code: "", name: "", description: "", icon: "server", order_index: "" };

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
      code: domain.code,
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
        code: form.code.trim(),
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
      actions={
        isAdmin ? (
          <>
            <Link to="/ledgers" className="btn-ghost">
              台账管理
            </Link>
            <button type="button" className="btn-ghost" onClick={openCreate}>
              ＋ 新增业务域
            </button>
          </>
        ) : undefined
      }
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="relative mt-10">
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
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setFormOpen(false)}>
          <div className="panel w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-800">
              {editing ? `编辑业务域「${editing.name}」` : "新增业务域"}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  业务键 code{editing ? "（不可变）" : "（小写字母/数字/连字符，创建后不可改）"}
                </label>
                <input
                  value={form.code}
                  disabled={editing !== null}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="如 ai-computing"
                  className="focus-csg mono block w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
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
                disabled={busy || !form.name.trim() || (editing === null && !form.code.trim())}
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
