/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/js-with-babel",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  coveragePathIgnorePatterns: [
    "./src/auth/GMAuth.ts", // Add the path to the file you want to exclude
  ],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.json",
      },
    ],
    "^.+\\.m?js$": ["babel-jest", { rootMode: "upward" }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(openid-client|oauth4webapi|jose))/",
  ],
};
