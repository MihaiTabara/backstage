/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CommandGraph } from './CommandGraph';
import { CliFeature, OpaqueCliPlugin } from './types';
import { CommandRegistry } from './CommandRegistry';
import { Command } from 'commander';
import { version } from '../lib/version';
import chalk from 'chalk';
import { exitWithError } from '../lib/errors';
import { assertError } from '@backstage/errors';
import { isPromise } from 'util/types';

type UninitializedFeature = CliFeature | Promise<{ default: CliFeature }>;

export class CliInitializer {
  private graph = new CommandGraph();
  private commandRegistry = new CommandRegistry(this.graph);
  #uninitiazedFeatures: Promise<CliFeature>[] = [];

  add(feature: UninitializedFeature) {
    if (isPromise(feature)) {
      this.#uninitiazedFeatures.push(
        feature.then(f => unwrapFeature(f.default)),
      );
    } else {
      this.#uninitiazedFeatures.push(Promise.resolve(feature));
    }
  }

  async #register(feature: CliFeature) {
    if (OpaqueCliPlugin.isType(feature)) {
      const internal = OpaqueCliPlugin.toInternal(feature);
      await internal.init(this.commandRegistry);
    } else {
      throw new Error(`Unsupported feature type: ${(feature as any).$$type}`);
    }
  }

  async #doInit() {
    const features = await Promise.all(this.#uninitiazedFeatures);
    for (const feature of features) {
      await this.#register(feature);
    }
  }

  /**
   * Actually parse argv and pass it to the command.
   */
  async run() {
    await this.#doInit();

    const programName = 'backstage-cli';

    const program = new Command();
    program
      .name(programName)
      .version(version)
      .allowUnknownOption(true)
      .allowExcessArguments(true);

    const queue = this.graph.atDepth(0).map(node => ({
      node,
      argParser: program,
    }));
    while (queue.length) {
      const { node, argParser } = queue.shift()!;
      if (node.$$type === '@tree/root') {
        const treeParser = argParser
          .command(`${node.name} [command]`)
          .description(node.name);

        queue.push(
          ...node.children.map(child => ({
            node: child,
            argParser: treeParser,
          })),
        );
      } else {
        argParser
          .command(node.name, { hidden: !!node.command.deprecated })
          .description(node.command.description)
          .helpOption(false)
          .allowUnknownOption(true)
          .allowExcessArguments(true)
          .action(async () => {
            try {
              const args = program.parseOptions(process.argv);

              const nonProcessArgs = args.operands.slice(2);
              const positionalArgs = [];
              let index = 0;
              for (
                let argIndex = 0;
                argIndex < nonProcessArgs.length;
                argIndex++
              ) {
                // Skip the command name
                if (
                  argIndex === index &&
                  node.command.path[argIndex] === nonProcessArgs[argIndex]
                ) {
                  index += 1;
                  continue;
                }
                positionalArgs.push(nonProcessArgs[argIndex]);
              }
              await node.command.execute({
                args: [...positionalArgs, ...args.unknown],
                info: {
                  usage: [programName, ...node.command.path].join(' '),
                  description: node.command.description,
                },
              });
              process.exit(0);
            } catch (error) {
              assertError(error);
              exitWithError(error);
            }
          });
      }
    }
    program.on('command:*', () => {
      console.log();
      console.log(chalk.red(`Invalid command: ${program.args.join(' ')}`));
      console.log();
      program.outputHelp();
      process.exit(1);
    });

    process.on('unhandledRejection', rejection => {
      if (rejection instanceof Error) {
        exitWithError(rejection);
      } else {
        exitWithError(new Error(`Unknown rejection: '${rejection}'`));
      }
    });

    program.parse(process.argv);
  }
}

/** @internal */
export function unwrapFeature(
  feature: CliFeature | { default: CliFeature },
): CliFeature {
  if ('$$type' in feature) {
    return feature;
  }

  // This is a workaround where default exports get transpiled to `exports['default'] = ...`
  // in CommonJS modules, which in turn results in a double `{ default: { default: ... } }` nesting
  // when importing using a dynamic import.
  // TODO: This is a broader issue than just this piece of code, and should move away from CommonJS.
  if ('default' in feature) {
    return feature.default;
  }

  return feature;
}
