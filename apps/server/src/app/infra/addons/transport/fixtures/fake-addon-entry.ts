import { defineAddon } from '@harnesys/sdk';

export const addon = defineAddon({
  tools: {
    echo: async (input: Record<string, unknown>) => {
      return { echoed: input.text as string, identityCheck: input === null ? 'null' : 'object' };
    },
  },
});
