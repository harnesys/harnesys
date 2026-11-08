# 17. Компакция потоков (thread compaction)

## Обзор

Компакция — сжатие контекста потока при достижении порога размера, чтобы избежать превышения контекстного окна модели. Реализована в `packages/harnesys/src/application/compaction/` и интегрирована в граф `packages/harnesys/src/application/graph.ts`. Перед каждым узлом `llm:generate` проверяется необходимость компакции; при overflow ошибке выполняется forced compaction.

## Файлы компакции

| Файл | Назначение |
|------|------------|
| `compaction/run.ts` | `runSummaryPassIfDue`, `runForcedCompaction`, `compactForced`, `compactionGuardOpen`, `passIfDue`, типы `CompactionGuard`, `CompactionPassContext`, `CompactionPassEvent`, `CompactionSkipReason` |
| `compaction/estimate.ts` | `estimateTokens`, `estimateTokensAnchored` — оценка токенов |
| `compaction/plan-cut.ts` | `planCut` — планирование разреза истории |
| `compaction/summarize.ts` | `streamSummary`, `SUMMARY_SYSTEM_PROMPT`, `priorSummaryBlock` — суммаризация через LLM |
| `compaction/file-log.ts` | `writeCompactionFile` — запись лога компакции |
| `compaction/microcompact.ts` | `microcompactToolResults` — экспериментальная микрокомпакция |
| `domain/compaction.ts` | `CompactionSpec`, `ParsedCompactionSpec`, `CompactionMessage`, `isCompactionMessage`, `parseThresholdSpec`, `THRESHOLD_SUMMARY_NAME` |

## Спецификация компакции (`domain/compaction.ts`)

`THRESHOLD_SUMMARY_NAME = 'threshold-summary'` (`constants.ts:156`, реэкспорт `domain/compaction.ts:3`).

`CompactionSpec` (`domain/compaction.ts:4-24`):
| Поле | Тип | Описание |
|------|-----|----------|
| `thresholdRatio?` | number | соотношение порога (0.1–1, default 0.8) |
| `protectRecentRatio?` | number | защита недавних сообщений (0–0.9, default 0.1) |
| `auto?` | boolean | автоматическая компакция (default true) |
| `summaryModel?` | AgentModelRef | модель для суммаризации |
| `preCompactNote?` | boolean | предупреждение перед компакцией (default true) |
| `microcompact?` | boolean | экспериментальная очистка tool-result (default false) |
| `microcompactKeepRounds?` | number | раунды без очистки (default 5) |
| `microcompactStepRounds?` | number | шаги между микрокомпакциями (default keepRounds) |
| `microcompactMinGainTokens?` | number | минимальный прирост (default 256) |
| `compactionFailureLimit?` | number | подряд неудач перед паузой (default 3) |
| `compactionRapidRefillSteps?` | number | окно быстрого заполнения (default 3) |
| `overflowCompaction?` | boolean | forced compaction при overflow (default true) |

`ParsedCompactionSpec` (`domain/compaction.ts:25-38`) — значения по умолчанию при парсинге `parseThresholdSpec(spec?)`:
- `thresholdRatio`: 0.8 (clamp 0.1–1)
- `protectRecentRatio`: 0.1 (clamp 0–0.9)
- `auto`: true (`raw.auto !== false`)
- `preCompactNote`: true
- `microcompactKeepRounds`: 5 (positiveInt, min 1)
- `microcompactMinGainTokens`: 256 (nonNegativeInt, min 0)
- `compactionFailureLimit`: 3
- `compactionRapidRefillSteps`: 3
- `overflowCompaction`: true (`raw.overflowCompaction !== false`)

`CompactionMessage` (`domain/compaction.ts:87-106`):
```ts
{
  role: 'assistant';
  kind: 'compaction';
  id: string;
  content: string;
  coveredFrom: number;
  coveredUntil: number;
  reason: 'threshold' | 'manual' | 'overflow';
  stats: { tokensBefore: number; tokensAfter: number; coveredCount: number; usage?: unknown };
  model?: { provider: string; model: string };
  createdAt: string;
}
```

## Поток компакции (`compaction/run.ts`)

`CompactionGuard = { consecutiveFailures: number; completedSteps: number[] }` (`compaction/run.ts:24-27`).

`compactionGuardOpen(guard, step, limits)` (`compaction/run.ts:88-109`):
1. Если `guard.consecutiveFailures >= limits.failureLimit` (default 3) → `'breaker-open'`.
2. Если недавних компакций (за `rapidRefillSteps` шагов) >= `RAPID_REFILL_MAX_COMPACTIONS` (default 3) → `'rapid-refill'`.
3. Иначе `null` (компакция разрешена).

`runSummaryPassIfDue(ctx)` (`compaction/run.ts:404`):
1. Если `agent.compaction` задан и `ref.name !== THRESHOLD_SUMMARY_NAME` — предупреждение `unknown compaction port`.
2. Спецификация: `parseThresholdSpec(ref.spec)` или дефолт.
3. Экспериментальная микрокомпакция `microcompactToolResults` если `spec.microcompact`.
4. Если `spec.auto`: `compactionGuardOpen(ctx.guard, ctx.step, limits)` — `breaker-open` при `consecutiveFailures >= 3`, `rapid-refill` при ≥3 компакциях за 3 шага.
5. `passIfDue(ctx, spec, 'threshold')`:
   - `estimateTokens` истории; если `total < available * thresholdRatio` → пропуск (или `near-threshold` предупреждение при gap 0.1).
   - `planCut` (защита недавних `protectRecentRatio` окна).
   - Хук `PreCompact` (может заблокировать → `hook-blocked`).
   - `streamSummary` (шаблон `SUMMARY_SYSTEM_PROMPT`: Objective / Important Details / Work State / Next Move / Relevant Files).
   - `CompactionMessage` → хук `PostCompact` → запись файла `writeCompactionFile` → событие `completed`.
6. Пропуск → `near-threshold` предупреждение (gap 0.1 до порога) или `pressure` событие.

Причины пропуска (`CompactionSkipReason`) (`compaction/run.ts:62-73`):
- `no-context-window` — окно модели не определено.
- `invalid-output-reserve` — зарезервировано на вывод >= окна модели.
- `near-threshold` — приближение к порогу (gap 0.1).
- `empty-history` — история пуста.
- `resume-pending` — ожидается резюме.
- `already-covered` — всё уже покрыто предыдущей компакцией.
- `no-cut-plan` — нет плана разреза.
- `hook-blocked` — хук PreCompact заблокировал.
- `empty-window` — пустое окно.
- `breaker-open` — demasiadas неудачи подряд.
- `rapid-refill` — контекст заполняется сразу после компакции.

`runForcedCompaction(ctx)` (`compaction/run.ts:446`): при overflow (причина `'overflow'`); ошибка `'context overflow: forced compaction did not shrink history'` если не сжалось.

`compactForced(ctx)` (`compaction/run.ts:512`): ручная компакция (причина `'manual'`), бросает `compaction_not_configured` если порт не задан.

## Интеграция в граф (`graph.ts`)

- `CompactionGuard` отслеживает состояние (`consecutiveFailures`, `completedSteps`) (`graph.ts:522`).
- Перед каждым `llm:generate`: `drainCompaction(runSummaryPassIfDue(compactionCtx(binding)))` — события `compaction.completed` (учёт `tokens`), `compaction.failed` (заметка `compactionFailNote`), `compaction.skipped` (заметка `compactionSkipNote`), `compaction.pressure` (заметка `contextPressureNote`) (`graph.ts:1147`).
- При `isContextOverflowError(err)`: `overflowRecovered = true`, `attempt = -1`, `runForcedCompaction(compactionCtx(currentBinding))`, повторить с той же модели (`graph.ts:1275`).
- `THRESHOLD_SUMMARY_NAME` и `overflowCompaction` из `agent.compaction?.spec?.overflowCompaction !== false` (`graph.ts:525`).
- `SUMMARY_SYSTEM_PROMPT` (`constants.ts:308-340`): шаблон с секциями Objective / Important Details / Work State / Next Move / Relevant Files.

## Заметки компакции (`llm-notes.ts` / graph.ts)

`compactionFailNote`, `contextPressureNote`, `compactionSkipNote` — теги `'compaction'`, передаются в `runLlmGenerate` как `notes` (`graph.ts:1177–1185`, `graph.ts:1235`).

## Диаграмма: алгоритм порога компакции

```mermaid
flowchart TD
    LG[llm:generate узел] --> RP[runSummaryPassIfDue(ctx)]
    RP --> CG{compactionGuardOpen}
    CG -->|consecutiveFailures >= 3| SKB[skipped: breaker-open]
    CG -->|rapidRefill >= 3 за 3 шага| SKR[skipped: rapid-refill]
    CG -->|разрешено| PF[passIfDue threshold]
    PF --> ET[estimateTokens истории]
    ET -->|total < available * 0.8| NT[near-threshold / пропуск]
    ET -->|total >= available * 0.8| PC[план среза planCut]
    PC -->|защита protectRecentRatio| HC[хук PreCompact]
    HC -->|blocked| SKH[skipped: hook-blocked]
    HC -->|ok| SS[streamSummary LLM]
    SS --> CM[CompactionMessage coveredFrom/Until]
    CM --> HC2[хук PostCompact + writeCompactionFile]
    HC2 --> EV[событие compaction.completed + учёт токенов]
    LG -->|isContextOverflowError| RFC[runForcedCompaction overflow]
    RFC -->|успех (сжалось)| Повтор[повтор запроса той же модели]
    RFC -->|не сжалось| ERR[ошибка overflow: forced compaction did not shrink history]
```

## Связанные разделы

- [18-модель-исполнения-graph.md](./18-модель-исполнения-graph.md) — узел llm:generate.
- [15-выполнение-run-engine.md](./15-выполнение-run-engine.md) — рантайм выполнения.
- [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md) — AgentDefinition.compaction.
- [54-пакеты-harnesys-ядро.md](./54-пакеты-harnesys-ядро.md) — пакет ядра.
