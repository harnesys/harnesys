import { randomBytes } from 'node:crypto';
import { assertFormLaunchFields } from '../../../domain/apps/form-launch.ts';
import type { Launch } from '../../../domain/apps/provider-module.ts';
import type { ConnectSession } from '../../../domain/apps/records.ts';

export function applyWaitLaunch(session: ConnectSession, launch: Launch): void {
  if (launch.kind === 'form') {
    assertFormLaunchFields(launch.fields);
  }
  session.launchHtml = null;
  session.launchFormHosts = [];
  session.launchFormFields = [];
  if (launch.kind === 'html') {
    session.launchToken = session.launchToken ?? randomBytes(24).toString('base64url');
    session.launchHtml = launch.html;
    session.launchFormHosts = launch.formActionHosts;
  }
  if (launch.kind === 'form') {
    session.launchFormFields = [...launch.fields];
  }
}
