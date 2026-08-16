import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useDialog } from "../components/DialogProvider";
import PageShell from "../components/PageShell";
import Toast from "../components/Toast";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import type { AvailableGuideFlow, GuideArchive, GuideEvent, GuideEventFlow, User } from "../types";

type StatusFilter = "all" | "in_progress" | "completed";

export default function GuideEventsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const dialog = useDialog();
  const [events, setEvents] = useState<GuideEvent[]>([]);
  const [flows, setFlows] = useState<AvailableGuideFlow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [title, setTitle] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [initialFlowId, setInitialFlowId] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [flowId, setFlowId] = useState("");
  const [editing, setEditing] = useState<GuideEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRef, setEditRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [eventList, flowList] = await Promise.all([
        api<GuideEvent[]>("/guide-events"),
        api<AvailableGuideFlow[]>("/guide-events/available-flows"),
      ]);
      setEvents(eventList);
      setFlows(flowList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载办理事件失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (statusFilter !== "all" && event.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [event.title, event.event_key, event.external_ref ?? "", ...event.flows.map((item) => item.flow_name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query, statusFilter]);

  async function createEvent() {
    if (!title.trim() || !initialFlowId) return;
    try {
      await api("/guide-events", {
        method: "POST",
        body: { title, external_ref: externalRef || null, flow_id: Number(initialFlowId) },
      });
      setTitle("");
      setExternalRef("");
      setInitialFlowId("");
      setCreating(false);
      setToast("已创建办理事项");
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function addFlow() {
    if (!addingTo || !flowId) return;
    try {
      await api<GuideArchive>(`/guide-events/${addingTo}/flows`, { method: "POST", body: { flow_id: Number(flowId) } });
      setAddingTo(null);
      setFlowId("");
      setToast("已添加业务流程");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加流程失败");
    }
  }

  async function saveEvent() {
    if (!editing || !editTitle.trim()) return;
    try {
      await api(`/guide-events/${editing.id}`, {
        method: "PATCH",
        body: { title: editTitle.trim(), external_ref: editRef.trim() },
      });
      setEditing(null);
      setToast("办理事件已更新");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function deleteEvent(event: GuideEvent) {
    const flowHint = event.flows.length > 0 ? `其下 ${event.flows.length} 个流程办理实例将一并删除，` : "";
    if (
      !(await dialog.confirm(`确认删除办理事件「${event.title}」？${flowHint}删除后无法恢复。`, {
        title: "删除办理事项",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await api(`/guide-events/${event.id}`, { method: "DELETE" });
      setToast(`已删除「${event.title}」`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function removeFlow(event: GuideEvent, item: GuideEventFlow) {
    if (
      !(await dialog.confirm(`确认从「${event.title}」中移除流程「${item.flow_name}」？办理进度将一并删除。`, {
        title: "移除流程实例",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await api(`/guide-events/${event.id}/flows/${item.archive_id}`, { method: "DELETE" });
      setToast(`已移除「${item.flow_name}」`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除失败");
    }
  }

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title="我的办理"
      subtitle="按事项归集多个业务流程，可搜索、编辑、删除，随时中断、继续和复习。"
      backTo="/"
      backLabel="返回业务导航"
      wide
      actions={
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          ＋ 新建办理事项
        </button>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索事项名称 / 事件编号 / 工单号 / 流程"
          className="focus-csg w-full max-w-md rounded-md border border-slate-200 px-3 py-1.5 text-sm sm:w-80"
        />
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {(
            [
              ["all", "全部"],
              ["in_progress", "办理中"],
              ["completed", "已完成"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={
                "rounded-md px-2.5 py-1 font-medium transition " +
                (statusFilter === value ? "bg-csg-600 text-white" : "text-slate-500 hover:bg-csg-50 hover:text-csg-700")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">
          显示 {filtered.length} / {events.length} 件
        </span>
      </div>

      <div className="space-y-3">
        {filtered.map((event) => {
          const done = event.flows.filter((item) => item.status === "completed").length;
          return (
            <section key={event.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-csg-50 to-white px-5 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{event.title}</h2>
                    <span className="mono rounded bg-white px-2 py-0.5 text-[10px] text-csg-700 ring-1 ring-csg-100">
                      {event.event_key}
                    </span>
                    <span
                      className={
                        (event.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700") +
                        " rounded-full px-2 py-0.5 text-[10px]"
                      }
                    >
                      {event.status === "completed" ? "已完成" : "办理中"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.external_ref ? `关联工单：${event.external_ref} · ` : ""}
                    {done}/{event.flows.length} 个流程已完成 · 更新于{" "}
                    {new Date(event.updated_at).toLocaleString("zh-CN", { hour12: false })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => {
                      setEditing(event);
                      setEditTitle(event.title);
                      setEditRef(event.external_ref ?? "");
                    }}
                  >
                    ✎ 编辑
                  </button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setAddingTo(event.id)}>
                    ＋ 添加流程
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs text-red-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void deleteEvent(event)}
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {event.flows.map((item) => (
                  <div
                    key={item.archive_id}
                    className="group relative rounded-xl border border-slate-100 bg-white p-3 transition hover:border-csg-300 hover:shadow-sm"
                  >
                    <Link to={`/flows/${item.flow_id}/guide?archive=${item.archive_id}`} className="block pr-8">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{item.flow_name}</span>
                        <span
                          className={
                            (item.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-csg-50 text-csg-700") +
                            " shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                          }
                        >
                          {item.status === "completed" ? "已完成" : "继续办理"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        最后保存 {new Date(item.updated_at).toLocaleString("zh-CN", { hour12: false })}
                      </p>
                    </Link>
                    <button
                      type="button"
                      title="移除该流程实例"
                      className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-xs text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                      onClick={() => void removeFlow(event, item)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {event.flows.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setAddingTo(event.id)}
                    className="rounded-xl border border-dashed border-csg-200 p-4 text-sm text-csg-600"
                  >
                    添加第一个业务流程
                  </button>
                )}
              </div>
            </section>
          );
        })}
        {events.length === 0 && (
          <div className="panel p-10 text-center text-sm text-slate-500">
            还没有办理事项。新建一个事项，将相关流程集中归档。
          </div>
        )}
        {events.length > 0 && filtered.length === 0 && (
          <div className="panel p-10 text-center text-sm text-slate-500">没有匹配的办理事件，试试调整搜索或筛选。</div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setCreating(false)}>
          <div className="panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">新建办理事项</h3>
            <div className="mt-4 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="事项名称，如：服务器A下线检修"
                className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={initialFlowId}
                onChange={(e) => setInitialFlowId(e.target.value)}
                className="focus-csg w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">请选择首个业务流程</option>
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>{flow.domain_name} · {flow.name}</option>
                ))}
              </select>
              <input
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="关联工单号（选填）"
                className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">事项编号由系统自动生成，工单号可留空。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
                取消
              </button>
              <button type="button" className="btn-primary" disabled={!title.trim() || !initialFlowId} onClick={() => void createEvent()}>
                创建并开始办理
              </button>
            </div>
          </div>
        </div>
      )}

      {addingTo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setAddingTo(null)}>
          <div className="panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">添加业务流程</h3>
            <select
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
              className="mt-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">请选择流程</option>
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.domain_name} · {flow.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400">同一事件可添加多个流程，也允许多次添加相同流程。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setAddingTo(null)}>
                取消
              </button>
              <button type="button" className="btn-primary" disabled={!flowId} onClick={() => void addFlow()}>
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => setEditing(null)}>
          <div className="panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">编辑办理事件</h3>
            <div className="mt-4 space-y-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="事项名称"
                className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={editRef}
                onChange={(e) => setEditRef(e.target.value)}
                placeholder="关联工单号（选填）"
                className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="button" className="btn-primary" disabled={!editTitle.trim()} onClick={() => void saveEvent()}>
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
