from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import get_current_user
from app.models.user import User
from app.services.storage import upload_bytes

router = APIRouter()

MAX_SIZE = 20 * 1024 * 1024  # 20 MB

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "video/mp4",
    "video/webm",
    "text/plain",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    data = await file.read()

    if len(data) > MAX_SIZE:
        raise HTTPException(413, "File too large (max 20 MB)")

    ct = file.content_type or "application/octet-stream"
    if ct not in ALLOWED_TYPES:
        raise HTTPException(415, f"File type '{ct}' is not allowed")

    raw_name = file.filename or "file"
    ext = raw_name.rsplit(".", 1)[-1].lower() if "." in raw_name else "bin"

    url = upload_bytes(data, ct, ext)
    return {"url": url, "filename": raw_name}
