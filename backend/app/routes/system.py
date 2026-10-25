"""Health, newsletter and PDF-export endpoints."""

from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import __version__
from ..config import (
    ALLOW_REGISTRATION,
    PUBLISH_MODELS_TO_HUB,
    REQUIRE_AUTH,
    STORAGE_PATH,
)
from ..cubes.registry import registry
from ..db import get_db
from ..logging_config import get_logger
from ..models import NewsletterSubscriber
from ..schemas import (
    HealthResponse,
    NewsletterRequest,
    NewsletterResponse,
    PDFRequest,
)

logger = get_logger(__name__)

router = APIRouter(tags=["System"])


@router.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"status": "ok", "service": "reflex-cube-api", "version": __version__}


@router.get("/api/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    """Liveness and dependency check used by Docker and uptime monitors."""
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:
        logger.warning("Health check: database unreachable: %s", exc)
        database = f"error: {exc}"

    return HealthResponse(
        status="ok" if database == "ok" else "degraded",
        version=__version__,
        database=database,
        cubes=len(registry.list_cubes()),
        storage_path=STORAGE_PATH,
        auth_required=REQUIRE_AUTH,
        registration_open=ALLOW_REGISTRATION,
        # Clients use this to explain why the studio is unavailable instead of
        # letting a user queue a job that is certain to fail.
        training_available=_training_available(),
        model_publishing=PUBLISH_MODELS_TO_HUB,
    )


def _training_available() -> bool:
    """True if the ML stack needed to fine-tune is importable."""
    from importlib.util import find_spec

    return all(find_spec(name) is not None for name in ("torch", "transformers", "datasets"))


@router.post("/api/newsletter/subscribe", response_model=NewsletterResponse)
def subscribe_newsletter(
    req: NewsletterRequest, db: Session = Depends(get_db)
) -> NewsletterResponse:
    """Record a newsletter signup. Re-subscribing is a no-op."""
    email = req.email.lower()
    existing = db.get(NewsletterSubscriber, email)
    if existing is not None:
        return NewsletterResponse(status="already_subscribed", email=email)

    db.add(NewsletterSubscriber(email=email))
    db.commit()
    return NewsletterResponse(status="subscribed", email=email)


_PDF_STYLES = """
@page {
    size: a4 portrait;
    @frame header_frame { -pdf-frame-content: header_content;
        left: 50pt; width: 512pt; top: 50pt; height: 40pt; }
    @frame content_frame { left: 50pt; width: 512pt; top: 90pt; height: 632pt; }
}
body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt;
       color: #222222; line-height: 1.5; }
h1 { color: #111111; font-size: 24pt; border-bottom: 1px solid #dddddd; padding-bottom: 5px; }
h2 { color: #333333; font-size: 18pt; margin-top: 20px; }
h3 { color: #444444; font-size: 14pt; }
p { margin-bottom: 10px; }
code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px;
       font-family: Courier, monospace; font-size: 10pt; }
pre { background-color: #f4f4f4; padding: 10px; border-radius: 4px;
      font-family: Courier, monospace; font-size: 9pt; white-space: pre-wrap; }
blockquote { border-left: 4px solid #dddddd; padding-left: 10px;
             color: #555555; font-style: italic; }
ul, ol { margin-bottom: 10px; padding-left: 20px; }
li { margin-bottom: 5px; }
.title { font-size: 28pt; font-weight: bold; text-align: center;
         margin-bottom: 30px; color: #000; }
.page-header { font-size: 10pt; color: #888888;
               border-bottom: 1px solid #eeeeee; padding-bottom: 5px; }
"""


@router.post("/api/cubes/pdf")
def generate_pdf(req: PDFRequest) -> StreamingResponse:
    """Render markdown (typically a cube report) to a downloadable PDF."""
    try:
        import markdown as markdown_lib
        from xhtml2pdf import pisa
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="PDF export needs the 'markdown' and 'xhtml2pdf' packages.",
        ) from exc

    from html import escape

    html_content = markdown_lib.markdown(req.markdown, extensions=["fenced_code", "tables"])
    # The title is user input and is interpolated into the template, so escape it.
    safe_title = escape(req.title)

    full_html = f"""<html>
<head><style>{_PDF_STYLES}</style></head>
<body>
    <div id="header_content">
        <div class="page-header">ReflexCube Autonomous Engine — {safe_title}</div>
    </div>
    <div class="title">{safe_title}</div>
    {html_content}
</body>
</html>"""

    buffer = BytesIO()
    status = pisa.CreatePDF(BytesIO(full_html.encode("utf-8")), dest=buffer)
    if status.err:
        raise HTTPException(status_code=500, detail="Failed to generate PDF")

    buffer.seek(0)
    filename = (
        "".join(char if char.isalnum() or char in "-_" else "_" for char in req.title)[:80]
        or "report"
    )
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
