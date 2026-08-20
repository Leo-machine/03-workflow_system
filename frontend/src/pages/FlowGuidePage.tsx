import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import GuideList from "../components/GuideList";
import PageShell from "../components/PageShell";
import type { FlowDetail, GuideArchive, GuideEvent, GuideResume, Step, User } from "../types";

type Progress = { step: number; guide: number };

/** 无指引的环节仍占 1 个阅读位，便于推进 */
function guideSlots(step: Step): number {
  return Math.max(step.guide.length, 1);
}

function flatOffset(steps: Step[], stepIndex: number, guideIndex: number): number {
  let offset = 0;
  for (let i = 0; i < stepIndex; i++) offset += guideSlots(steps[i]);
  return offset + guideIndex;
}

function totalSlots(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + guideSlots(s), 0);
}

function progressFromArchive(flow: FlowDetail, saved: GuideArchive): { progress: Progress; aligned: boolean } {
  const stepIndex = flow.steps.findIndex((item) => item.id === saved.step_id);
  if (stepIndex < 0) {
    return { progress: { step: 0, guide: 0 }, aligned: false };
  }
  const guideIndex =
    saved.guide_item_id === null
      ? 0
      : flow.steps[stepIndex].guide.findIndex((item) => item.id === saved.guide_item_id);
  return { progress: { step: stepIndex, guide: Math.max(guideIndex, 0) }, aligned: true };
}

function formatResumeTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function FlowGuidePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const archiveParam = searchParams.get("archive");
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [progress, setProgress] = useState<Progress>({ step: 0, guide: 0 });
  const [archive, setArchive] = useState<GuideArchive | null>(null);
  const [event, setEvent] = useState<GuideEvent | null>(null);
  const [resumes, setResumes] = useState<GuideResume[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [externalRefDraft, setExternalRefDraft] = useState("");
  const [namingOpen, setNamingOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [definitionNotice, setDefinitionNotice] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const archiveRef = useRef<GuideArchive | null>(null);
  const stepsRef = useRef<Step[]>([]);
  const latestSave = useRef<{ progress: Progress; status: "in_progress" | "completed" } | null>(null);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    archiveRef.current = archive;
  }, [archive]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const loadedFlow = await api<FlowDetail>(`/flows/${id}`);
      setFlow(loadedFlow);
      if (!archiveParam) {
        const list = await api<GuideResume[]>(`/flows/${id}/guide-resumes`);
        const active = list.filter((item) => item.status === "in_progress");
        setResumes(active);
        const stamp = new Date().toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setTitleDraft(`${loadedFlow.name}－${stamp}`);
        if (active.length > 0) {
          setResumeOpen(true);
          setNamingOpen(false);
        } else {
          setResumeOpen(false);
          setNamingOpen(true);
        }
        return;
      }
      setResumeOpen(false);
      setNamingOpen(false);
      const saved = await api<GuideArchive>(`/guide-archives/${archiveParam}`);
      if (saved.flow_id !== loadedFlow.id) throw new Error("该办理实例不属于当前流程");
      setArchive(saved);
      if (saved.event_id) {
        const loadedEvent = await api<GuideEvent>(`/guide-events/${saved.event_id}`);
        setEvent(loadedEvent);
        setTitleDraft(loadedEvent.title);
        setExternalRefDraft(loadedEvent.external_ref ?? "");
      }
      const resolved = progressFromArchive(loadedFlow, saved);
      setProgress(resolved.progress);
      setDefinitionNotice(!resolved.aligned);
      setCompleted(saved.status === "completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载引导失败");
    }
  }, [archiveParam, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = flow?.steps ?? [];
  stepsRef.current = steps;
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

  async function persist(next: Progress, status: "in_progress" | "completed") {
    const current = archiveRef.current;
    const currentSteps = stepsRef.current;
    if (!current || !currentSteps[next.step]) return;
    const targetStep = currentSteps[next.step];
    const targetGuide = targetStep.guide[next.guide];
    try {
      const saved = await api<GuideArchive>(`/guide-archives/${current.id}`, {
        method: "PUT",
        body: {
          step_id: targetStep.id,
          guide_item_id: targetGuide?.id ?? null,
          status,
        },
      });
      if (archiveRef.current?.id === saved.id) {
        setArchive(saved);
        setError(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "云端存档失败";
      if (message.includes("环节不属于当前流程") || message.includes("操作指引不属于当前环节")) {
        await load();
        setDefinitionNotice(true);
        setError("流程定义已更新，已重新对齐到当前环节。请确认位置后再继续。");
        return;
      }
      setError(`云端存档失败，请保持当前页面并重试保存：${message}`);
    }
  }

  function enqueueSave(next: Progress, status: "in_progress" | "completed") {
    latestSave.current = { progress: next, status };
    saveQueue.current = saveQueue.current
      .then(async () => {
        while (latestSave.current) {
          const target = latestSave.current;
          latestSave.current = null;
          await persist(target.progress, target.status);
        }
      })
      .catch(() => undefined);
    return saveQueue.current;
  }

  async function createNamedArchive() {
    if (!flow || !titleDraft.trim()) return;
    setSaving(true);
    try {
      const createdEvent = await api<GuideEvent>("/guide-events", {
        method: "POST",
        body: { title: titleDraft.trim(), external_ref: externalRefDraft.trim() || null, flow_id: flow.id },
      });
      const createdFlow = createdEvent.flows[0];
      if (!createdFlow) throw new Error("办理事件未能创建流程存档");
      const saved = await api<GuideArchive>(`/guide-archives/${createdFlow.archive_id}`);
      setEvent(createdEvent);
      setArchive(saved);
      setNamingOpen(false);
      setResumeOpen(false);
      setProgress({ step: 0, guide: 0 });
      setCompleted(false);
      navigate(`/flows/${id}/guide?archive=${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建存档失败");
    } finally {
      setSaving(false);
    }
  }

  function continueResume(item: GuideResume) {
    setResumeOpen(false);
    navigate(`/flows/${id}/guide?archive=${item.archive_id}`, { replace: true });
  }

  function startNewFromResume() {
    setResumeOpen(false);
    setNamingOpen(true);
  }

  async function manualSave() {
    if (!event || !titleDraft.trim()) return;
    setSaving(true);
    try {
      const updated = await api<GuideEvent>(`/guide-events/${event.id}`, {
        method: "PATCH",
        body: { title: titleDraft.trim(), external_ref: externalRefDraft.trim() },
      });
      setEvent(updated);
      await enqueueSave({ step: safeStep, guide: safeGuide }, completed ? "completed" : "in_progress");
      setSaveNotice(true);
      window.setTimeout(() => setSaveNotice(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function go(next: Progress) {
    setError(null);
    setCompleted(false);
    setProgress(next);
    void enqueueSave(next, "in_progress");
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
    if (!isLastGuideInStep) {
      go({ step: safeStep, guide: safeGuide + 1 });
      return;
    }
    if (!isLastStep) {
      go({ step: safeStep + 1, guide: 0 });
      return;
    }
    setFinishOpen(true);
  }

  async function confirmFinish() {
    setFinishOpen(false);
    setSaving(true);
    try {
      await enqueueSave({ step: safeStep, guide: safeGuide }, "completed");
      setCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  /** 仅允许跳到已完成环节或当前环节（从该环节第一条指引开始） */
  function jumpToStep(stepIndex: number) {
    if (stepIndex > safeStep) return;
    go({ step: stepIndex, guide: 0 });
  }

  const nextLabel = isLastOverall
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
      backLabel="返回流程地图"
      actions={<><Link to="/my-guides" className="btn-ghost">我的办理</Link>{id && <Link to={`/flows/${id}`} className="btn-ghost">查看全流程</Link>}</>}
      compact
    >
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {definitionNotice && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          流程定义已更新。已按环节编号尽量对齐到当前位置，请确认后再继续办理。
        </div>
      )}

      {flow && step && archive && !completed && (
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

            <div className="px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
                  <div>
                    <div className="text-[11px] font-semibold tracking-wider text-csg-600">本环节办理目标</div>
                    <div className="mt-0.5 text-sm font-medium text-slate-800">
                      {step.task || (hasRealGuides ? "请按下方内容完成本条操作" : "请确认本环节说明")}
                    </div>
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
                  focusMode
                />
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
      {flow && archive && completed && (
        <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-emerald-100 bg-white text-center shadow-[0_20px_55px_rgba(5,150,105,0.12)]">
          <div className="bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-6 py-10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-3xl text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)]">✓</div>
            <div className="mt-5 text-xs font-semibold tracking-[0.18em] text-emerald-700">FLOW COMPLETED</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">本次办理已结束</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">“{flow.name}”的全部操作指引已经确认完成，进度已归档。无需重新浏览流程。</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 px-6 py-5">
            <Link to="/my-guides" className="btn-primary">返回我的办理</Link>
            <Link to={`/flows/${flow.id}`} className="btn-ghost">查看流程地图</Link>
          </div>
        </section>
      )}
      {finishOpen && flow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={() => setFinishOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-csg-100 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.22)]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-csg-50 text-xl text-csg-700 ring-1 ring-csg-100">✓</div>
            <h3 className="mt-4 text-center text-lg font-semibold text-slate-900">确认结束本次办理？</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500">确认后将把“{flow.name}”标记为已完成并归档，不会让您重新浏览流程。</p>
            <div className="mt-5 flex justify-center gap-2"><button type="button" className="btn-ghost" onClick={() => setFinishOpen(false)}>再检查一下</button><button type="button" className="btn-primary" onClick={() => void confirmFinish()}>确认结束</button></div>
          </div>
        </div>
      )}
      {resumeOpen && flow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4">
          <div className="panel w-full max-w-md p-5">
            <div className="text-xs font-semibold text-csg-600">继续办理</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">该流程已有进行中的事项</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              选择继续上次进度，或新建一个独立事项。同一流程可以同时办理多件。
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {resumes.map((item) => (
                <button
                  key={item.archive_id}
                  type="button"
                  onClick={() => continueResume(item)}
                  className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-csg-300 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{item.event_title || "未命名事项"}</span>
                    <span className="shrink-0 rounded-full bg-csg-50 px-2 py-0.5 text-[10px] text-csg-700">继续办理</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.event_key ? `${item.event_key} · ` : ""}
                    {item.external_ref ? `工单 ${item.external_ref} · ` : ""}
                    更新于 {formatResumeTime(item.updated_at)}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => navigate(id ? `/flows/${id}` : "/")}>
                取消
              </button>
              <button type="button" className="btn-primary" onClick={startNewFromResume}>
                新建事项
              </button>
            </div>
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
