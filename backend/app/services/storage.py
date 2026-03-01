from __future__ import annotations

import io
import json
import os
import uuid

from minio import Minio

ENDPOINT   = os.getenv("MINIO_ENDPOINT", "minio:9000")
ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
BUCKET     = os.getenv("MINIO_BUCKET", "eduwise")
PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")


def get_client() -> Minio:
    return Minio(ENDPOINT, access_key=ACCESS_KEY, secret_key=SECRET_KEY, secure=False)


def ensure_bucket() -> None:
    """Create bucket with public-read policy if it doesn't exist. Called once at startup."""
    c = get_client()
    if not c.bucket_exists(BUCKET):
        c.make_bucket(BUCKET)

    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{BUCKET}/*"],
        }],
    })
    c.set_bucket_policy(BUCKET, policy)


def upload_bytes(data: bytes, content_type: str, ext: str) -> str:
    """Upload raw bytes to MinIO. Returns a public URL."""
    c = get_client()
    object_name = f"{uuid.uuid4().hex}.{ext}"
    c.put_object(
        BUCKET,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"
