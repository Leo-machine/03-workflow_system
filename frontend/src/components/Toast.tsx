interface Props {
  message: string;
}

/** 全站轻提示：南网蓝白通知卡片。 */
export default function Toast({ message }: Props) {
  return (
    <div className="fixed inset-x-4 bottom-6 z-50 flex justify-center pointer-events-none" role="status">
      <div className="flex max-w-lg items-start gap-3 rounded-xl border border-csg-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_16px_40px_rgba(0,71,133,0.18)]">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-csg-600 text-[11px] font-bold text-white">✓</span>
        <span className="leading-5">{message}</span>
      </div>
    </div>
  );
}
