import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import ChangeLogPanel from "../components/ChangeLogPanel";
import FlowBar from "../components/FlowBar";
import PageShell from "../components/PageShell";
import StepDetail from "../components/StepDetail";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { downloadDrawio } from "../lib/drawioExport";
import type { FlowDetail, User } from "../types";

type Tab = "map" | "logs";

export default function FlowMapPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const isAdmin = user.role === "admin";
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("map");
  const [exportOpen, setExportOpen] = useState(false);
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
      subtitle={flow?.description ?? "谁来操作 · 遇到问题找谁 · 如何协调升级 · 在哪些系统怎么操作。"}
      backTo={flow?.domain_id ? `/domains/${flow.domain_id}` : "/"}
      backLabel={flow?.domain_id ? "返回业务域" : "平台组业务导航"}
      actions={
        <>
          {flow?.steps.length ? <Link to={`/flows/${id}/guide`} className="btn-primary">带我办理</Link> : null}
          {flow?.steps.length ? (
            <button type="button" className="btn-ghost" onClick={() => setExportOpen(true)}>
              导出 draw.io
            </button>
          ) : null}
          {isAdmin ? <Link to={`/flows/${id}/edit`} className="btn-ghost">流程设计器</Link> : null}
        </>
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
            <span>操作主体来自流程定义；支撑与升级联系人来自人员台账，升级联系人留空时默认取团队负责人</span>
          </div>
        </>
      )}

      {tab === "logs" && isAdmin && id && (
        <ChangeLogPanel entityType="flow" entityId={id} title="本流程变更记录" />
      )}
      {exportOpen && flow && <DrawioExportModal flow={flow} onClose={() => setExportOpen(false)} />}
    </PageShell>
  );
}

function DrawioExportModal({ flow, onClose }: { flow: FlowDetail; onClose: () => void }) {
  const [fileName, setFileName] = useState(flow.name);
  const guideCount = flow.steps.reduce((sum, step) => sum + step.guide.length, 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-csg-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]" onClick={(event) => event.stopPropagation()}>
        <div className="relative overflow-hidden bg-gradient-to-r from-csg-800 to-csg-600 px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full border border-white/15" />
          <button type="button" aria-label="关闭" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white" onClick={onClose}>✕</button>
          <div className="text-xs font-medium tracking-[0.16em] text-cyan-100">DRAW.IO EXPORT</div>
          <h3 className="mt-2 text-lg font-semibold">导出可编辑流程图</h3>
          <p className="mt-1 text-sm text-blue-100">生成南网蓝横向流程图，可在 diagrams.net 中继续调整、导出 PNG 或 PDF。</p>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-[1fr_1.1fr]">
          <div className="rounded-xl border border-csg-100 bg-csg-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-csg-700"><span className="h-2 w-2 rounded-full bg-csg-500" /> 导出内容</div>
            <div className="mt-4 flex items-center gap-2">
              {flow.steps.slice(0, 4).map((step, index) => (
                <div key={step.id} className="contents">
                  {index > 0 && <span className="h-px flex-1 bg-csg-300" />}
                  <span className="grid h-9 min-w-9 place-items-center rounded-lg border border-csg-300 bg-white px-1 text-[9px] font-semibold text-csg-700">{step.code}</span>
                </div>
              ))}
              {flow.steps.length > 4 && <span className="text-xs text-slate-400">+{flow.steps.length - 4}</span>}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-white p-2"><dt className="text-[10px] text-slate-400">流程环节</dt><dd className="mt-0.5 text-lg font-semibold text-csg-800">{flow.steps.length}</dd></div>
              <div className="rounded-lg bg-white p-2"><dt className="text-[10px] text-slate-400">操作指引</dt><dd className="mt-0.5 text-lg font-semibold text-csg-800">{guideCount}</dd></div>
            </dl>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="drawio-file-name">文件名称</label>
            <div className="mt-2 flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-csg-400 focus-within:ring-2 focus-within:ring-csg-100">
              <input id="drawio-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} className="min-w-0 flex-1 px-3 py-2 text-sm outline-none" />
              <span className="border-l border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-400">.drawio</span>
            </div>
            <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500">
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> 横向主流程，操作指引按环节向下展开</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> 包含操作主体、支撑联系人、升级联系人及系统操作说明</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> 文件可编辑，不会修改系统中的流程</li>
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <span className="text-xs text-slate-400">推荐使用 diagrams.net 打开</span>
          <div className="flex gap-2"><button type="button" className="btn-ghost" onClick={onClose}>取消</button><button type="button" className="btn-primary" disabled={!fileName.trim()} onClick={() => { downloadDrawio(flow, fileName); onClose(); }}>下载 draw.io 文件</button></div>
        </div>
      </div>
    </div>
  );
}
