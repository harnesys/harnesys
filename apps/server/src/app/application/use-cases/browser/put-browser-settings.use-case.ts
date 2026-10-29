import { HttpException, Injectable } from '@harnesys/brix';
import type { BrowserDefaultEngine } from '@harnesys/contracts';
import { engineSpecOf } from 'harnesys';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';

@Injectable()
export class PutBrowserSettingsUseCase {
  constructor(private readonly orgSettings: OrgSettingsPort) {}

  execute(input: { orgId: string; defaultEngine: BrowserDefaultEngine }): {
    defaultEngine: BrowserDefaultEngine;
  } {
    if (input.defaultEngine !== 'auto' && engineSpecOf(input.defaultEngine) === undefined) {
      throw new HttpException(400, 'ENGINE_NOT_FOUND', `unknown engine ${input.defaultEngine}`);
    }
    this.orgSettings.set(input.orgId, {
      browser: { defaultEngine: input.defaultEngine },
    });
    return { defaultEngine: input.defaultEngine };
  }
}
