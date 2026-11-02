import type { PromptAdapter } from './index';

export async function promptForTaskInput(
  prompts: PromptAdapter,
  message = 'Enter task:'
): Promise<string> {
  return prompts.askTaskInput(message);
}
