from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

from app.routers import onboarding


def test_first_run_completion_and_reset_survive_new_client(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'onboarding.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(onboarding, "engine", engine)
    app = FastAPI()
    app.include_router(onboarding.router, prefix="/api/onboarding")

    with TestClient(app) as client:
        assert client.get("/api/onboarding/state").json() == {
            "completed": False, "completed_at": None
        }
        response = client.post("/api/onboarding/complete")
        assert response.status_code == 200
        assert response.json()["completed"] is True
        assert response.json()["completed_at"] is not None
        assert client.post("/api/onboarding/complete").status_code == 200

    with TestClient(app) as client:
        assert client.get("/api/onboarding/state").json()["completed"] is True
        response = client.post("/api/onboarding/reset")
        assert response.status_code == 200
        assert response.json() == {"completed": False, "completed_at": None}
        assert client.get("/api/onboarding/state").json() == response.json()
    engine.dispose()
