# 数智运营中心平台运维团队平台组业务服务系统（流程办事地图）

把散落在 Word 里的工程流程做成"活的办事地图"：每个环节回答 **归谁办 / 做什么交什么 / 在哪些系统怎么操作**。
人和流程都是数据不是文档 —— 管理员改一次，所有人看到的都是最新，且全部修改留痕。

## 一键启动（验收路径）

```bash
cp .env.example .env        # 按需修改密码、JWT_SECRET，以及端口（见下方）
docker compose up --build
```

默认对外端口（可在 `.env` 中修改，避免与本机其他系统冲突）：

| 服务 | 环境变量 | 默认 |
|------|----------|------|
| 前端 | `WEB_PORT` | **8081** → http://localhost:8081 |
| 后端 | `BACKEND_PORT` | **8001** → http://localhost:8001/docs |
| Postgres | `POSTGRES_PORT` | **5433** |

- 打开 http://localhost:8081 （前端，nginx 反代 /api 到后端）
- 后端 API 文档：http://localhost:8001/docs
- 初始账号：`admin / admin123`（管理员，可进管理模式改人）、`viewer / viewer123`（只读）
- 首次启动后端自动执行 `alembic upgrade head` 建表 + `python -m app.seed` 灌入初始数据；检测到已有账号后永久跳过业务种子，管理员删除的业务域或流程不会因重启恢复

## 本地开发

### 后端

```bash
cd backend
python3.11+ -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env

# 测试：快速组（SQLite 内存库，无需 Docker）
pytest -m "not pg"

# 测试：PG 集成组（testcontainers 起真实 Postgres，需 Docker 运行）
pytest -m pg

# 起服务（默认连 localhost:5433 的 PG——与 docker-compose 宿主机映射一致；可用 DATABASE_URL 覆盖）
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload --port 8001
```

### 前端

```bash
cd frontend
npm ci          # 或首次 npm install 生成 lock
npm run dev     # vite dev，默认 5174；/api 代理到 localhost:8001
npm run build   # tsc 类型检查 + 自包含产物（无外部 CDN/字体）
```

## 结构

- `docs/prototype.jsx` —— 界面与种子数据的参照原型
- `docs/records/` —— 阶段方案与交付记录（txt 留档）
- `backend/` —— FastAPI + SQLAlchemy 2.0 + Alembic（迁移只管 schema，种子走 seed.py）
- `frontend/` —— React + Vite + TypeScript + Tailwind（本地 PostCSS 构建）

## 权限与留痕

- 两档账号：`viewer` 只读；`admin` 可在流程设计器维护流程定义（draft 态）、发布/下线流程，并查看变更记录
- 岗位→人映射以数据库为准（seed 灌入；后续调整直接改库，不留在线编辑入口）
- 流程类变更（创建/改名/说明/状态/定义/删除）写入 change_log；无变化的保存按 no-op 跳过不写日志
- `change_logs` 为 append-only，只插不改不删

## 已知待办（M1 不实现，代码内 TODO）

- 接内网 4A/SSO：替换 `backend/app/deps.py` 的 `get_current_user`；token 从 localStorage 迁到 httpOnly cookie 或 SSO 机制（防 XSS 泄露）
- 迁内网前改掉 `.env` 里所有默认密码与 `JWT_SECRET`
