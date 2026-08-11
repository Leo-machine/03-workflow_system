from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, change_logs, domains, flows, guide_archives, guide_events, persons, units, uploads, users

app = FastAPI(title="数智运营中心平台运维团队平台组业务服务系统 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 统一挂在 /api 下：开发走 vite proxy，生产走 nginx 反代，路径一致不用改写
app.include_router(auth.router, prefix="/api")
app.include_router(domains.router, prefix="/api")
app.include_router(flows.router, prefix="/api")
app.include_router(guide_archives.router, prefix="/api")
app.include_router(guide_events.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(units.router, prefix="/api")
app.include_router(persons.router, prefix="/api")
app.include_router(change_logs.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}
