import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import PageShell from "../components/PageShell";
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
      backLabel="平台组业务导航"
      actions={
        isAdmin ? (
          <button type="button" className="btn-primary" disabled={creating} onClick={() => void createFlow()}>
            {creating ? "创建中…" : "新建流程"}
          </button>
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

                {isAdmin && (
                  <div className="flex w-24 shrink-0 flex-col justify-center gap-2">
                    <Link
                      to={`/flows/${flow.id}/edit`}
                      className="btn-ghost rounded-md px-2 py-1.5 text-center text-xs"
                      title="流程设计器"
                    >
                      设计器
                    </Link>
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
    </PageShell>
  );
}
