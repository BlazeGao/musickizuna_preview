import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosServiceError


@dataclass(frozen=True)
class TTSStorageConfig:
    region: str
    bucket: str
    secret_id: str
    secret_key: str
    session_token: str | None
    prefix: str
    signed_url_ttl_seconds: int

    @classmethod
    def from_env(cls):
        return cls(
            region=os.environ.get('COS_REGION', 'ap-guangzhou'),
            bucket=os.environ.get('COS_BUCKET', 'muzuna2-1302603299'),
            secret_id=os.environ.get('COS_SECRET_ID', ''),
            secret_key=os.environ.get('COS_SECRET_KEY', ''),
            session_token=os.environ.get('COS_SESSION_TOKEN') or None,
            prefix=os.environ.get('COS_TTS_PREFIX', 'tts/cache/v2').strip('/'),
            signed_url_ttl_seconds=int(os.environ.get('COS_SIGNED_URL_TTL_SECONDS', '600')),
        )

    def validate(self):
        missing = [
            name
            for name, value in (
                ('COS_SECRET_ID', self.secret_id),
                ('COS_SECRET_KEY', self.secret_key),
                ('COS_REGION', self.region),
                ('COS_BUCKET', self.bucket),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f'Missing COS configuration: {", ".join(missing)}')


class CosTTSStorage:
    def __init__(self, config: TTSStorageConfig):
        config.validate()
        self.config = config
        cos_config = CosConfig(
            Region=config.region,
            SecretId=config.secret_id,
            SecretKey=config.secret_key,
            Token=config.session_token,
            Scheme='https',
        )
        self.client = CosS3Client(cos_config)

    def make_object_key(self, *, text: str, lang: str, model: str, voice: str) -> str:
        material = '\n'.join(('v2', model, lang, voice, 'wav', text))
        digest = hashlib.sha256(material.encode('utf-8')).hexdigest()
        return f'{self.config.prefix}/{lang}/{digest[:2]}/{digest}.wav'

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.config.bucket, Key=key)
            return True
        except CosServiceError as exc:
            if exc.get_status_code() == 404:
                return False
            raise

    def upload_wav(self, key: str, audio: bytes):
        self.client.put_object(
            Bucket=self.config.bucket,
            Key=key,
            Body=audio,
            ContentType='audio/wav',
            CacheControl='private, max-age=2592000',
            ContentDisposition='inline',
        )

    def signed_download(self, key: str) -> tuple[str, str]:
        ttl = self.config.signed_url_ttl_seconds
        url = self.client.get_presigned_url(
            Method='GET',
            Bucket=self.config.bucket,
            Key=key,
            Expired=ttl,
        )
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        return url, expires_at.isoformat().replace('+00:00', 'Z')
