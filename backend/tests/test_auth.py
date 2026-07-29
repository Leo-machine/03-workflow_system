"""登录与会话：发 token、角色区分、无效凭据/令牌被拒。"""
from tests.conftest import ADMIN, VIEWER, bearer


def test_login_success_admin(client):
    r = client.post("/api/auth/login", json={"username": ADMIN["username"], "password": ADMIN["password"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"] == {"username": ADMIN["username"], "role": "admin"}


def test_login_success_viewer(client):
    r = client.post("/api/auth/login", json={"username": VIEWER["username"], "password": VIEWER["password"]})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "viewer"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": ADMIN["username"], "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert r.status_code == 401


def test_me_returns_current_user(client, admin_token):
    r = client.get("/api/auth/me", headers=bearer(admin_token))
    assert r.status_code == 200
    assert r.json()["username"] == ADMIN["username"]
    assert r.json()["role"] == "admin"


def test_me_rejects_no_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_bad_token(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401
