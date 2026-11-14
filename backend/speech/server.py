"""Isolated, local development service: python -m backend.speech.server."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .compression import compress_text


class SpeechHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_json(200 if self.path == '/health' else 404,
                       {'service': 'speech-compression'} if self.path == '/health' else {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/api/speech/compress':
            self.send_json(404, {'error': 'Not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 40000:
                self.send_json(413, {'error': 'Invalid or oversized request'})
                return
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Expected a JSON object.')
            result = compress_text(payload.get('text'))
        except (ValueError, UnicodeDecodeError) as error:
            self.send_json(400, {'error': str(error)})
            return
        self.send_json(200, result)

    def log_message(self, format, *args):
        # No user transcripts or provider errors in logs.
        pass


if __name__ == '__main__':
    port = int(os.environ.get('SPEECH_PORT', '8001'))
    print(f'Speech compression: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), SpeechHandler).serve_forever()
