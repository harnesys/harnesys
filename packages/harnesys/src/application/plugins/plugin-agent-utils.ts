export function pluginAgentId(pluginName: string, agentName: string): string {
  return `${pluginName}:${agentName}`;
}

export function pluginOwnerOfId(id: string): string | undefined {
  const index = id.indexOf(':');
  return index > 0 ? id.slice(0, index) : undefined;
}

export function pluginAgentNameOf(id: string): string {
  return id.split(':').at(-1) ?? id;
}
