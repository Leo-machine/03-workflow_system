import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import GuideList from "../components/GuideList";
import PageShell from "../components/PageShell";
import type { FlowDetail, GuideArchive, GuideEvent, Step, User } from "../types";

type Progress = { step: number; guide: number };

/** 无指引的环节仍占 1 个阅读位，便于推进 */
function guideSlots(step: Step): number {
  return Math.max(step.guide.length, 1);
}

function loadProgress(key: string): Progress {
  const raw = localStorage.getItem(key);
  if (!raw) return { step: 0, guide: 0 };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "step" in parsed) {
      const obj = parsed as Progress;
      return {
        step: Number(obj.step) || 0,
        guide: Number(obj.guide) || 0,
      };
    }
  } catch {
    // legacy: plain step index
  }
  const n = Number(raw);
  return { step: Number.isFinite(n) ? n : 0, guide: 0 };
}

function flatOffset(steps: Step[], stepIndex: number, guideIndex: number): number {
  let offset = 0;
  for (let i = 0; i < stepIndex; i++) offset += guideSlots(steps[i]);
  return offset + guideIndex;
}

function totalSlots(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + guideSlots(s), 0);
}

export default function FlowGuidePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const archiveParam = searchParams.get("archive");
  const creatingArchiveRef = useRef(false);
  const storageKey = `flowmap-guide-progress:${id ?? "unknown"}`;
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(storageKey));
  const [archive, setArchive] = useState<GuideArchive | null>(null);
  const [event, setEvent] = useState<GuideEvent | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [externalRefDraft, setExternalRefDraft] = useState("");
  const [namingOpen, setNamingOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    if (!archiveParam && creatingArchiveRef.current) return;
    if (!archiveParam) creatingArchiveRef.current = true;
    try {
      const loadedFlow = await api<FlowDetail>(`/flows/${id}`);
      setFlow(loadedFlow);
      if (!archiveParam) {
        const stamp = new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
        setTitleDraft(`${loadedFlow.name}－${stamp}`);
        setNamingOpen(true);
        return;
      }
      const saved = await api<GuideArchive>(`/guide-archives/${archiveParam}`);
      if (saved.flow_id !== loadedFlow.id) throw new Error("该办理实例不属于当前流程");
      setArchive(saved);
      if (saved.event_id) {
        const loadedEvent = await api<GuideEvent>(`/guide-events/${saved.event_id}`);
        setEvent(loadedEvent);
        setTitleDraft(loadedEvent.title);
        setExternalRefDraft(loadedEvent.external_ref ?? "");
      }
      {
        const stepIndex = loadedFlow.steps.findIndex((item) => item.id === saved.step_id);
        if (stepIndex >= 0) {
          const guideIndex = saved.guide_item_id === null
            ? 0
            : loadedFlow.steps[stepIndex].guide.findIndex((item) => item.id === saved.guide_item_id);
          setProgress({ step: stepIndex, guide: Math.max(guideIndex, 0) });
        }
        setCompleted(saved.status === "completed");
      }
    } catch (err) {
      creatingArchiveRef.current = false;
      setError(err instanceof Error ? err.message : "加载引导失败");
    }
  }, [archiveParam, id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  const steps = flow?.steps ?? [];
  const safeStep = steps.length ? Math.min(Math.max(progress.step, 0), steps.length - 1) : 0;
  const step = steps[safeStep] ?? null;
  const slotsInStep = step ? guideSlots(step) : 1;
  const safeGuide = Math.min(Math.max(progress.guide, 0), slotsInStep - 1);
  const hasRealGuides = Boolean(step && step.guide.length > 0);
  const currentGuide = hasRealGuides && step ? [step.guide[safeGuide]] : [];

  const total = steps.length ? totalSlots(steps) : 0;
  const position = steps.length ? flatOffset(steps, safeStep, safeGuide) : 0;
  const percent = total ? Math.round(((position + 1) / total) * 100) : 0;

  const isFirst = safeStep === 0 && safeGuide === 0;
  const isLastGuideInStep = safeGuide >= slotsInStep - 1;
  const isLastStep = Boolean(flow && safeStep === steps.length - 1);
  const isLastOverall = isLastStep && isLastGuideInStep;

  const guideSystems = useMemo(
    () => [...new Set((step?.guide ?? []).map((item) => item.system_name))],
    [step]
  );

  async function save(next: Progress, status: "in_progress" | "completed") {
    if (!id || !archive || !steps[next.step]) return;
    const targetStep = steps[next.step];
    const targetGuide = targetStep.guide[next.guide];
    setSaving(true);
    try {
      const saved = await api<GuideArchive>(`/guide-archives/${archive.id}`, {
        method: "PUT",
        body: {
          step_id: targetStep.id,
          guide_item_id: targetGuide?.id ?? null,
          status,
        },
      });
      setArchive(saved);
    } catch (err) {
      setError(err instanceof Error ? `进度保存在本机；云端存档失败：${err.message}` : "云端存档失败");
    } finally {
      setSaving(false);
    }
  }

  async function createNamedArchive() {
    if (!flow || !titleDraft.trim()) return;
    setSaving(true);
    try {
      const createdEvent = await api<GuideEvent>("/guide-events", {
        method: "POST", body: { title: titleDraft.trim(), external_ref: externalRefDraft.trim() || null },
      });
      const saved = await api<GuideArchive>(`/guide-events/${createdEvent.id}/flows`, {
        method: "POST", body: { flow_id: flow.id },
      });
      setEvent(createdEvent); setArchive(saved); setNamingOpen(false);
      setProgress({ step: 0, guide: 0 });
      navigate(`/flows/${id}/guide?archive=${saved.id}`, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : "创建存档失败"); }
    finally { setSaving(false); }
  }

  async function manualSave() {
    if (!event || !titleDraft.trim()) return;
    setSaving(true);
    try {
      const updated = await api<GuideEvent>(`/guide-events/${event.id}`, {
        method: "PATCH", body: { title: titleDraft.trim(), external_ref: externalRefDraft.trim() },
      });
      setEvent(updated);
      await save({ step: safeStep, guide: safeGuide }, completed ? "completed" : "in_progress");
      setSaveNotice(true);
      window.setTimeout(() => setSaveNotice(false), 2500);
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setSaving(false); }
  }

  function go(next: Progress) {
    setCompleted(false);
    setProgress(next);
    void save(next, "in_progress");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goPrev() {
    if (!flow || isFirst) return;
    if (safeGuide > 0) {
      go({ step: safeStep, guide: safeGuide - 1 });
      return;
    }
    const prevStepIndex = safeStep - 1;
    const prevSlots = guideSlots(steps[prevStepIndex]);
    go({ step: prevStepIndex, guide: prevSlots - 1 });
  }

  async function goNext() {
    if (!flow) return;
    if (completed) {
      if (!event || !flow) return;
      setSaving(true);
      try {
        const fresh = await api<GuideArchive>(`/guide-events/${event.id}/flows`, { method: "POST", body: { flow_id: flow.id } });
        setArchive(fresh); setCompleted(false); setProgress({ step: 0, guide: 0 });
        navigate(`/flows/${id}/guide?archive=${fresh.id}`, { replace: true });
      } catch (err) { setError(err instanceof Error ? err.message : "重新开始失败"); }
      finally { setSaving(false); }
      return;
    }
    if (!isLastGuideInStep) {
      go({ step: safeStep, guide: safeGuide + 1 });
      return;
    }
    if (!isLastStep) {
      go({ step: safeStep + 1, guide: 0 });
      return;
    }
    setCompleted(true);
    void save({ step: safeStep, guide: safeGuide }, "completed");
  }

  /** 仅允许跳到已完成环节或当前环节（从该环节第一条指引开始） */
  function jumpToStep(stepIndex: number) {
    if (stepIndex > safeStep) return;
    go({ step: stepIndex, guide: 0 });
  }

  const nextLabel = completed
    ? "重新开始本流程 →"
    : isLastOverall
    ? "确认完成本轮办理"
    : isLastGuideInStep
      ? "完成本环节，进入下一环节 →"
      : "完成本条，下一条指引 →";

  const prevLabel = safeGuide > 0 ? "← 上一条指引" : "← 上一环节";

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title={flow ? `${flow.name} · 带我办理` : "带我办理"}
      subtitle="按操作指引逐条办理：完成当前环节的全部指引后，再进入下一环节。"
      backTo={id ? `/flows/${id}` : "/"}
      backLabel="返回全流程"
      actions={<><Link to="/my-guides" className="btn-ghost">我的办理</Link>{id && <Link to={`/flows/${id}`} className="btn-ghost">查看全流程</Link>}</>}
      compact
    >
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {flow && step && (
        <div className="mx-auto max-w-4xl">
          <section className="panel overflow-hidden p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-csg-600">
                  <span>本次引导进度</span>
                  <span className={(completed ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-csg-50 text-csg-700 ring-csg-200") + " rounded-full px-2 py-0.5 text-[10px] ring-1"}>
                    {completed ? "本轮已完成" : archive ? "已自动存档" : "尚未产生存档"}
                  </span>
                </div>
                {event && <div className="mt-1 flex flex-wrap items-center gap-2"><input aria-label="办理存档名称" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="focus-csg min-w-64 rounded-md border border-csg-100 bg-white px-2 py-1 text-xs font-medium text-csg-800"/><span className="mono text-[10px] text-slate-400">{event.event_key}</span>{titleDraft.trim() !== event.title && <span className="text-[10px] text-amber-600">名称尚未保存</span>}</div>}
                <div className="mt-0.5 text-xs text-slate-500">
                  第 {safeStep + 1} / {flow.steps.length} 环节
                  {hasRealGuides ? (
                    <> · 本环节指引 {safeGuide + 1}/{slotsInStep}</>
                  ) : (
                    <> · 本环节暂无分条指引</>
                  )}
                  <span className="text-slate-400"> · 仅代表指引阅读位置</span>
                  {archive && <span className="text-slate-400"> · 保存于 {new Date(archive.updated_at).toLocaleString("zh-CN", { hour12: false })}</span>}
                </div>
              </div>
              <div className="mono text-xl font-bold text-csg-700">{percent}%</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-csg-50 ring-1 ring-csg-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-csg-700 via-csg-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
              {flow.steps.map((item, itemIndex) => {
                const reached = itemIndex <= safeStep;
                const active = itemIndex === safeStep;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={reached ? item.name : "请先完成本环节全部操作指引"}
                    disabled={!reached}
                    onClick={() => jumpToStep(itemIndex)}
                    className={
                      (active
                        ? "bg-csg-600 text-white"
                        : itemIndex < safeStep
                          ? "bg-csg-100 text-csg-700"
                          : "cursor-not-allowed bg-slate-100 text-slate-300") +
                      " mono h-7 min-w-9 rounded-md px-2 text-[10px] font-semibold transition disabled:opacity-100"
                    }
                  >
                    {item.code}
                  </button>
                );
              })}
            </div>
            {hasRealGuides && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="mr-1 text-[11px] text-slate-400">本环节</span>
                {step.guide.map((_, gi) => (
                  <span
                    key={gi}
                    className={
                      (gi === safeGuide
                        ? "bg-csg-600"
                        : gi < safeGuide
                          ? "bg-csg-300"
                          : "bg-slate-200") + " h-1.5 w-5 rounded-full transition-colors"
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="panel mt-3 overflow-hidden">
            <div className="border-b border-csg-100 bg-gradient-to-r from-csg-50 via-white to-cyan-50 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="mono grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-csg-600 text-xs font-bold text-white shadow-md">
                  {step.code}
                </span>
                <div>
                  <div className="text-xs font-medium text-csg-600">
                    当前环节 · {hasRealGuides ? `操作指引 ${safeGuide + 1}/${slotsInStep}` : "查看环节说明后继续"}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">{step.name}</h2>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div>
              <div className="rounded-lg border border-csg-100 bg-csg-50/60 p-3">
                <div className="text-xs font-semibold text-csg-700">本环节要做什么</div>
                <p className="mt-1 text-sm leading-5 text-slate-700">
                  {step.task || "请按照下方操作指引完成本环节。"}
                </p>
              </div>

              {guideSystems.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>本环节涉及系统</span>
                  {guideSystems.map((system) => (
                    <span
                      key={system}
                      className="rounded-full bg-white px-2.5 py-1 font-medium text-csg-700 ring-1 ring-csg-200"
                    >
                      {system}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2.5 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                <span className="shrink-0 font-bold">提示</span>
                <span>本系统仅提供操作指导，不记录或认定其他业务系统中的实际办理结果。</span>
              </div>
                </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {hasRealGuides ? "请完成本条操作指引" : "操作指引"}
                  </div>
                  {hasRealGuides && (
                    <div className="text-xs text-slate-400">
                      完成全部 {slotsInStep} 条后进入下一环节
                    </div>
                  )}
                </div>
                <GuideList
                  guide={currentGuide}
                  numberFrom={hasRealGuides ? safeGuide + 1 : undefined}
                  emptyHint="本环节暂无系统操作指引。确认环节说明后，可进入下一环节。"
                  compact
                />
              </div>
              </div>
            </div>
          </section>

          <div className="sticky bottom-2 mt-3 flex items-center justify-between gap-3 rounded-xl border border-csg-100 bg-white/95 p-2.5 shadow-[0_12px_30px_rgba(0,71,133,0.15)] backdrop-blur">
            <button type="button" className="btn-ghost" disabled={isFirst} onClick={goPrev}>
              {prevLabel}
            </button>
            <button type="button" className="btn-ghost px-2.5 text-xs" disabled={saving || !event || !titleDraft.trim()} onClick={() => void manualSave()}>{saveNotice ? "✓ 已保存" : "保存进度"}</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={goNext}>
              {saving ? "正在保存…" : nextLabel}
            </button>
          </div>
        </div>
      )}
      {namingOpen && flow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4">
          <div className="panel w-full max-w-md p-5">
            <div className="text-xs font-semibold text-csg-600">建立办理存档</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">先给本次办理起个名称</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">名称用于区分同一流程的不同事项，后续可以随时修改。</p>
            <div className="mt-4 space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-slate-500">办理存档名称</label><input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium text-slate-500">关联工单号（选填）</label><input value={externalRefDraft} onChange={(e) => setExternalRefDraft(e.target.value)} className="focus-csg w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => navigate(id ? `/flows/${id}` : "/")}>取消</button><button className="btn-primary" disabled={saving || !titleDraft.trim()} onClick={() => void createNamedArchive()}>{saving ? "正在创建…" : "保存并开始办理"}</button></div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
