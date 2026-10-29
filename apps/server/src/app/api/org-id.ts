import { createParamDecorator } from '@harnesys/brix';
import { OrgIdRequiredException } from '../domain/fleet/fleet.error.ts';

export const OrgIdHeader = createParamDecorator((_data, context) => {
  const value = context.request.headers.get('X-Org-Id')?.trim() ?? '';
  if (!value) {
    throw new OrgIdRequiredException();
  }
  return value;
});

export const OrgIdFromRequest = createParamDecorator((_data, context) => {
  const header = context.request.headers.get('X-Org-Id')?.trim() ?? '';
  if (header) {
    return header;
  }
  const url = new URL(context.request.url);
  const query = url.searchParams.get('orgId')?.trim() ?? '';
  if (!query) {
    throw new OrgIdRequiredException();
  }
  return query;
});

export const BearerToken = createParamDecorator((_data, context) => {
  const header = context.request.headers.get('Authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return '';
});
