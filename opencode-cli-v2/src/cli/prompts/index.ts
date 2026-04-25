import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

export interface PromptAdapter {
  readonly askTaskInput: (message?: string) => Promise<string>;
  readonly selectAgent: (agents: readonly string[], message?: string) => Promise<string>;
  readonly confirm: (message: string, initial?: boolean) => Promise<boolean>;
}

export interface PromptIO {
  readonly input: Readable;
  readonly output: Writable;
}

function normalizeText(value: string): string {
  return value.trim();
}

export function createPromptAdapter(io: PromptIO = { input: process.stdin, output: process.stdout }): PromptAdapter {
  const ask = async (message: string): Promise<string> => {
    const cli = createInterface({
      input: io.input,
      output: io.output
    });

    try {
      const answer = await cli.question(`${message} `);
      return normalizeText(answer);
    } finally {
      cli.close();
    }
  };

  return {
    askTaskInput: async (message = 'Enter task:') => ask(message),
    selectAgent: async (agents, message = 'Select agent:') => {
      if (agents.length === 0) {
        throw new Error('No agents available for selection.');
      }

      const options = agents.map((agent, index) => `${index + 1}) ${agent}`).join(', ');
      const answer = await ask(`${message} ${options}`);

      const parsed = Number(answer);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= agents.length) {
        return agents[parsed - 1] ?? agents[0] ?? 'default-agent';
      }

      const namedMatch = agents.find((agent) => agent === answer);
      return namedMatch ?? agents[0] ?? 'default-agent';
    },
    confirm: async (message, initial = true) => {
      const suffix = initial ? '[Y/n]' : '[y/N]';
      const answer = (await ask(`${message} ${suffix}`)).toLowerCase();

      if (answer === '') {
        return initial;
      }

      if (['y', 'yes'].includes(answer)) {
        return true;
      }

      if (['n', 'no'].includes(answer)) {
        return false;
      }

      return initial;
    }
  };
}

export * from './agent-select';
export * from './confirm';
export * from './task-input';
