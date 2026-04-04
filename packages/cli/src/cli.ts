import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { openCommand } from "./commands/open.js";
import { listCommand } from "./commands/list.js";
import { catCommand } from "./commands/cat.js";
import { rmCommand } from "./commands/rm.js";
import { mvCommand } from "./commands/mv.js";

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
  program.addCommand(listCommand());
  program.addCommand(catCommand());
  program.addCommand(rmCommand());
  program.addCommand(mvCommand());

  return program;
}
