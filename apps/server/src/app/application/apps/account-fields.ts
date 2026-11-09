export interface AccountFieldInput {
  values: Record<string, string>;
  credentials: Record<string, string>;
}

export interface AccountFieldMergeInput {
  currentValues: Record<string, string>;
  currentSecretFields: readonly string[];
  patch: AccountFieldInput;
}

export interface AccountFieldMergeResult {
  values: Record<string, string>;
  credentials: Record<string, string>;
  secretFields: string[];
  removedSecrets: string[];
}

export function mergeAccountFields(input: AccountFieldMergeInput): AccountFieldMergeResult {
  const values = applyValuePatch(input.currentValues, input.patch.values);
  const { credentials, removedSecrets } = splitCredentials(input.patch.credentials);
  const kept = input.currentSecretFields.filter((field) => !removedSecrets.includes(field));
  const secretFields = [...new Set([...kept, ...Object.keys(credentials)])].sort();
  return { values, credentials, secretFields, removedSecrets };
}

function applyValuePatch(
  current: Record<string, string>,
  patch: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(current)) {
    const value = raw.trim();
    if (value) {
      values[key] = value;
    }
  }
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw.trim();
    if (value) {
      values[key] = value;
    } else {
      delete values[key];
    }
  }
  return values;
}

function splitCredentials(patch: Record<string, string>): {
  credentials: Record<string, string>;
  removedSecrets: string[];
} {
  const credentials: Record<string, string> = {};
  const removedSecrets: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw.trim();
    if (value) {
      credentials[key] = value;
    } else {
      removedSecrets.push(key);
    }
  }
  return { credentials, removedSecrets };
}
