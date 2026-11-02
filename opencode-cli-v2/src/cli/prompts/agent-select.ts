import type { PromptAdapter } from './index';

export async function promptForAgentSelection(
  prompts: PromptAdapter,
  agents: readonly string[],
  message = 'Select agent:'
): Promise<string> {
  return prompts.selectAgent(agents, message);
}
