from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cors import allowed_origins
from app.database import init_db
from app.health import router as health_router
from app.routers.employees import router as employees_router
from app.routers.payslips import router as payslips_router
from app.routers.previred import router as previred_router
from app.routers.vacations import router as vacations_router

app = FastAPI(
    title="PymeOS API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(employees_router, prefix="/api/employees", tags=["employees"])
app.include_router(payslips_router, prefix="/api/payslips", tags=["payslips"])
app.include_router(vacations_router, prefix="/api/vacations", tags=["vacations"])
app.include_router(previred_router, prefix="/api/previred", tags=["previred"])


@app.on_event("startup")
def on_startup() -> None:
    from app import models as _models  # noqa: F401

    init_db()
