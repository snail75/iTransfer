const fs = require("fs");
const path = require("path");

const compiledSeed = path.resolve(
  __dirname,
  "../../dist/prisma/seed/config.seed.js",
);
const useCompiledSeed =
  process.env.NODE_ENV === "docker" || process.env.NODE_ENV === "production";

if (useCompiledSeed && fs.existsSync(compiledSeed)) {
  require(compiledSeed);
} else {
  require("ts-node/register");
  require("./config.seed.ts");
}
