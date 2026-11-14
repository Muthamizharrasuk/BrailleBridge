import io
import json
import unittest
from urllib.error import URLError
from backend.speech.compression import compress_text, critical_content_preserved, SYSTEM_PROMPT


class CompressionTests(unittest.TestCase):
    config = {'LLM_BASE_URL': 'https://example.test/v1', 'LLM_MODEL': 'test-model', 'LLM_API_KEY': 'test-only-key'}

    def provider(self, text):
        return lambda *args, **kwargs: io.BytesIO(json.dumps({'choices': [{'message': {'content': text}}]}).encode())

    def test_missing_configuration_preserves_original(self):
        text = '  Call Ana at 8:30.\n'
        self.assertEqual(compress_text(text, environ={})['text'], text)

    def test_missing_api_key(self):
        result = compress_text('Hi', environ={**self.config, 'LLM_API_KEY': ''})
        self.assertEqual(result['status'], 'fallback')
        self.assertIn('key', result['reason'])

    def test_success_retains_names_numbers_and_negation(self):
        original = 'Please, do not call Ana at 8:30.'
        candidate = 'Do not call Ana at 8:30.'
        result = compress_text(original, environ=self.config, opener=self.provider(candidate))
        self.assertEqual(result['text'], candidate)
        self.assertEqual(result['original'], original)
        self.assertEqual(result['status'], 'candidate')
        self.assertIn('not guaranteed', result['reason'])

    def test_server_side_request(self):
        def opener(request, timeout):
            payload = json.loads(request.data)
            self.assertEqual(request.full_url, 'https://example.test/v1/chat/completions')
            self.assertEqual(payload['messages'][1]['content'], 'Please call Ana.')
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-only-key')
            self.assertEqual(timeout, 20)
            return self.provider('Call Ana.')()
        result = compress_text('Please call Ana.', environ=self.config, opener=opener)
        self.assertEqual(result['status'], 'candidate')
        self.assertNotIn('test-only-key', json.dumps(result))
        for word in ('names', 'numbers', 'times', 'negation', 'warnings'):
            self.assertIn(word, SYSTEM_PROMPT)

    def test_provider_failure_falls_back_without_exposing_secrets(self):
        def fail(*args, **kwargs):
            raise URLError('secret-provider-error')
        result = compress_text('Call Ana.', environ=self.config, opener=fail)
        self.assertEqual(result['text'], 'Call Ana.')
        self.assertNotIn('secret-provider-error', json.dumps(result))

    def test_changed_numbers_or_dropped_warning_falls_back(self):
        for candidate in ('Do not call Ana at 9:30.', 'Call Ana at 8:30.'):
            with self.subTest(candidate=candidate):
                result = compress_text('Do not call Ana at 8:30.', environ=self.config, opener=self.provider(candidate))
                self.assertEqual(result['status'], 'fallback')
        self.assertFalse(critical_content_preserved('Warning: stop at 42 Main St.', 'Go to 42 Main St.'))

    def test_empty_or_invalid_model_output_falls_back(self):
        for value in ('', None, 'Hi'):
            result = compress_text('Hi', environ=self.config, opener=self.provider(value))
            self.assertEqual(result['status'], 'fallback')

    def test_bad_provider_json_falls_back(self):
        result = compress_text('Hi', environ=self.config, opener=lambda *a, **k: io.BytesIO(b'not-json'))
        self.assertEqual(result['status'], 'fallback')

    def test_local_provider_without_key(self):
        result = compress_text('Please call Ana.', environ={'LLM_BASE_URL': 'http://127.0.0.1:1234/v1', 'LLM_MODEL': 'local'}, opener=self.provider('Call Ana.'))
        self.assertEqual(result['status'], 'candidate')

    def test_remote_http_is_rejected(self):
        result = compress_text('Hi', environ={**self.config, 'LLM_BASE_URL': 'http://example.test/v1'})
        self.assertEqual(result['status'], 'fallback')

    def test_empty_or_oversized_input(self):
        for value in ('', '   ', None, 'x' * 8001):
            with self.assertRaises(ValueError):
                compress_text(value)


if __name__ == '__main__':
    unittest.main()
