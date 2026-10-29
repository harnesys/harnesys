import type { ModeOpPermissions, ModeToolExposure, PackAssignmentBody } from '@harnesys/contracts';

export interface ModePresetRecord {
  orgId: string;
  id: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  packs: Record<string, PackAssignmentBody>;
  disabledTools?: string[];
  exposure?: Record<string, ModeToolExposure>;
  permissions: ModeOpPermissions;
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModePresetInsert {
  orgId: string;
  id: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  packs: Record<string, PackAssignmentBody>;
  disabledTools?: string[];
  exposure?: Record<string, ModeToolExposure>;
  permissions: ModeOpPermissions;
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModePresetPatch {
  name?: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignmentBody>;
  disabledTools?: string[];
  exposure?: Record<string, ModeToolExposure>;
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
  updatedAt: string;
}
