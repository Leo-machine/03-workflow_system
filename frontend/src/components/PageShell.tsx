import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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
}

/** 全站统一顶栏：白底 + 南网蓝品牌条 */
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
}: Props) {
  const isAdmin = user.role === "admin";

  return (
    <div className="page-canvas">
      <div className={"mx-auto px-4 py-6 sm:px-6 " + (wide ? "max-w-6xl" : "max-w-5xl")}>
        <header className="panel overflow-hidden">
          <div className="h-1.5 bg-csg-600" />
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {backTo && (
                <Link to={backTo} className="text-xs font-medium text-csg-600 hover:text-csg-800">
                  ← {backLabel}
                </Link>
              )}
              <div className={"flex items-center gap-2 " + (backTo ? "mt-2" : "")}>
                <span className="inline-block h-5 w-1.5 rounded-sm bg-csg-600" />
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  {title}
                </h1>
              </div>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 页面操作区（流程设计器/管理模式等业务动作） */}
              {actions}
              {actions && <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />}
              {/* 用户会话区：独立胶囊，与操作区隔开 */}
              <div className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pl-1 pr-2.5 ring-1 ring-slate-200">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-csg-600 text-xs font-semibold text-white">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs text-slate-500">
                  {user.username} · {isAdmin ? "管理员" : "只读"}
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
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
