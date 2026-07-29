import { useEffect } from "react";

/**
 * 页面重新获得焦点/恢复可见时重新拉取数据。
 * 场景：管理员在别的页面（或别的标签页）改了流程/岗位/发布状态，
 * 本页面还开着 —— 回到前台即为最新，不用手动刷新。
 *
 * focus 与 visibilitychange 可能几乎同时触发，短防抖合并为一次拉取。
 */
export function useRefetchOnFocus(refetch: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refetch();
      }, 100);
    };
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [refetch]);
}
