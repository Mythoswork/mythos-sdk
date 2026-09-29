#!/usr/bin/env node

import { agents } from './cli/agents';
import { doctor, type DoctorOptions } from './cli/doctor';
import { init } from './cli/init';

export const USAGE = 'Usage: mythos-sdk <init|doctor|agents>';

export async function main(argv: string[] = process.argv.slice(2), options: DoctorOptions = {}): Promise<number> {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const [command] = argv;
  if (!command || command === '--help') {
    write(USAGE);
    return 0;
  }
  if (command === 'doctor') return doctor({ ...options, write });
  if (command === 'init') return init({ ...options, write });
  if (command === 'agents') return agents({ cwd: options.cwd, write });
  write(USAGE);
  return 2;
}

if (require.main === module) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
