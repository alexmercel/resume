import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModelAttemptOrderForTesting,
  isRetryableProviderErrorForTesting
} from './providers.js';

test('provider model attempt order keeps the selected model first without duplicates', () => {
  assert.deepEqual(
    buildModelAttemptOrderForTesting('google', 'gemini-2.5-flash'),
    [
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite'
    ]
  );
});

test('retryable provider errors include transient overload responses', () => {
  const transient = new Error('This model is currently experiencing high demand. Please try again later.');
  transient.status = 503;
  assert.equal(isRetryableProviderErrorForTesting(transient), true);
});

test('retryable provider errors do not include hard auth failures', () => {
  const authFailure = new Error('Invalid API key');
  authFailure.status = 401;
  assert.equal(isRetryableProviderErrorForTesting(authFailure), false);
});
