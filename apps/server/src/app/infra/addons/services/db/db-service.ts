import { Injectable } from '@harnesys/brix';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { serviceMethod } from '../method.ts';
import type { DbStatement } from '../sinks.ts';
import { AddonDbAccess } from '../sinks.ts';

const DB_LIMITS = { timeoutMs: 5000, maxResultKb: 8192 };

@Injectable()
export class DbHostService implements HostServiceModule {
  readonly namespace = 'db';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly db: AddonDbAccess) {
    this.methods = [
      serviceMethod('db.exec', DB_LIMITS, async (ctx, params) => {
        await this.db.exec(ctx.orgId, ctx.addonId, params.sql);
        return {};
      }),
      serviceMethod('db.all', DB_LIMITS, async (ctx, params) => {
        const rows = await this.db.all(ctx.orgId, ctx.addonId, params.sql, params.params);
        return { rows };
      }),
      serviceMethod('db.get', DB_LIMITS, async (ctx, params) => {
        const row = await this.db.get(ctx.orgId, ctx.addonId, params.sql, params.params);
        return { row };
      }),
      serviceMethod('db.run', DB_LIMITS, async (ctx, params) => {
        return await this.db.run(ctx.orgId, ctx.addonId, params.sql, params.params);
      }),
      serviceMethod('db.batch', DB_LIMITS, async (ctx, params) => {
        const statements: DbStatement[] = params.statements;
        const results = await this.db.batch(ctx.orgId, ctx.addonId, statements);
        return { results };
      }),
    ];
  }
}
