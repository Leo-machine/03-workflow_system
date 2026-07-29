#!/bin/sh
set -e

echo "[entrypoint] 1/3 alembic upgrade head"
alembic upgrade head

echo "[entrypoint] 2/3 python -m app.seed（幂等）"
python -m app.seed

echo "[entrypoint] 3/3 uvicorn 0.0.0.0:8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
