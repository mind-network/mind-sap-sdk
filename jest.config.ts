/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  modulePaths: ["<rootDir>"],
  moduleNameMapper: {
    "^src/(.*)": "<rootDir>/src/$1",
  },
  setupFiles: [
    // "./tests/utils/localStorage.js",
  ],
  testMatch: ["**/tests/**/*.test.ts"],
  testTimeout: 60000,
  cache: true,
};
