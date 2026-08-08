import GuideList from "./GuideList";
import type { Step } from "../types";

interface Props {
  step: Step;
}

/** 操作指南：环节说明 + 系统操作指引（含责任团队/人与图示） */
export default function StepDetail({ step }: Props) {
  const guideHasAssignees = step.guide.some((g) => g.persons.length > 0 || g.unit);
  // 旧数据：责任人仅挂在环节上、尚未迁入指引时，仍在地图展示，避免“流程条有人、下方没有”
  const showLegacyPersons = !guideHasAssignees && step.persons.length > 0;

  return (
    <div className="panel mt-5 overflow-hidden p-0 sm:p-0">
      <div className="border-b border-csg-100 bg-gradient-to-r from-csg-50 via-white to-amber-50 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="inline-block h-5 w-1.5 rounded-sm bg-csg-600" />
          <h2 className="text-lg font-bold tracking-wide text-csg-900 sm:text-xl">操作指南</h2>
          <span className="rounded-md bg-csg-600/10 px-2 py-0.5 text-xs font-semibold text-csg-800 ring-1 ring-csg-200">
            请按本环节完成
          </span>
        </div>
        <p className="mt-1.5 text-sm font-medium text-slate-600">
          归谁办 · 做什么、交什么 · 对照图示 · 在哪些系统怎么操作（附带链接）
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-csg-700">
            {step.code}
          </span>
          <span className="text-lg font-bold text-slate-900">{step.name}</span>
        </div>
        {step.task && (
          <p className="mt-2 text-base leading-relaxed text-slate-700">{step.task}</p>
        )}

        {showLegacyPersons && (
          <div className="mt-4">
            <div className="text-xs font-medium text-slate-500">责任人</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {step.persons.map((person) => (
                <div key={person.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <div className="text-xs text-slate-400">{person.unit?.name ?? "未设单位"}</div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-csg-50 text-sm font-semibold text-csg-700 ring-1 ring-csg-200">
                      {person.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{person.name}</div>
                      <div className="text-xs text-slate-500">
                        {person.title ? `${person.title} · ` : ""}
                        {person.contact ?? "未留联系方式"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="text-sm font-semibold text-slate-800">系统操作指引</div>
          <GuideList guide={step.guide} />
        </div>
      </div>
    </div>
  );
}
