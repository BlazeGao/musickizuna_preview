# COS TTS setup

## Runtime configuration

Copy the variable names from `.env.example` into the server's environment. Keep
all secret values outside Git. The Redis connection uses the same
`REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` variables as otterback UAT,
while `TTS_REDIS_DB=2` isolates this application's locks.

## One-time bucket initialization

Temporarily grant the initialization identity the policy in
`cos-init-cam-policy.json`, then inspect and apply the merged configuration:

```powershell
python server/init_cos_bucket.py
python server/init_cos_bucket.py --apply
```

The script preserves rules it does not own. It manages:

- deletion of `tts/cache/v2/` objects 30 days after their last modification;
- cleanup of incomplete multipart uploads after one day;
- cleanup of noncurrent versions and expired delete markers when versioning is
  enabled or suspended;
- browser download CORS for localhost and `https://musickizuna.net`.

After initialization succeeds, remove the temporary bucket-configuration
permissions from the application's runtime identity.

## Nginx

Serve the frontend and proxy `/api/` to the single Flask/Gunicorn instance:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
