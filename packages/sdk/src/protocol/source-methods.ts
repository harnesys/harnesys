import { z } from 'zod';
import { CallMetaSchema } from './meta.ts';
import { hostMethod } from './method-spec.ts';
import {
  SourceBytesResultSchema,
  SourceExportParamsSchema,
  SourceListParamsSchema,
  SourceListResultSchema,
  SourceMkdirParamsSchema,
  SourceMkdirResultSchema,
  SourceReadParamsSchema,
  SourceRemoveParamsSchema,
  SourceStatParamsSchema,
  SourceStatResultSchema,
  SourceUploadParamsSchema,
  SourceUploadResultSchema,
} from './shared.ts';

const empty = z.object({});

/**
 * Knowledge-source backend calls: the host mirror pipeline drives an add-on through
 * these methods and the add-on owns vendor auth and API calls.
 */
export const sourceMethods = {
  'source.list': hostMethod(
    SourceListParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceListResultSchema,
    'source',
  ),
  'source.stat': hostMethod(
    SourceStatParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceStatResultSchema,
    'source',
  ),
  'source.download': hostMethod(
    SourceReadParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceBytesResultSchema,
    'source',
  ),
  'source.upload': hostMethod(
    SourceUploadParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceUploadResultSchema,
    'source',
  ),
  'source.mkdir': hostMethod(
    SourceMkdirParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceMkdirResultSchema,
    'source',
  ),
  'source.remove': hostMethod(
    SourceRemoveParamsSchema.extend({ _meta: CallMetaSchema }),
    empty,
    'source',
  ),
  'source.export': hostMethod(
    SourceExportParamsSchema.extend({ _meta: CallMetaSchema }),
    SourceBytesResultSchema,
    'source',
  ),
};
