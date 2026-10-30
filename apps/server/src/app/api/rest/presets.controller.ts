import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@harnesys/brix';
import type {
  ImportPresetsBody,
  ImportPresetsResponse,
  ListPresetDetailsResponse,
  ListPresetsQuery,
  ListPresetsResponse,
  PresetDetail,
  SavePresetBody,
} from '@harnesys/contracts';
import {
  ImportPresetsBodySchema,
  ListPresetsQuerySchema,
  SavePresetBodySchema,
} from '@harnesys/contracts';
import { DeletePresetUseCase } from '../../application/presets/delete-preset.use-case.ts';
import { ExportPresetUseCase } from '../../application/presets/export-preset.use-case.ts';
import { GetPresetUseCase } from '../../application/presets/get-preset.use-case.ts';
import { ImportPresetsUseCase } from '../../application/presets/import-presets.use-case.ts';
import { ListPresetsUseCase } from '../../application/presets/list-presets.use-case.ts';
import { SavePresetUseCase } from '../../application/presets/save-preset.use-case.ts';

@Controller('presets')
export class PresetsController {
  constructor(
    private readonly listPresets: ListPresetsUseCase,
    private readonly getPreset: GetPresetUseCase,
    private readonly savePreset: SavePresetUseCase,
    private readonly deletePreset: DeletePresetUseCase,
    private readonly exportPreset: ExportPresetUseCase,
    private readonly importPresets: ImportPresetsUseCase,
  ) {}

  @Get()
  list(
    @Query(ListPresetsQuerySchema) query: ListPresetsQuery,
  ): ListPresetsResponse | ListPresetDetailsResponse {
    return this.listPresets.execute(query);
  }

  @Get(':kind/:owner/:name')
  get(
    @Param('kind') kind: string,
    @Param('owner') owner: string,
    @Param('name') name: string,
  ): PresetDetail {
    return this.getPreset.execute({ kind, id: `${owner}/${name}` });
  }

  @Post()
  @HttpCode(201)
  save(@Body(SavePresetBodySchema) body: SavePresetBody): PresetDetail {
    return this.savePreset.execute({ body });
  }

  @Patch(':kind/:owner/:name')
  replace(
    @Param('kind') kind: string,
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Body(SavePresetBodySchema) body: SavePresetBody,
  ): PresetDetail {
    return this.savePreset.execute({ body, path: { kind, id: `${owner}/${name}` } });
  }

  @Delete(':kind/:owner/:name')
  @HttpCode(204)
  remove(
    @Param('kind') kind: string,
    @Param('owner') owner: string,
    @Param('name') name: string,
  ): void {
    this.deletePreset.execute({ kind, id: `${owner}/${name}` });
  }

  @Get(':kind/:owner/:name/export')
  download(
    @Param('kind') kind: string,
    @Param('owner') owner: string,
    @Param('name') name: string,
  ): Response {
    const envelope = this.exportPreset.execute({ kind, id: `${owner}/${name}` });
    return new Response(JSON.stringify(envelope, null, 2), {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="${slugOf(name)}.preset.json"`,
      },
    });
  }

  @Post('import')
  importEnvelopes(@Body(ImportPresetsBodySchema) body: ImportPresetsBody): ImportPresetsResponse {
    return this.importPresets.execute({ envelope: body.envelope });
  }
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
