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
    <div className="flex items-stretch overflow-x-auto pb-2">
      {steps.map((st, i) => {
        const isSel = i === selected;
        const energized = i <= selected;
        const parallel = st.persons.length > 1;
        const firstPerson = st.persons[0] ?? null;
        return (
          <Fragment key={st.id}>
            {i > 0 && (
              <div className="flex items-center px-1 sm:px-2 pt-5">
                <div
                  className={
                    "h-0.5 w-7 sm:w-12 rounded-full " +
                    (energized ? "bg-csg-500" : "bg-slate-200")
                  }
                />
              </div>
            )}
            <button onClick={() => onSelect(i)} className="flex flex-col items-center min-w-[100px] group">
              <div
                className={
                  "mono relative grid place-items-center h-11 w-11 rounded-full text-xs font-semibold transition " +
                  (isSel
                    ? "bg-csg-600 text-white ring-4 ring-csg-100"
                    : "bg-white text-slate-500 ring-2 ring-slate-200 group-hover:ring-csg-300")
                }
              >
                {st.code}
                {parallel && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 text-white text-[10px] grid place-items-center">
                    {st.persons.length}
                  </span>
                )}
              </div>
              <div
                className={
                  "mt-2 text-xs font-medium text-center max-w-[100px] " +
                  (isSel ? "text-slate-900" : "text-slate-500")
                }
              >
                {st.name}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 text-center">
                {parallel ? `并行 ${st.persons.length} 人` : firstPerson?.name ?? "未设人"}
              </div>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
