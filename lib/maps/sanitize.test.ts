import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive, safeErrorMessage } from './sanitize.ts';

test('redacts Google API keys', () => {
  const out = redactSensitive('failed with key AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvW');
  assert.match(out, /\[redacted-key\]/);
  assert.doesNotMatch(out, /AIzaSy/);
});

test('redacts key= / token= query params', () => {
  assert.match(redactSensitive('https://x?key=SECRET123&z=1'), /key=\[redacted\]/);
  assert.match(redactSensitive('access_token=abcdef12345'), /access_token=\[redacted\]/);
});

test('redacts bearer tokens', () => {
  assert.match(redactSensitive('Authorization: Bearer abcDEF123456789'), /Bearer \[redacted\]/);
});

test('redacts lat,lng coordinate pairs', () => {
  const out = redactSensitive('origin 33.5902,130.4017 failed');
  assert.match(out, /\[redacted-coords\]/);
  assert.doesNotMatch(out, /33\.5902/);
});

test('safeErrorMessage redacts + caps length', () => {
  const long = 'AIzaSyXXXXXXXXXXXXXXXXXXXX ' + 'y'.repeat(500);
  const out = safeErrorMessage(new Error(long), 80);
  assert.ok(out.length <= 80);
  assert.doesNotMatch(out, /AIzaSy/);
  assert.equal(safeErrorMessage(undefined), 'unknown_error');
  assert.equal(safeErrorMessage('plain message'), 'plain message');
});
