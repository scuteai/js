/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["@scute/eslint-config"],
  settings: {
    next: {
      rootDir: ["apps/*/"],
    },
  },
  ignorePatterns: ["examples/**"],
};
