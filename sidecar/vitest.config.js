// vitest.config.js — sidecar uses CJS modules, so we use the globals
// API (describe/it/expect) instead of importing vitest in the test
// files. This avoids the "Vitest cannot be imported in a CommonJS
// module" error without rewriting all source files to ESM.
module.exports = {
  test: {
    globals: true,
    include: ["src/**/*.test.js", "src/**/*.test.mjs"],
  },
};
