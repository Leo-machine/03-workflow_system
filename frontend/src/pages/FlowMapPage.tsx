import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import ChangeLogPanel from "../components/ChangeLogPanel";
import FlowBar from "../components/FlowBar";
import PageShell from "../components/PageShell";
import StepDetail from "../components/StepDetail";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import type { FlowDetail, User } from "../types";

type Tab = "map" | "logs";

export default function FlowMapPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const isAdmin = user.role === "admin";
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("map");
  const [loadError, setLoadError] = useState<string | null>(null);
  const reloadGen = useRef(0);

  const reloadFlow = useCallback(
    async (resetSelection = true) => {
      if (!id) return;
      const gen = ++reloadGen.current;
      try {
        const detail = await api<FlowDetail>(`/flows/${id}`);
        if (gen !== reloadGen.current) return; // 丢弃过期成功响应
        setFlow(detail);
        setLoadError(null);
        if (resetSelection) {
          setSelected(0);
        } else {
          setSelected((prev) => {
            if (detail.steps.length === 0) return 0;
            return Math.min(prev, detail.steps.length - 1);
          });
        }
      } catch (err) {
        if (gen !== reloadGen.current) return; // 丢弃过期失败，避免盖住新页
        throw err;
      }
    },
    [id]
  );

  useEffect(() => {
    reloadFlow().catch((err) => setLoadError(err instanceof Error ? err.message : "加载失败"));
  }, [reloadFlow]);

  // 回到前台时静默刷新；无权/不存在则清空，避免继续展示陈旧缓存
  const silentRefetch = useCallback(async () => {
    try {
      await reloadFlow(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 401 || err.status === 403)) {
        setFlow(null);
        setLoadError(err.status === 404 ? "流程不存在或已下线" : err.message);
      }
    }
  }, [reloadFlow]);
  useRefetchOnFocus(silentRefetch);

  const step = flow && flow.steps.length > 0 ? (flow.steps[selected] ?? flow.steps[0]) : null;

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title={flow ? `${flow.name} · 办事地图` : "流程办事地图"}
      subtitle={flow?.description ?? "归谁办 · 做什么、交什么 · 在哪些系统怎么操作（附带链接）。"}
      backTo={flow?.domain_id ? `/domains/${flow.domain_id}` : "/"}
      backLabel={flow?.domain_id ? "返回业务域" : "平台组业务导航"}
      actions={
        isAdmin ? (
          <Link to={`/flows/${id}/edit`} className="btn-ghost">
            流程设计器
          </Link>
        ) : undefined
      }
    >
      {isAdmin && (
        <div className="mb-4 flex gap-1 border-b border-slate-200 text-sm">
          {(["map", "logs"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={
                "border-b-2 px-4 py-2 font-medium transition " +
                (tab === item
                  ? "border-csg-600 text-csg-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {item === "map" ? "办事地图" : "变更记录"}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      )}

      {tab === "map" && flow && !step && !loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          该流程暂无环节
          {isAdmin ? "，请前往流程设计器补充后再发布。" : "，请稍后再看。"}
        </div>
      )}

      {tab === "map" && flow && step && (
        <>
          <div className="panel p-5 sm:p-6">
            <FlowBar steps={flow.steps} selected={selected} onSelect={setSelected} />
          </div>

          <StepDetail step={step} />
          <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-csg-600" /> 当前环节
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" /> 并行多责任人
            </span>
            <span>链接、依据、责任人均来自真实文档</span>
          </div>
        </>
      )}

      {tab === "logs" && isAdmin && id && (
        <ChangeLogPanel entityType="flow" entityId={id} title="本流程变更记录" />
      )}
    </PageShell>
  );
}
