import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { openCommand } from "./commands/open.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("docsync")
    .description("Sync markdown docs across machines using GitHub as backend")
    .version("0.1.0");

  program.addCommand(initCommand());
  program.addCommand(pushCommand());
  program.addCommand(pullCommand());
  program.addCommand(openCommand());

  return program;
}
