export function isCompactionAgent(agent: string | undefined): boolean {
  const normalized = agent?.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return [
    "compaction",
    "dcp",
    "distill",
    "context-injector",
  ].includes(normalized)
}

export function resolveSessionID(props?: Record<string, unknown>): string | undefined {
  return (props?.sessionID ??
    (props?.info as { id?: string } | undefined)?.id) as string | undefined
}
