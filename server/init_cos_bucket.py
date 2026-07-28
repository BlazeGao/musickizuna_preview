"""One-time, idempotent initialization for the MusicKizuna TTS COS prefix."""

import argparse
import os
import sys

from qcloud_cos.cos_exception import CosServiceError

try:
    from .storage import CosTTSStorage, TTSStorageConfig
except ImportError:
    from storage import CosTTSStorage, TTSStorageConfig


LIFECYCLE_RULE_IDS = {
    'musickizuna-tts-cache-expiration',
    'musickizuna-tts-incomplete-upload-cleanup',
    'musickizuna-tts-expired-marker-cleanup',
}
CORS_RULE_ID = 'musickizuna-tts-browser-download'


def _as_list(value):
    if not value:
        return []
    return value if isinstance(value, list) else [value]


def _read_rules(client, bucket, getter_name, result_key):
    try:
        response = getattr(client, getter_name)(Bucket=bucket)
        return _as_list(response.get(result_key))
    except CosServiceError as exc:
        if exc.get_status_code() == 404:
            return []
        raise


def _replace_managed_rules(existing, managed, managed_ids):
    preserved = [rule for rule in existing if rule.get('ID') not in managed_ids]
    return preserved + managed


def _versioning_status(client, bucket):
    response = client.get_bucket_versioning(Bucket=bucket)
    return response.get('Status', 'Disabled')


def build_lifecycle_rules(prefix, retention_days, versioning_status):
    expiration = {
        'ID': 'musickizuna-tts-cache-expiration',
        'Filter': {'Prefix': prefix},
        'Status': 'Enabled',
        'Expiration': {'Days': retention_days},
    }
    rules = [
        expiration,
        {
            'ID': 'musickizuna-tts-incomplete-upload-cleanup',
            'Filter': {'Prefix': prefix},
            'Status': 'Enabled',
            'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1},
        },
    ]

    if versioning_status in ('Enabled', 'Suspended'):
        expiration['NoncurrentVersionExpiration'] = {'NoncurrentDays': 7}
        rules.append({
            'ID': 'musickizuna-tts-expired-marker-cleanup',
            'Filter': {'Prefix': prefix},
            'Status': 'Enabled',
            'Expiration': {'ExpiredObjectDeleteMarker': 'true'},
        })

    return rules


def build_cors_rule():
    return {
        'ID': CORS_RULE_ID,
        'AllowedOrigin': [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'https://musickizuna.net',
        ],
        'AllowedMethod': ['GET', 'HEAD'],
        'AllowedHeader': ['*'],
        'ExposeHeader': [
            'ETag',
            'Content-Length',
            'Accept-Ranges',
            'Content-Range',
        ],
        'MaxAgeSeconds': 600,
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description='Safely merge MusicKizuna lifecycle and CORS rules into a COS bucket.'
    )
    parser.add_argument(
        '--apply',
        action='store_true',
        help='Write changes. Without this flag the script only prints the proposed result.',
    )
    parser.add_argument(
        '--skip-cors',
        action='store_true',
        help='Only manage lifecycle rules.',
    )
    parser.add_argument(
        '--versioning-status',
        choices=('Enabled', 'Suspended', 'Disabled'),
        help='Use a known bucket versioning status instead of querying it.',
    )
    return parser.parse_args()


def main():
    args = parse_args()
    config = TTSStorageConfig.from_env()
    storage = CosTTSStorage(config)
    client = storage.client
    bucket = config.bucket
    prefix = f'{config.prefix.strip("/")}/'
    retention_days = int(os.environ.get('TTS_COS_RETENTION_DAYS', '30'))
    if retention_days < 1 or retention_days > 3650:
        raise ValueError('TTS_COS_RETENTION_DAYS must be between 1 and 3650')

    versioning_status = (
        args.versioning_status
        if args.versioning_status
        else _versioning_status(client, bucket)
    )
    existing_lifecycle = _read_rules(
        client, bucket, 'get_bucket_lifecycle', 'Rule'
    )
    managed_lifecycle = build_lifecycle_rules(
        prefix, retention_days, versioning_status
    )
    lifecycle_rules = _replace_managed_rules(
        existing_lifecycle, managed_lifecycle, LIFECYCLE_RULE_IDS
    )

    print(f'Bucket: {bucket}')
    print(f'Region: {config.region}')
    print(f'Prefix: {prefix}')
    print(f'Versioning: {versioning_status}')
    print(f'Existing lifecycle rules preserved: {len(lifecycle_rules) - len(managed_lifecycle)}')
    print(f'Managed lifecycle rules: {", ".join(rule["ID"] for rule in managed_lifecycle)}')

    cors_rules = None
    if not args.skip_cors:
        existing_cors = _read_rules(client, bucket, 'get_bucket_cors', 'CORSRule')
        cors_rules = _replace_managed_rules(
            existing_cors, [build_cors_rule()], {CORS_RULE_ID}
        )
        print(f'Existing CORS rules preserved: {len(cors_rules) - 1}')
        print(f'Managed CORS rule: {CORS_RULE_ID}')

    if not args.apply:
        print('Dry run only. Re-run with --apply to write these rules.')
        return 0

    client.put_bucket_lifecycle(
        Bucket=bucket,
        LifecycleConfiguration={'Rule': lifecycle_rules},
    )
    if cors_rules is not None:
        client.put_bucket_cors(
            Bucket=bucket,
            CORSConfiguration={'CORSRule': cors_rules},
        )

    print('COS lifecycle and CORS initialization completed.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except CosServiceError as exc:
        print(
            f'COS request failed: status={exc.get_status_code()} '
            f'code={exc.get_error_code()} message={exc.get_error_msg()}',
            file=sys.stderr,
        )
        sys.exit(1)
