/**
 * Test environment.
 *
 * The suites below are pure-logic tests: CSV rules, rendering, MIME assembly,
 * token signing and the campaign state machine. They must not need a database,
 * Redis or AWS, so a complete, valid configuration is injected here and the
 * modules under test are imported without side effects.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/mailstrive_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.AUTH_SECRET = 'test-auth-secret-that-is-definitely-long-enough-0123456789';
process.env.UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret-that-is-long-enough-0123456789';
process.env.SES_FROM_EMAIL = 'campaigns@example.com';
process.env.SES_FROM_NAME = 'Example Team';
process.env.SES_REPLY_TO_EMAIL = 'support@example.com';
process.env.APP_URL = 'https://app.example.com';
process.env.API_PUBLIC_URL = 'https://api.example.com';
process.env.SES_SANDBOX_DRY_RUN = 'true';
