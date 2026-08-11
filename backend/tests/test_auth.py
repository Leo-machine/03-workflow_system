"""登录与会话：发 token、角色区分、无效凭据/令牌被拒。"""
from tests.conftest import ADMIN, VIEWER, bearer


def test_login_success_admin(client):
    r = client.post("/api/auth/login", json={"username": ADMIN["username"], "password": ADMIN["password"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["username"] == ADMIN["username"]
    assert body["user"]["role"] == "admin"
    assert body["user"]["active"] is True


def test_register_creates_active_viewer_and_rejects_duplicate(client):
    payload = {"username": "new_user", "password": "strong-pass", "display_name": "新用户"}
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    assert response.json()["user"]["role"] == "viewer"
    assert response.json()["user"]["display_name"] == "新用户"
    assert client.post("/api/auth/register", json=payload).status_code == 409


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
