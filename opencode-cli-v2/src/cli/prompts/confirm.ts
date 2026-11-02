import type { PromptAdapter } from './index';

export async function promptForConfirmation(
  prompts: PromptAdapter,
  message: string,
  initial = true
): Promise<boolean> {
  return prompts.confirm(message, initial);
}
