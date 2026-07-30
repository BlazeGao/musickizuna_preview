import os
import re
import logging
from urllib.parse import urlparse

import requests
import eng_to_ipa as ipa
import pykakasi
from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    from .storage import CosTTSStorage, TTSStorageConfig
    from .tts_lock import TTSLockManager
except ImportError:
    from storage import CosTTSStorage, TTSStorageConfig
    from tts_lock import TTSLockManager


logger = logging.getLogger(__name__)

def normalize_ipa(ipa_str):
    if not ipa_str:
        return ipa_str
    return ipa_str.lower()

app = Flask(__name__)
CORS(app, origins=[
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://musickizuna.net',
    'https://www.musickizuna.net',
])

cache = {}
furigana_cache = {}

_kks = pykakasi.kakasi()


def _furigana_tokens(text):
    result = _kks.convert(text)
    return [{'surface': r['orig'], 'reading': r['hira'], 'romaji': r['hepburn']} for r in result]


def _reading_to_romaji(reading):
    if not reading:
        return ''
    try:
        result = _kks.convert(reading)
        return ''.join(r['hepburn'] for r in result)
    except Exception:
        return ''

TTS_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
TTS_MODEL = 'qwen3-tts-flash'
TTS_MAX_TEXT_LENGTH = int(os.environ.get('TTS_MAX_TEXT_LENGTH', '3000'))
TTS_MAX_AUDIO_BYTES = int(os.environ.get('TTS_MAX_AUDIO_BYTES', str(20 * 1024 * 1024)))

_tts_storage = None
_tts_locks = TTSLockManager()


def _get_tts_storage():
    global _tts_storage
    if _tts_storage is None:
        _tts_storage = CosTTSStorage(TTSStorageConfig.from_env())
    return _tts_storage


def _normalize_tts_text(text):
    return text.replace('\r\n', '\n').replace('\r', '\n').strip()


def _tts_voice(lang):
    if lang == 'ja':
        return 'Ono Anna', 'Japanese'
    return 'Kiki', 'Chinese'


def _download_tts_audio(audio_url):
    parsed = urlparse(audio_url)
    hostname = (parsed.hostname or '').lower()
    if parsed.scheme not in ('http', 'https') or not (
        hostname == 'aliyuncs.com' or hostname.endswith('.aliyuncs.com')
    ):
        raise ValueError('TTS provider returned an unexpected audio URL')

    with requests.get(audio_url, timeout=(5, 30), stream=True) as response:
        response.raise_for_status()
        content_length = int(response.headers.get('Content-Length') or 0)
        if content_length > TTS_MAX_AUDIO_BYTES:
            raise ValueError('Generated audio is too large')

        chunks = []
        received = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            received += len(chunk)
            if received > TTS_MAX_AUDIO_BYTES:
                raise ValueError('Generated audio is too large')
            chunks.append(chunk)

    audio = b''.join(chunks)
    if len(audio) < 12 or audio[:4] != b'RIFF' or audio[8:12] != b'WAVE':
        raise ValueError('TTS provider returned invalid WAV audio')
    return audio


@app.route('/api/phonetic')
def phonetic():
    word = request.args.get('word', '').strip().lower()
    if not word:
        return jsonify({'phonetic': None})

    if word in cache:
        return jsonify({'phonetic': cache[word]})

    try:
        result = ipa.convert(word)
        if result and '*' not in result:
            result = normalize_ipa(result)
            cache[word] = result
            return jsonify({'phonetic': result})
    except Exception:
        pass

    cache[word] = None
    return jsonify({'phonetic': None})


@app.route('/api/phonetic/batch', methods=['POST'])
def phonetic_batch():
    data = request.get_json() or {}
    words = data.get('words', [])
    result = {}
    for word in words:
        key = word.strip().lower()
        if not key:
            continue
        if key in cache:
            result[key] = cache[key]
            continue
        try:
            ipa_result = ipa.convert(key)
            if ipa_result and '*' not in ipa_result:
                ipa_result = normalize_ipa(ipa_result)
                cache[key] = ipa_result
                result[key] = ipa_result
            else:
                cache[key] = None
                result[key] = None
        except Exception:
            result[key] = None
    return jsonify(result)


@app.route('/api/tts', methods=['POST'])
def tts():
    data = request.get_json() or {}
    raw_text = data.get('text', '')
    if not isinstance(raw_text, str):
        return jsonify({'error': 'text must be a string'}), 400
    text = _normalize_tts_text(raw_text)
    lang = data.get('lang', 'zh')

    if not text:
        return jsonify({'error': 'text is required'}), 400
    if len(text) > TTS_MAX_TEXT_LENGTH:
        return jsonify({'error': f'text exceeds {TTS_MAX_TEXT_LENGTH} characters'}), 400
    if lang not in ('zh', 'ja'):
        return jsonify({'error': 'unsupported language'}), 400

    api_key = os.environ.get('QWEN_TTS_API_KEY')
    if not api_key:
        return jsonify({'error': 'QWEN_TTS_API_KEY not configured'}), 500

    voice, language_type = _tts_voice(lang)

    try:
        storage = _get_tts_storage()
        object_key = storage.make_object_key(
            text=text,
            lang=lang,
            model=TTS_MODEL,
            voice=voice,
        )
        cache_hit = storage.exists(object_key)

        if not cache_hit:
            with _tts_locks.acquire(object_key) as acquired:
                if not acquired:
                    return jsonify({'error': 'TTS generation is busy; please retry'}), 503

                cache_hit = storage.exists(object_key)
                if not cache_hit:
                    response = requests.post(
                        TTS_API_URL,
                        headers={
                            'Authorization': f'Bearer {api_key}',
                            'Content-Type': 'application/json',
                        },
                        json={
                            'model': TTS_MODEL,
                            'input': {
                                'text': text,
                                'voice': voice,
                                'language_type': language_type,
                            },
                        },
                        timeout=(5, 30),
                    )
                    try:
                        result = response.json()
                    except ValueError:
                        result = {}

                    audio_url = result.get('output', {}).get('audio', {}).get('url')
                    if response.status_code != 200 or not audio_url:
                        logger.warning('Qwen TTS failed with status %s', response.status_code)
                        error_msg = result.get('message', 'TTS provider request failed')
                        return jsonify({'error': error_msg}), 502

                    audio = _download_tts_audio(audio_url)
                    storage.upload_wav(object_key, audio)

        signed_url, expires_at = storage.signed_download(object_key)
        return jsonify({
            'audioUrl': signed_url,
            'cacheKey': object_key,
            'cacheHit': cache_hit,
            'urlExpiresAt': expires_at,
        })

    except requests.Timeout:
        return jsonify({'error': 'TTS API timeout'}), 504
    except requests.RequestException:
        logger.exception('TTS provider request failed')
        return jsonify({'error': 'TTS provider request failed'}), 502
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 502
    except Exception:
        logger.exception('TTS request failed')
        return jsonify({'error': 'TTS service unavailable'}), 503


@app.route('/api/furigana')
def furigana():
    text = request.args.get('text', '').strip()
    if not text:
        return jsonify({'tokens': []})
    if text in furigana_cache:
        return jsonify({'tokens': furigana_cache[text]})
    try:
        tokens = _furigana_tokens(text)
        furigana_cache[text] = tokens
        return jsonify({'tokens': tokens})
    except Exception:
        return jsonify({'tokens': []})


@app.route('/api/furigana/batch', methods=['POST'])
def furigana_batch():
    data = request.get_json() or {}
    texts = data.get('texts', [])
    results = []
    for text in texts:
        if not text:
            results.append([])
            continue
        if text in furigana_cache:
            results.append(furigana_cache[text])
            continue
        try:
            tokens = _furigana_tokens(text)
            furigana_cache[text] = tokens
            results.append(tokens)
        except Exception:
            results.append([])
    return jsonify({'results': results})


@app.route('/api/romaji/from-reading', methods=['POST'])
def romaji_from_reading():
    data = request.get_json() or {}
    reading = (data.get('reading') or '').strip()
    if not reading:
        return jsonify({'romaji': ''})
    return jsonify({'romaji': _reading_to_romaji(reading)})


@app.route('/api/romaji/batch', methods=['POST'])
def romaji_batch():
    data = request.get_json() or {}
    readings = data.get('readings') or []
    results = [_reading_to_romaji(r) for r in readings]
    return jsonify({'romaji': results})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
