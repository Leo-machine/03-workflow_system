import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { User } from "../types";

/**
 * 管理端路由集中守卫：非 admin 一律回首页。
 * UI 层隔离 + 服务端 require_admin 最终防线，两层缺一不可；
 * 新增管理页面时只需包一层本组件，不再各自判 isAdmin。
 */
export default function RequireAdmin({ user, children }: { user: User; children: ReactNode }) {
  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
