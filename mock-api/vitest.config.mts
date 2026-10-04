import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      // Freeze "now" to the morning the seed data was authored for (IST).
      APP_FIXED_NOW: '2026-09-20T09:00:00+05:30',
      MAKE_WEBHOOK_URL: '',
      ELEVENLABS_API_KEY: ''
    },
    fileParallelism: false
  }
});
