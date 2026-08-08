import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import GuideList from "../components/GuideList";
import PageShell from "../components/PageShell";
import type { FlowDetail, Step, User } from "../types";

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
  const storageKey = `flowmap-guide-progress:${id ?? "unknown"}`;
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress(storageKey));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setFlow(await api<FlowDetail>(`/flows/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载引导失败");
    }
  }, [id]);

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

  function go(next: Progress) {
    setProgress(next);
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

  function goNext() {
    if (!flow) return;
    if (!isLastGuideInStep) {
      go({ step: safeStep, guide: safeGuide + 1 });
      return;
    }
    if (!isLastStep) {
      go({ step: safeStep + 1, guide: 0 });
      return;
    }
    go({ step: 0, guide: 0 });
  }

  /** 仅允许跳到已完成环节或当前环节（从该环节第一条指引开始） */
  function jumpToStep(stepIndex: number) {
    if (stepIndex > safeStep) return;
    go({ step: stepIndex, guide: 0 });
  }

  const nextLabel = isLastOverall
    ? "完成浏览 · 重新开始"
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
      actions={id ? <Link to={`/flows/${id}`} className="btn-ghost">查看全流程</Link> : undefined}
    >
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {flow && step && (
        <div className="mx-auto max-w-3xl">
          <section className="panel overflow-hidden p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wider text-csg-600">本次引导进度</div>
                <div className="mt-1 text-sm text-slate-500">
                  第 {safeStep + 1} / {flow.steps.length} 环节
                  {hasRealGuides ? (
                    <> · 本环节指引 {safeGuide + 1}/{slotsInStep}</>
                  ) : (
                    <> · 本环节暂无分条指引</>
                  )}
                  <span className="text-slate-400"> · 仅代表指引阅读位置</span>
                </div>
              </div>
              <div className="mono text-2xl font-bold text-csg-700">{percent}%</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-csg-50 ring-1 ring-csg-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-csg-700 via-csg-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
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
              <div className="mt-3 flex items-center gap-1.5">
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

          <section className="panel mt-5 overflow-hidden">
            <div className="border-b border-csg-100 bg-gradient-to-r from-csg-50 via-white to-cyan-50 px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="mono grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-csg-600 text-sm font-bold text-white shadow-md">
                  {step.code}
                </span>
                <div>
                  <div className="text-xs font-medium text-csg-600">
                    当前环节 · {hasRealGuides ? `操作指引 ${safeGuide + 1}/${slotsInStep}` : "查看环节说明后继续"}
                  </div>
                  <h2 className="mt-0.5 text-xl font-semibold text-slate-900">{step.name}</h2>
                </div>
              </div>
            </div>

            <div className="px-5 py-6 sm:px-7">
              <div className="rounded-xl border border-csg-100 bg-csg-50/60 p-4">
                <div className="text-xs font-semibold text-csg-700">本环节要做什么</div>
                <p className="mt-1.5 text-base leading-7 text-slate-700">
                  {step.task || "请按照下方操作指引完成本环节。"}
                </p>
              </div>

              {guideSystems.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
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

              <div className="mt-5">
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
                />
              </div>

              <div className="mt-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                <span className="font-bold">提示</span>
                <span>本系统仅提供操作指导，不记录或认定其他业务系统中的实际办理结果。</span>
              </div>
            </div>
          </section>

          <div className="sticky bottom-3 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-csg-100 bg-white/95 p-3 shadow-[0_16px_40px_rgba(0,71,133,0.15)] backdrop-blur">
            <button type="button" className="btn-ghost" disabled={isFirst} onClick={goPrev}>
              {prevLabel}
            </button>
            <span className="hidden text-xs text-slate-400 sm:block">系统已自动记住本次引导位置</span>
            <button type="button" className="btn-primary" onClick={goNext}>
              {nextLabel}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
