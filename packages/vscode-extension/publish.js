#!/usr/bin/env node

/**
 * Publish the DocSync VSCode extension to the Marketplace.
 *
 * Usage:
 *   node publish.js <PAT>
 *
 * Where <PAT> is your Azure DevOps Personal Access Token
 * with Marketplace > Manage scope.
 *
 * Example:
 *   node publish.js ghp_abc123...
 */

const { execSync } = require("child_process");
const path = require("path");

const pat = process.argv[2];

if (!pat) {
  console.error("Usage: node publish.js <AZURE_PAT>");
  console.error("");
  console.error("Get a PAT from: https://dev.azure.com → User Settings → Personal Access Tokens");
  console.error("Required scope: Marketplace > Manage");
  process.exit(1);
}

const extensionDir = __dirname;
const buildScript = path.resolve(__dirname, "../../.vscode/build.js");

function run(cmd, cwd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Build everything
console.log("\n📦 Building...\n");
run(`node ${buildScript}`, extensionDir);

// 2. Package the extension
console.log("\n📋 Packaging...\n");
run("npx vsce package --no-dependencies", extensionDir);

// 3. Publish
console.log("\n🚀 Publishing to Marketplace...\n");
run(`npx vsce publish --no-dependencies -p ${pat}`, extensionDir);

console.log("\n✅ Published successfully!");
console.log("View at: https://marketplace.visualstudio.com/items?itemName=HcySunYang.docsync-vscode");
