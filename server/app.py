import os
import eng_to_ipa as ipa
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

cache = {}


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
                cache[key] = ipa_result
                result[key] = ipa_result
            else:
                cache[key] = None
                result[key] = None
        except Exception:
            result[key] = None
    return jsonify(result)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
