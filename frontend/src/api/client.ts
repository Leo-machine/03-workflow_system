// TODO(4A/SSO): token 存 localStorage 存在 XSS 泄露风险；
// 接内网 4A/SSO 时改为 httpOnly cookie 或直接走 SSO 票据机制。
const TOKEN_KEY = "flowmap_token";
export const AUTH_EXPIRED_EVENT = "flowmap:auth-expired";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = options.token === undefined ? getToken() : options.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(401, "未登录或登录已过期");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data: unknown = await res.json();
      if (typeof data === "object" && data !== null && "detail" in data) {
        const d = (data as { detail: unknown }).detail;
        detail = typeof d === "string" ? d : JSON.stringify(d);
      }
    } catch {
      // 保留 statusText
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function readError(res: Response, fallback: string): Promise<ApiError> {
  let detail = fallback || res.statusText;
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      detail = typeof d === "string" ? d : JSON.stringify(d);
    }
  } catch {
    // keep fallback
  }
  return new ApiError(res.status, detail);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function handleUnauthorized(res: Response): void {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

/** 带鉴权下载文件（模板 CSV 等）。 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  handleUnauthorized(res);
  if (res.status === 401) throw new ApiError(401, "未登录或登录已过期");
  if (!res.ok) throw await readError(res, "下载失败");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** multipart 上传单个 file 字段。 */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api${path}`, { method: "POST", headers: authHeaders(), body });
  handleUnauthorized(res);
  if (res.status === 401) throw new ApiError(401, "未登录或登录已过期");
  if (!res.ok) throw await readError(res, "上传失败");
  return (await res.json()) as T;
}

/** multipart 上传（不设 Content-Type，由浏览器带 boundary） */
export async function uploadImage(file: File): Promise<{ path: string }> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = new FormData();
  body.append("file", file);

  const res = await fetch("/api/uploads/images", { method: "POST", headers, body });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(401, "未登录或登录已过期");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data: unknown = await res.json();
      if (typeof data === "object" && data !== null && "detail" in data) {
        const d = (data as { detail: unknown }).detail;
        detail = typeof d === "string" ? d : JSON.stringify(d);
      }
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as { path: string };
}

/** 使用 Bearer token 读取受保护图片，并返回可供 img/a 使用的临时 blob URL。 */
export async function fetchMediaBlobUrl(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(401, "未登录或登录已过期");
  }
  if (!res.ok) throw new ApiError(res.status, "图片加载失败");
  return URL.createObjectURL(await res.blob());
}
