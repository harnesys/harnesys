import type { RequestPlan, RequestSection } from '@harnesys/studio-shared';

export interface BreakdownRow {
  id: string;
  label: string;
  estTokens: number;
  pct: number;
  children: BreakdownRow[];
}

const SYSTEM_LABELS: Record<string, string> = {
  'system.prompt': 'System prompt',
  'system.channel': 'Channel note',
  'system.runtime': 'Runtime',
};

function pctOf(value: number, base: number): number {
  if (base <= 0) {
    return 0;
  }
  const pct = (value / base) * 100;
  return pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
}

function leaf(row: Omit<BreakdownRow, 'pct' | 'children'>): BreakdownRow {
  return { ...row, pct: 0, children: [] };
}

function branch(
  id: string,
  label: string,
  estTokens: number,
  children: BreakdownRow[],
): BreakdownRow {
  return { id, label, estTokens, pct: 0, children };
}

function sectionTokens(sections: RequestSection[]): number {
  return sections.reduce((sum, s) => sum + s.estTokens, 0);
}

function suffix(id: string, prefix: string): string {
  return id.slice(prefix.length) || id;
}

function rowsOf(
  sections: RequestSection[],
  prefix: string,
  label?: (id: string) => string,
): BreakdownRow[] {
  return sections.map((s) =>
    branch(
      s.id,
      label ? label(s.id) : suffix(s.id, prefix),
      s.estTokens,
      rowsOf(s.children ?? [], `${s.id}.`),
    ),
  );
}

export function buildBreakdownRows(plan: RequestPlan, contextWindow: number): BreakdownRow[] {
  const find = (id: string): RequestSection | undefined => plan.sections.find((s) => s.id === id);
  const system = plan.sections.filter(
    (s) => s.id.startsWith('system.') && !s.id.startsWith('system.skills'),
  );
  const skills = find('system.skills');
  const toolHeader = find('tools');
  const toolGroups = plan.sections.filter(
    (s) => s.id.startsWith('tools.') && s.id !== 'tools.deferred',
  );
  const deferred = find('tools.deferred');
  const notes = find('notes');
  const history = find('history');

  const rows: BreakdownRow[] = [];
  if (system.length > 0) {
    rows.push(
      branch(
        'system',
        'System',
        sectionTokens(system),
        system.map((s) =>
          leaf({ id: s.id, label: SYSTEM_LABELS[s.id] ?? s.id, estTokens: s.estTokens }),
        ),
      ),
    );
  }
  if (skills) {
    rows.push(
      branch('skills', 'Skills', skills.estTokens, rowsOf(skills.children ?? [], 'system.skills.')),
    );
  }
  if (toolGroups.length > 0 || deferred) {
    const toolRows = rowsOf(toolGroups, 'tools.');
    if (deferred) {
      toolRows.push(
        leaf({ id: 'tools.deferred', label: 'Deferred catalog', estTokens: deferred.estTokens }),
      );
    }
    const total =
      (toolHeader?.estTokens ?? 0) + sectionTokens(toolGroups) + (deferred?.estTokens ?? 0);
    rows.push(branch('tools', 'Tools', total, toolRows));
  }
  if (notes) {
    rows.push(branch('notes', 'Notes', notes.estTokens, rowsOf(notes.children ?? [], 'notes.')));
  }
  if (history) {
    rows.push(leaf({ id: 'history', label: 'Messages', estTokens: history.estTokens }));
  }

  const base = contextWindow > 0 ? contextWindow : plan.totalEstTokens;
  for (const row of rows) {
    row.pct = pctOf(row.estTokens, base);
    for (const child of row.children) {
      child.pct = pctOf(child.estTokens, base);
      for (const grand of child.children) {
        grand.pct = pctOf(grand.estTokens, base);
      }
    }
  }
  if (contextWindow > 0 && plan.totalEstTokens < contextWindow) {
    const free = contextWindow - plan.totalEstTokens;
    rows.push(leaf({ id: 'free', label: 'Free', estTokens: free }));
    rows[rows.length - 1].pct = pctOf(free, contextWindow);
  }
  return rows;
}
