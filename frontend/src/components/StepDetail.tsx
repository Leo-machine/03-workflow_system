import type { Step } from "../types";

interface Props {
  step: Step;
}

/** 环节详情：做什么、归谁办（人员内嵌在环节中，实时解析台账；联系方式来自人员台账） */
export default function StepDetail({ step }: Props) {
  return (
    <div className="panel mt-5 p-5 sm:p-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="mono text-slate-400">{step.code}</span>
        <span className="text-base font-semibold text-slate-800">{step.name}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.task}</p>

      {/* 责任人（内嵌在环节中；多人 = 并行） */}
      {step.persons.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">本环节暂未设置责任人。</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {step.persons.map((person) => (
            <div key={person.id} className="rounded-xl bg-slate-50 p-3">
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
      )}
    </div>
  );
}
