# First-Run UX — план

Границы: код — только `apps/webui`. Плюс отдельный контентный поток: актуализация скилла `apps/server/assets/skills/harnesys-system` (только markdown, без изменения серверного кода). Контракты и схемы API не трогаем. Демо-данные создаются существующими клиентскими вызовами (`createIssueBoard`, `createIssueRecord`, `createDashboard`): у шаблонов досок `rules: []`, поэтому ничего не зафайрится и провайдер для сидинга не нужен.

Состояние онбординга — в `localStorage` (в репозитории это норма: прямые вызовы с префиксными ключами, см. `entities/plan/model/plan.store.ts`).

Тексты UI — английские (правило репозитория). План на русском — по запросу.

## Пять блоков

1. **Пропуск пустых шагов визарда** — Provider/Models/Agents показываются и проходятся только если пункт не выполнен; рельс и навигация строятся от реального состояния.
2. **Микро-обратная связь** — у каждого шага подпись «что это даёт»; на Models кнопка «Skip for now» (паритет с Presets).
3. **Демо-доска «Getting started»** — при первом входе на desk: доска + 4 задачи-руководства, одна из них про генерацию дашбордов агентом.
4. **Чеклист у колокольчика** — `ListChecks` + бейдж `2/7` рядом с `InboxBell`, `Popover` со списком done/pending и dismiss.
5. **Стартовые булиты плавающего чата** — `ASSISTANT_STARTERS` в `widgets/chat-transcript/ui/thread-empty.tsx` переписываются под онбординг и делаются фазозависимыми: первые вопросы ведут по тому, что ещё не настроено.

Отдельный поток: **актуализация `harnesys-system`** (см. ниже) — контент для ассистента, чтобы он мог помочь по любому вопросу с первых минут.

## Источник состояния чеклиста

Серверного read-model нет — всё выводится из уже существующих клиентских запросов:

| Пункт | Done когда | Query |
|---|---|---|
| Provider connected | ≥1 провайдер | `listProviders` |
| Models attached | у провайдера есть модели | тот же ответ |
| Agent created | ≥1 агент (дефолтный Genie может закрыть сразу) | `listAgents` |
| Dashboard created | ≥1 дашборд | `listDashboards` (`shared/api/dashboards.ts`) |
| Board created | ≥1 доска (демо-доска закрывает) | `listIssueBoards` |
| First issue created | ≥1 issue (демо-задачи закрывают) | `listIssues` |
| First issue done | есть issue с категорией `finished` | `listIssues` |

Итого 7 пунктов → бейдж `N/7`. Визард использует первые три: `remainingWizardSteps = [provider, models, agents].filter(not done)`.

## localStorage

Один версионированный ключ на браузер:

`harnesys.onboarding.v1` → `{ starterBoardId: string | null, starterBoardSeededAt: string | null, checklistDismissedAt: string | null }`

- `starterBoardId` пишется сразу после создания доски — защита от повторного сидинга при частичном сбое.
- Задачи добиваются по заголовкам (нет задачи с таким заголовком на доске — создаём).
- Ошибки LS (приватный режим) — try/catch, фича просто не включается.

## Демо-доска и дашборды в обучении

Доска «Getting started» (шаблон `dev`), 4 задачи с текстом-руководством в описании:

1. **Take the tour** — что где лежит: desk, boards, inbox, agents, automations, dashboards.
2. **Run your first agent** — как запустить агента на задаче, что произойдёт с доской.
3. **Ask Genie to build your dashboards** — задача с готовым промптом: «describe your company/processes in one paragraph, Genie will generate dashboards» (Prompts/Commands, модели, расходы, флот, очередь). Ответ агента создаёт дашборды через существующий `createDashboard` API — это уже работает, обучение продаёт существующую фичу.
4. **Move a task across the board** — drag между статусами, что такое правила и почему сейчас «No rule — nothing fires here».

Демо-дашборд сидингом НЕ создаём: ценность именно в том, что пользователь просит агента сгенерить его под себя; пункт чеклиста `Dashboard created` закрывается после этого.

## Стартовые булиты ассистента

- Сейчас: статичный массив `ASSISTANT_STARTERS` (`thread-empty.tsx`, строки 21–25), рендерится в `AgentBulletList` при `assistant`.
- Делаем: булиты собираются из `onboarding-progress` — до 3 незакрытых пунктов, каждый со своей фразой-действием, плюс один общий «What can I do in Harnesys?». Если всё закрыто — прежние общие стартеры.
- Порядок: онбординговые первыми, чтобы первый клик вёл к следующему реальному шагу.
- Файлы: `features/onboarding/model/onboarding-copy.ts` (тексты стартеров по пунктам), `thread-empty.tsx` (подмена массива на вычисляемый).

## Актуализация скилла harnesys-system

Скилл рассинхронизирован с кодом: `SKILL.md` ссылается на `references/webui.md`, которого **нет** в каталоге (есть presets, runtime, skills, packs, data-layout); в `packs.md` зашито «21 capability pack» — число и состав требуют сверки с реестром пакетов; новые фичи (дашборды, плавающий ассистент, boards/issues, онбординг-визард, integrations add-on model, worktrees/git-панель) не описаны.

План правки (только markdown, без серверного кода):

1. **Сверка `packs.md` с кодом** — источник истины реестр пакетов в `packages/harnesys`; выписать реальные id, инструменты, формы значений, deferred/direct экспозицию. Убрать хардкод чисел, заменить на «inventory generated from the pack registry» с актуальным списком.
2. **Создать `references/webui.md`** — карта навигации по фактическим роутам `apps/webui/src/app/routes.tsx`: desk, boards/issues, inbox, agents, dashboards (+ генерация через ассистента), channels, sources, automations, git, terminal, settings, онбординг-визард и что где настраивается.
3. **Обновить `SKILL.md`** — таблица референсов по фактическим файлам; добавить раздел про плавающего ассистента (Genie chief-of-staff) и стартовые булиты как точку входа для пользователя; обновить описание платформы под текущий состав (дашборды, доски, интеграции как аддоны).
4. **Проверить `presets.md`/`skills.md`/`runtime.md`/`data-layout.md`** — сверить имена пресетов, поля, пути с кодом; удалить устаревшее.
5. **Верификация** — каждый `references/*.md` из таблицы существует; grep по скиллу не находит несуществующих путей/чисел; все упомянутые имена инструментов и пакетов находятся в коде.

Работать можно параллельно с клиентской частью: зона файлов — только `apps/server/assets/skills/harnesys-system/**` (единственное исключение из «не трогаем сервер»: чистая документация, согласовано).

## Файлы

### Новые (клиент)

- `features/onboarding/model/onboarding-progress.ts` — чистые функции: пункты чеклиста из данных, `remainingWizardSteps`, `firstIncompleteStep`.
- `features/onboarding/model/onboarding-storage.ts` — чтение/запись `harnesys.onboarding.v1`, try/catch.
- `features/onboarding/model/starter-board.ts` — тексты демо-задач + идемпотентный сидинг через `createIssueBoard`/`createIssueRecord`.
- `widgets/onboarding-checklist/ui/onboarding-checklist.tsx` — триггер с бейджем + `Popover` (`shared/ui/popover.tsx`, паттерн `board-columns-popover.tsx`).
- `widgets/onboarding-checklist/model/use-onboarding-progress.ts` — хук над существующими query-хуками.

### Изменяемые (клиент)

- `widgets/project-sidebar/ui/project-sidebar.tsx` — `OnboardingChecklist` рядом с `InboxBell`.
- `widgets/chat-transcript/ui/thread-empty.tsx` — фазозависимые стартеры ассистента.
- `features/onboarding/model/onboarding-copy.ts` — subtitle шагов, «Skip for now» для Models, тексты стартеров по пунктам.
- `features/onboarding/ui/onboarding-shell.tsx` — рельс из переданного списка шагов + subtitle.
- `pages/onboarding/create-page.tsx`, `provider-page.tsx`, `models-page.tsx`, `presets-page.tsx` — навигация от `firstIncompleteStep`.
- `features/onboarding/ui/onboarding-provider-models.tsx` — кнопка Skip.
- `pages/project/ui/project-page.tsx` — одноразовый сидинг на mount (guard по LS + in-flight ref).

### Изменяемые (контент скилла)

- `apps/server/assets/skills/harnesys-system/SKILL.md`, `references/*.md` + новый `references/webui.md`.

## Этапы

1. **Чистая модель** — `onboarding-progress.ts` + `onboarding-storage.ts`.
2. **Чеклист** — хук + виджет + в сайдбар; проверка `0/7 → N/7` и dismiss.
3. **Визард** — динамический рельс, skip, subtitle, навигация.
4. **Демо-доска** — сидинг с идемпотентностью.
5. **Стартеры ассистента** — фазозависимые булиты.
6. **Скилл** — аудит и переписывание reference-файлов (можно отдельным агентом параллельно с 1–5).
7. **Финальный проход** — один ревью всего диффа, затем один консолидированный фикс.

## Проверки

- `tsc --noEmit`, `biome check .`.
- Ручные сценарии: (а) чистая org → визард по всем шагам; (б) org с провайдером → шаг Provider пропущен; (в) всё закрыто → визард сразу на desk, чеклист скрыт, стартеры ассистента — общие; (г) очистка LS → демо-доска создаётся заново один раз; (д) в чате ассистента первый булит соответствует первому незакрытому пункту.
- Скилл: все файлы из таблицы существуют, названия/числа сверены с кодом.
- Новые тесты не пишем: по политике до ручного теста фичи спеки не добавляются.

## Риски

- **Гонка сидинга** при двух вкладках: in-flight ref + проверка `starterBoardId`; худший случай — дубль доски, приемлемо для v1.
- **Демо-доска в мультиорг**: флаг браузерный, создаётся один раз в первой посещённой org.
- **Скилл — drop-in ассет**: правки только в markdown, никакие имена файлов/директорий не переименовываем, чтобы не ломать `load_skill`.
- **Стартеры в чужом виджете**: `AgentBulletList` — общий компонент, меняем только входной массив, не его поведение.

## Вне скоупа

- Серверный код, `packages/contracts`, новые эндпоинты.
- Сидинг демо-дашборда и element-anchored tour.
- Аналитика прохождения онбординга.

## Реализация (факт и отклонения)

Клиентская часть сделана: `onboarding-progress.ts`, `onboarding-storage.ts`, `onboarding-steps.ts`, `wizard-route.ts`, `starter-board.ts`, `use-onboarding-progress.ts`, `ui/onboarding-checklist.tsx`, `widgets/chat-transcript/ui/assistant-empty-thread.tsx` + правки страниц онбординга, сайдбара и `project-page.tsx`.

Отклонения от плана:

- Чеклист живёт в `features/onboarding/ui`, а не в отдельном `widgets/`-пакете: сайдбар уже монтирует фичи (`OrgHeader`), отдельная обёртка ничего не добавляла.
- Шаг Provider при уже подключённом провайдере не показывает «Already connected»: страница сразу редиректит на следующий незакрытый шаг, ветка `connected` вместе с её копирайтом удалена. Подключить второй провайдер во время онбординга больше нельзя, это делается в Settings.
- На шаге Models появилась кнопка `Skip for now` (паритет с Presets), при уже прикреплённых моделях шаг пропускается при входе, но добавление модели в текущей сессии редирект не вызывает.
- Пункты чеклиста `board` и `issue` закрываются демо-доской и её задачами, поэтому бейдж стартует с `2/7`.
- Демо-доска автоматически открывается вкладкой на первом входе (только при первичном создании, не при восстановлении после сбоя).
- Вместе с доской сидится правило `Todo → assign Genie`: задача, попавшая в Todo, назначается Genie и запускается. Правило создаётся только когда в org уже есть агент (иначе повторяется на следующем входе на desk, флаг `starterRuleSeededAt`). Ограничение движка: условия «назначен на агента» нет, поэтому «файрить назначенного» нельзя — правило назначает агента само; это уже серверная доработка.
