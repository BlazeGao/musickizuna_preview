import os
import re
import hashlib
import requests
import eng_to_ipa as ipa
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS


def normalize_ipa(ipa_str):
    if not ipa_str:
        return ipa_str
    return ipa_str.lower()

app = Flask(__name__)
CORS(app, origins=['http://localhost:5173', 'http://127.0.0.1:5173'])

cache = {}

TTS_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'tts_cache')
os.makedirs(TTS_CACHE_DIR, exist_ok=True)

TTS_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'


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
    text = data.get('text', '').strip()
    lang = data.get('lang', 'zh')

    if not text:
        return jsonify({'error': 'text is required'}), 400

    api_key = os.environ.get('QWEN_TTS_API_KEY')
    if not api_key:
        return jsonify({'error': 'QWEN_TTS_API_KEY not configured'}), 500

    cache_key_str = f'{lang}:{text}'
    cache_key = hashlib.md5(cache_key_str.encode()).hexdigest()
    audio_file = os.path.join(TTS_CACHE_DIR, f'{cache_key}.wav')

    if os.path.exists(audio_file):
        return send_file(audio_file, mimetype='audio/wav', conditional=True)

    voice = 'Kiki'
    language_type = 'Chinese'
    if lang == 'ja':
        voice = 'Ono_Anna'
        language_type = 'Japanese'

    try:
        resp = requests.post(
            TTS_API_URL,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'qwen3-tts-flash',
                'input': {
                    'text': text,
                    'voice': voice,
                    'language_type': language_type,
                },
            },
            timeout=30,
        )
        result = resp.json()

        audio_url = result.get('output', {}).get('audio', {}).get('url')

        if resp.status_code != 200 or not audio_url:
            error_msg = result.get('message', resp.text)
            return jsonify({'error': error_msg}), 502

        audio_resp = requests.get(audio_url, timeout=30)
        if audio_resp.status_code != 200:
            return jsonify({'error': 'Failed to download audio'}), 502

        with open(audio_file, 'wb') as f:
            f.write(audio_resp.content)

        return send_file(audio_file, mimetype='audio/wav', conditional=True)

    except requests.Timeout:
        return jsonify({'error': 'TTS API timeout'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
