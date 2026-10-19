/**
 * Jest configuration for the TinyHoney landing page.
 *
 * Runs property-based tests (tests/pbt) and unit tests (tests/unit) inside a
 * jsdom environment so that DOM assertions against index.html work without a
 * browser. Test files use the `.test.js` extension; Playwright's config is
 * restricted to `.spec.js`, so the two runners never pick up each other's files.
 *
 * Requirement references: 19.2, 19.3 (test infrastructure).
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/pbt/**/*.test.js'
  ],
  // Property-based tests run 100+ iterations; give them headroom on slower machines.
  testTimeout: 10000,
  verbose: true
};
