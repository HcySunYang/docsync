/**
 * Build script that builds all packages in the monorepo.
 * Used by VSCode tasks to avoid pnpm PATH conflicts.
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");

function run(cmd, cwd) {
  console.log(`> ${cmd} (in ${path.relative(root, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// Build CLI package
run("node node_modules/tsup/dist/cli-default.js", path.join(root, "packages/cli"));

// Build VSCode extension
run("node esbuild.js", path.join(root, "packages/vscode-extension"));

console.log("All packages built successfully.");
