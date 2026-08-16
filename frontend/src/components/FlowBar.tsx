import { Fragment } from "react";
import type { Step } from "../types";

interface Props {
  steps: Step[];
  selected: number;
  onSelect: (index: number) => void;
}

/** 顶部流程线：环节节点 + 连接线；多人（并行）环节带角标 */
export default function FlowBar({ steps, selected, onSelect }: Props) {
  return (
    <div className="flex items-stretch overflow-x-auto px-1 pb-2 pt-1">
      {steps.map((st, i) => {
        const isSel = i === selected;
        const energized = i <= selected;
        const parallel = st.persons.length > 1;
        const firstPerson = st.persons[0] ?? null;
        return (
          <Fragment key={st.id}>
            {i > 0 && (
              <div className="flex items-center px-1 pt-5 sm:px-2">
                <div
                  className={
                    "h-[3px] w-7 rounded-full sm:w-12 " +
                    (energized
                      ? "bg-gradient-to-r from-csg-400 to-cyan-500 shadow-[0_0_8px_rgba(7,152,141,0.35)]"
                      : "bg-slate-200")
                  }
                />
              </div>
            )}
            <button onClick={() => onSelect(i)} className="group flex min-w-[100px] flex-col items-center">
              <div
                className={
                  "mono relative grid h-11 w-11 place-items-center rounded-xl text-xs font-bold transition " +
                  (isSel
                    ? "rotate-45 bg-gradient-to-br from-csg-500 to-cyan-700 text-white shadow-[0_8px_22px_rgba(0,122,114,0.28)] ring-4 ring-csg-100"
                    : "rotate-45 bg-white text-slate-500 ring-1 ring-slate-200 group-hover:bg-csg-50 group-hover:ring-csg-300")
                }
              >
                <span className="-rotate-45">{st.code}</span>
                {parallel && (
                  <span className="absolute -right-2 -top-2 grid h-4 w-4 -rotate-45 place-items-center rounded-full bg-amber-400 text-[10px] text-white shadow-sm">
                    {st.persons.length}
                  </span>
                )}
              </div>
              <div
                className={
                  "mt-3 max-w-[100px] text-center text-xs font-semibold " +
                  (isSel ? "text-csg-800" : "text-slate-500")
                }
              >
                {st.name}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 text-center">
                {parallel ? `责任 ${st.persons.length} 人` : firstPerson ? `责任 ${firstPerson.name}` : "未设责任人"}
              </div>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
