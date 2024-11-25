export default {
  preset: "ts-jest",
  testEnvironment: "node",
  coveragePathIgnorePatterns: [
    "./src/auth/GMAuth.ts", // Add the path to the file you want to exclude
  ],
};
