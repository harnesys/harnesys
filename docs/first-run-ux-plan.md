# First-Run UX — план (клиентская часть)

Границы: только `apps/webui`. Сервер, `packages/contracts`, схемы API не трогаем. Демо-доска и задачи создаются существующими клиентскими вызовами (`createIssueBoard`, `createIssueRecord`) — у всех шаблонов `rules: []` (`packages/contracts/src/board-templates.ts`), поэтому ничего не зафайрится и провайдер не нужен. Состояние онбординга — в `localStorage` (в репозитории это норма: прямые вызовы с префиксными ключами, см. `entities/plan/model/plan.store.ts`).

Тексты UI (подсказки, названия задач, чеклист) — английские: правило репозитория «frontend fully in English». План на русском — по запросу.

## Что делаем (4 блока)

1. **Пропуск пустых шагов визарда** — шаги Provider/Models/Agents показываются и проходятся только если пункт ещё не выполнен. Рельс и навигация строятся от реального состояния, а не от статичного списка.
2. **Микро-обратная связь** — у каждого шага визарда подпись в одну строку «что это даёт»; на Models появляется «Skip for now» (паритет с Presets).
3. **Демо-доска** — при первом входе на desk создаётся доска «Getting started» c 3–4 задачами-руководствами (что где лежит, как запустить агента, как двигать задачу).
4. **Чеклист у колокольчика** — кнопка `ListChecks` с бейджем `2/6` рядом с `InboxBell`, по клику — shadcn `Popover` со списком пунктов (done/pending) и кнопкой «скрыть».

## Источник состояния

Серверного read-model нет — всё выводится на клиенте из уже существующих запросов:

| Пункт чеклиста | Done когда |
|---|---|
| Provider connected | `listProviders(orgId).length > 0` |
| Models attached | у любого провайдера есть привязанные модели |
| Agent created | `listAgents(orgId).length > 0` (дефолтный Genie может закрыть пункт сразу) |
| Board created | `listIssueBoards(orgId).length > 0` |
| First issue created | `listIssues(orgId).length > 0` |
| First issue done | есть issue в статусе с категорией `finished` |

Визард использует первые три пункта: `remainingSteps = [provider, models, agents].filter(not done)`.

## localStorage

Один версионированный ключ на браузер (не на org — онбординг одноразовый):

`harnesys.onboarding.v1` → `{ starterBoardId: string | null, starterBoardSeededAt: string | null, checklistDismissedAt: string | null }`

- `starterBoardId` пишется сразу после создания доски — защита от повторного сидинга при частичном сбое.
- Задачи добиваются по заголовкам: перед созданием проверяем, нет ли уже задачи с таким заголовком на этой доске.
- Ошибки LS (приватный режим) — оборачиваем в try/catch, фича просто не включается, desk работает как раньше.

## Файлы

### Новые

- `apps/webui/src/features/onboarding/model/onboarding-progress.ts` — чистые функции: вычисление пунктов чеклиста из данных, `remainingWizardSteps`, `firstIncompleteStep`.
- `apps/webui/src/features/onboarding/model/onboarding-storage.ts` — чтение/запись `harnesys.onboarding.v1`, try/catch.
- `apps/webui/src/features/onboarding/model/starter-board.ts` — тексты демо-задач + идемпотентный сидинг через `createIssueBoard` / `createIssueRecord`.
- `apps/webui/src/widgets/onboarding-checklist/ui/onboarding-checklist.tsx` — триггер с бейджем + `Popover` (`shared/ui/popover.tsx`, как `board-columns-popover.tsx`).
- `apps/webui/src/widgets/onboarding-checklist/model/use-onboarding-progress.ts` — хук над существующими query-хуками провайдеров/агентов/досок/задач.

### Изменяемые

- `apps/webui/src/widgets/project-sidebar/ui/project-sidebar.tsx` — `OnboardingChecklist` рядом с `InboxBell`.
- `apps/webui/src/features/onboarding/model/onboarding-copy.ts` — подписи шагов (subtitle) и «Skip for now» для Models.
- `apps/webui/src/features/onboarding/ui/onboarding-shell.tsx` — рельс из переданного списка шагов + subtitle под активным шагом.
- `apps/webui/src/pages/onboarding/create-page.tsx` — после создания org навигация на первый незакрытый шаг.
- `apps/webui/src/pages/onboarding/provider-page.tsx`, `models-page.tsx`, `presets-page.tsx` — следующий шаг вычисляется через `firstIncompleteStep`, номер/список шагов передаётся динамически.
- `apps/webui/src/features/onboarding/ui/onboarding-provider-models.tsx` — кнопка Skipping.
- `apps/webui/src/pages/project/ui/project-page.tsx` — одноразовый вызов сидинга демо-доски на mount (guard по LS + in-flight ref).

## Этапы

1. **Чистая модель** — `onboarding-progress.ts` + `onboarding-storage.ts`: типы, вычисление пунктов, чтение/запись LS. Никакого UI.
2. **Чеклист** — хук + виджет + вставка в сайдбар. Проверка: при пустой org `0/6`, после подключения провайдера цифра меняется, dismiss пишется в LS.
3. **Визард** — динамический рельс, skip на Models, subtitle-копирайт, навигация от `firstIncompleteStep`.
4. **Демо-доска** — сидинг на desk, идемпотентность по `starterBoardId` + заголовкам задач.
5. **Финальный проход** — один ревью всего диффа, затем один консолидированный фикс.

## Проверки

- `tsc --noEmit`, `biome check .`, ручной прогон сценариев: (а) чистая org → визард идёт по всем шагам; (б) org с провайдером → шаг Provider пропущен; (в) все пункты done → визард сразу на desk, чеклист скрыт; (г) очистка LS → демо-доска создаётся заново один раз.
- Новые тесты не пишем: по политике до ручного теста фичи спеки не добавляются.

## Риски и решения

- **Гонка сидинга** при двух вкладках: in-flight ref + проверка `starterBoardId` перед созданием; худший случай — дубль доски, приемлемо для v1, чинится добавлением заголовка в проверку.
- **Демо-доска в мультиорг**: флаг браузерный, доска создаётся один раз в первой посещённой org; в остальных — только чеклист.
- **Чеклист «сходится» со временем сам** (данные живые, LS только про dismiss и сидинг) — отдельного «прошёл онбординг» флага нет, ничего не протухает.
- **Туториал-попапы по элементам** — вне v1: сначала чеклист, движок тура отдельной задачей.

## Вне скоупа

- Любые серверные изменения и новые эндпоинты.
- Изменения `packages/contracts`.
- Element-anchored tour, «праздник» после 6/6, аналитика прохождения.
