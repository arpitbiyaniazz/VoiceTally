import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep test runs offline and deterministic: the voice agent uses its built-in parser instead of
    // calling the LLM configured in .env. Tests that exercise providers set their own keys and mocks.
    env: {
      LLM_PROVIDER: 'local',
    },
  },
});
