import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { User } from "../types";

interface Props {
  user: User;
  onLogout: () => void;
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  compact?: boolean;
}

/** 全站统一顶栏：白底南网蓝 + 数字化运行状态标识 */
export default function PageShell({
  user,
  onLogout,
  title,
  subtitle,
  backTo,
  backLabel = "返回",
  actions,
  children,
  wide = false,
  compact = false,
}: Props) {
  const isAdmin = user.role === "admin";
  const location = useLocation();
  const navClass = (active: boolean) =>
    "rounded-lg px-3 py-1.5 text-xs font-medium transition " +
    (active ? "bg-csg-600 text-white shadow-sm" : "text-csg-700 hover:bg-csg-50");

  return (
    <div className="page-canvas">
      <div className={"mx-auto px-4 " + (compact ? "py-3 sm:px-6 sm:py-4 " : "py-5 sm:px-6 sm:py-7 ") + (wide ? "max-w-6xl" : "max-w-5xl")}>
        {backTo && (
          <nav className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-csg-100 bg-white/90 p-2 shadow-sm" aria-label="页面导航">
            <Link to={backTo} className="inline-flex items-center gap-2 rounded-lg bg-csg-50 px-3 py-2 text-sm font-semibold text-csg-800 transition hover:bg-csg-100">
              <span aria-hidden="true">←</span>
              {backLabel}
            </Link>
            <div className="flex items-center gap-1">
              <Link to="/" className={navClass(location.pathname === "/")}>业务导航</Link>
              <Link to="/my-guides" className={navClass(location.pathname.startsWith("/my-guides"))}>我的办理</Link>
            </div>
          </nav>
        )}
        <header className="relative overflow-hidden rounded-2xl border border-csg-100 bg-white text-slate-900 shadow-[0_16px_42px_rgba(0,71,133,0.10)]">
          <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full border border-csg-100/70" />
          <div className="pointer-events-none absolute -right-4 -top-12 h-36 w-36 rounded-full border border-csg-200/70" />
          <div className="h-1 bg-gradient-to-r from-csg-700 via-csg-500 to-cyan-400" />
          <div className={"flex flex-wrap items-start justify-between px-5 sm:px-6 " + (compact ? "gap-2 py-3" : "gap-4 py-4 sm:py-5")}>
            <div className="min-w-0">
              <div className={(compact ? "mb-1 " : "mb-2 ") + "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-csg-600"}>
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.65)]" />
                CSG · DIGITAL OPERATIONS
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-5 w-1 rounded-full bg-csg-600 shadow-[0_0_10px_rgba(35,122,185,0.35)]" />
                <h1 className="truncate text-lg font-semibold tracking-wide text-slate-900 sm:text-xl">
                  {title}
                </h1>
              </div>
              {subtitle && <p className={(compact ? "mt-1 text-xs" : "mt-1.5 text-sm") + " text-slate-500"}>{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 页面操作区（流程设计器/管理模式等业务动作） */}
              {actions}
              {actions && <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />}
              {/* 用户会话区：独立胶囊，与操作区隔开 */}
              <div className="flex items-center gap-2 rounded-full bg-csg-50 py-1 pl-1 pr-2.5 ring-1 ring-csg-100">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-csg-600 text-xs font-bold text-white">
                  {(user.display_name || user.username).slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs text-slate-500">
                  {user.display_name || user.username} · {isAdmin ? "管理员" : "普通用户"}
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-xs font-medium text-slate-400 transition hover:text-red-600"
                >
                  退出
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className={compact ? "mt-3" : "mt-5"}>{children}</div>
      </div>
    </div>
  );
}
