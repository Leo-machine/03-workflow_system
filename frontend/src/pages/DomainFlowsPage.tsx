import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, downloadFile, uploadFile } from "../api/client";
import PageShell from "../components/PageShell";
import Toast from "../components/Toast";
import { useDialog } from "../components/DialogProvider";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import type { BusinessDomainDetail, DomainFlow, FlowMutationResult, User } from "../types";

export default function DomainFlowsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const dialog = useDialog();
  const [domain, setDomain] = useState<BusinessDomainDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [cloningId, setCloningId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDomain(await api<BusinessDomainDetail>(`/domains/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载流程失败");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // （1）本域流程查询：按名称/说明模糊过滤
  const filteredFlows = useMemo(() => {
    const flows = domain?.flows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return flows;
    return flows.filter(
      (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    );
  }, [domain, query]);

  async function createFlow() {
    if (!id || creating) return;
    const name = await dialog.prompt("请输入便于识别的流程名称，创建后可继续完善环节与操作指引。", "新建流程", { title: "新建流程" });
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      const result = await api<FlowMutationResult>("/flows", {
        method: "POST",
        body: { domain_id: Number(id), name: name.trim(), description: "" },
      });
      navigate(`/flows/${result.flow.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setCreating(false);
    }
  }

  async function cloneFlow(flow: DomainFlow) {
    if (cloningId) return;
    setCloningId(flow.id);
    setError(null);
    try {
      const result = await api<FlowMutationResult>(`/flows/${flow.id}/clone`, { method: "POST" });
      navigate(`/flows/${result.flow.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制失败");
      setCloningId(null);
    }
  }

  async function deleteFlow(flow: DomainFlow) {
    if (!await dialog.confirm(`确认删除 draft 流程「${flow.name}」？删除后无法恢复。`, { title: "删除流程", danger: true })) return;
    setDeletingId(flow.id);
    try {
      await api(`/flows/${flow.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title={domain?.name ?? "业务域流程"}
      subtitle={domain?.description ?? "加载中…"}
      backTo="/"
      backLabel="返回业务导航"
      actions={
        isAdmin ? (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}>
              导入表格
            </button>
            <button type="button" className="btn-primary" disabled={creating} onClick={() => void createFlow()}>
              {creating ? "创建中…" : "新建流程"}
            </button>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {domain && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              {query.trim()
                ? `匹配 ${filteredFlows.length} / ${domain.flows.length} 条流程`
                : `${domain.flows.length} 条规划流程`}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="查询本域流程（名称/说明）"
              className="focus-csg w-64 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            />
          </div>

          {filteredFlows.length === 0 && (
            <p className="panel p-5 text-sm text-slate-400">
              {query.trim() ? "没有匹配的流程。" : "本域暂无流程。"}
            </p>
          )}

          {filteredFlows.map((flow, index) => {
            const published = flow.status === "published";
            // 列表里 draft 仅 admin 能拿到（后端已过滤）；published 所有人可进
            const enterable = published || isAdmin;
            // 设计器/删除是独立热区，不与进入卡片重叠，防止点错
            const card = (
              <article
                className={
                  "panel h-full p-5 transition " +
                  (enterable ? "hover:-translate-y-0.5 hover:border-csg-400" : "bg-slate-50")
                }
              >
                <div className="flex items-start gap-4">
                  <span
                    className={
                      "grid h-9 w-9 shrink-0 place-items-center rounded-md text-xs font-semibold " +
                      (published ? "bg-csg-600 text-white" : "bg-slate-200 text-slate-500")
                    }
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className={"font-medium " + (enterable ? "text-slate-900" : "text-slate-500")}>
                        {flow.name}
                      </h2>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                          (published
                            ? "bg-csg-50 text-csg-700 ring-1 ring-csg-200"
                            : "bg-slate-200 text-slate-500")
                        }
                      >
                        {published ? "已发布" : "draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{flow.description}</p>
                  </div>
                  {enterable && (
                    <span className="ml-auto shrink-0 text-sm font-medium text-csg-600">进入 →</span>
                  )}
                </div>
              </article>
            );

            return (
              <div key={flow.id} className="flex items-stretch gap-2">
                {enterable ? (
                  <Link to={`/flows/${flow.id}`} className="min-w-0 flex-1">
                    {card}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{card}</div>
                )}

                {(published || isAdmin) && (
                  <div className="flex w-28 shrink-0 flex-col justify-center gap-2">
                    {published && (
                      <Link
                        to={`/flows/${flow.id}/guide`}
                        className="btn-primary rounded-md px-2 py-1.5 text-center text-xs"
                        title="按步骤查看办理指引"
                      >
                        带我办理
                      </Link>
                    )}
                    {isAdmin && (
                    <Link
                      to={`/flows/${flow.id}/edit`}
                      className="btn-ghost rounded-md px-2 py-1.5 text-center text-xs"
                      title="流程设计器"
                    >
                      设计器
                    </Link>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={cloningId === flow.id}
                        onClick={() => void cloneFlow(flow)}
                        className="btn-ghost rounded-md px-2 py-1.5 text-xs"
                        title="复制为新的 draft 流程"
                      >
                        {cloningId === flow.id ? "复制中…" : "复制"}
                      </button>
                    )}
                    {flow.status === "draft" && (
                      <button
                        type="button"
                        disabled={deletingId === flow.id}
                        onClick={() => void deleteFlow(flow)}
                        className="rounded-md border border-red-200 bg-white px-2 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        title="删除该 draft 流程"
                      >
                        {deletingId === flow.id ? "删除中…" : "删除"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      {importOpen && (
        <FlowImportModal
          onClose={() => setImportOpen(false)}
          onImported={async (message) => {
            setImportOpen(false);
            setToast(message);
            await load();
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </PageShell>
  );
}

interface FlowImportResult {
  ok: boolean;
  committed: boolean;
  issues: { row: number; message: string }[];
  flows: { domain_name: string; flow_name: string; step_count: number; guide_count: number }[];
  created_flow_ids: number[];
}

function FlowImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FlowImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await uploadFile<FlowImportResult>("/flow-imports/preview", file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!file || busy || !preview?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFile<FlowImportResult>("/flow-imports/commit", file);
      if (!result.ok) {
        setPreview(result);
        setBusy(false);
        return;
      }
      await onImported(`已导入 ${result.created_flow_ids.length} 条 draft 流程`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-csg-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-csg-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-xs font-semibold tracking-[0.16em] text-csg-600">FLOW IMPORT</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">批量导入流程草稿</h3>
            <p className="mt-1 text-xs text-slate-500">先下载带样例的模板，上传后完成校验，确认无误再写入系统。</p>
          </div>
          <button type="button" aria-label="关闭" disabled={busy} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40" onClick={onClose}>✕</button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-5 grid grid-cols-3 gap-2 text-center text-xs">
            {["1 下载模板", "2 上传并校验", "3 确认导入"].map((label, index) => {
              const active = preview ? index <= 2 : file ? index <= 1 : index === 0;
              return <div key={label} className={(active ? "border-csg-200 bg-csg-50 text-csg-700" : "border-slate-100 bg-slate-50 text-slate-400") + " rounded-lg border px-2 py-2 font-medium"}>{label}</div>;
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-xl border border-csg-100 bg-csg-50/70 p-4">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-xl text-csg-700 shadow-sm">⇩</span><div><h4 className="text-sm font-semibold text-slate-800">样例模板</h4><p className="mt-0.5 text-[11px] text-slate-500">内含算力卡全生命周期 5 个环节</p></div></div>
              <button type="button" className="btn-ghost mt-4 w-full text-xs" onClick={() => void downloadFile("/flow-imports/template.csv", "流程导入模板-含样例.csv")}>下载 CSV 样例模板</button>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">请将样例中的业务域、责任团队、责任人和直接领导替换为系统内已有台账名称。</p>
            </div>

            <label className={(file ? "border-csg-400 bg-csg-50/50" : "border-slate-200 bg-slate-50/70 hover:border-csg-300 hover:bg-csg-50/40") + " relative flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition"}>
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(null); }} />
              <span className={(file ? "bg-csg-600 text-white" : "bg-white text-csg-600") + " grid h-11 w-11 place-items-center rounded-2xl text-xl shadow-sm"}>{file ? "✓" : "＋"}</span>
              {file ? <><strong className="mt-3 max-w-full truncate text-sm text-csg-800">{file.name}</strong><span className="mt-1 text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · 点击可重新选择</span></> : <><strong className="mt-3 text-sm text-slate-700">点击选择 CSV 或 XLSX 文件</strong><span className="mt-1 text-xs text-slate-400">文件不超过 2 MB</span></>}
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><strong>安全规则：</strong>导入只会新建 draft 流程，不覆盖现有流程，也不会自动创建业务域、团队或人员。</div>
        {preview && (
          <div className="mt-4 space-y-3">
            {preview.flows.length > 0 && (
              <ul className="rounded-xl border border-csg-100 bg-csg-50/50 px-4 py-3 text-sm text-slate-700">
                {preview.flows.map((flow) => (
                  <li key={`${flow.domain_name}-${flow.flow_name}`} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span><strong>{flow.flow_name}</strong><span className="ml-2 text-xs text-slate-400">{flow.domain_name}</span></span><span className="rounded-full bg-white px-2 py-1 text-[11px] text-csg-700">{flow.step_count} 个环节 · {flow.guide_count} 条指引</span>
                  </li>
                ))}
              </ul>
            )}
            {preview.issues.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
                {preview.issues.map((issue, index) => (
                  <li key={`${issue.row}-${index}`}>
                    第 {issue.row} 行：{issue.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.ok && <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">✓ 校验通过，可以确认导入。流程将以 draft 状态创建。</p>}
          </div>
        )}
        {error && <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>
        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <button type="button" className="text-xs text-slate-400 hover:text-slate-600" disabled={busy} onClick={onClose}>取消导入</button>
          <div className="flex gap-2">
          {preview === null ? (
            <button type="button" className="btn-primary" disabled={!file || busy} onClick={() => void runPreview()}>
              {busy ? "校验中…" : "校验预览"}
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost text-xs" onClick={() => setPreview(null)}>
                ← 重新选择
              </button>
              <button type="button" className="btn-primary" disabled={!preview.ok || busy} onClick={() => void runCommit()}>
                {busy ? "导入中…" : "确认导入 draft"}
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
