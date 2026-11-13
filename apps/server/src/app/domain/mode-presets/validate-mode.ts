import { DEFAULT_MODE_ID } from '@harnesys/contracts';
import { ModePresetValidationException } from './mode-preset.error.ts';
import { ModePresetRegistryPort } from './mode-preset-registry.port.ts';

export function assertValidModePreset(
  modes: ModePresetRegistryPort,
  orgId: string,
  mode: string | null | undefined,
): void {
  if (!mode || mode === DEFAULT_MODE_ID) {
    return;
  }
  if (!modes.findById(orgId, mode)) {
    throw new ModePresetValidationException(`unsupported mode: ${mode}`);
  }
}
