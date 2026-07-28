import logging
import os
import threading
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class _LocalKeyedLocks:
    def __init__(self):
        self._guard = threading.Lock()
        self._locks = {}

    @contextmanager
    def acquire(self, key: str):
        with self._guard:
            lock, references = self._locks.get(key, (threading.Lock(), 0))
            self._locks[key] = (lock, references + 1)
        lock.acquire()
        try:
            yield True
        finally:
            lock.release()
            with self._guard:
                current_lock, references = self._locks[key]
                if references == 1:
                    del self._locks[key]
                else:
                    self._locks[key] = (current_lock, references - 1)


class TTSLockManager:
    def __init__(self):
        self._local = _LocalKeyedLocks()
        self._redis = None
        self._redis_checked = False

    def _get_redis(self):
        if self._redis_checked:
            return self._redis
        self._redis_checked = True

        host = os.environ.get('REDIS_HOST')
        if not host:
            return None

        try:
            import redis

            self._redis = redis.Redis(
                host=host,
                port=int(os.environ.get('REDIS_PORT', '6379')),
                password=os.environ.get('REDIS_PASSWORD') or None,
                db=int(os.environ.get('TTS_REDIS_DB', '2')),
                socket_connect_timeout=3,
                socket_timeout=5,
                decode_responses=True,
            )
            self._redis.ping()
        except Exception:
            logger.exception('Redis unavailable; falling back to the in-process TTS lock')
            self._redis = None
        return self._redis

    @contextmanager
    def acquire(self, key: str):
        client = self._get_redis()
        if client is None:
            with self._local.acquire(key) as acquired:
                yield acquired
            return

        lock = client.lock(
            f'musickizuna:tts:lock:{key}',
            timeout=120,
            blocking_timeout=35,
            thread_local=False,
        )
        acquired = lock.acquire(blocking=True)
        try:
            yield acquired
        finally:
            if acquired:
                try:
                    lock.release()
                except Exception:
                    logger.exception('Failed to release Redis TTS lock')
