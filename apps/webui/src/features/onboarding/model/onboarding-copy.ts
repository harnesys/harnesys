import type { OnboardingChecklistKey, OnboardingWizardStepId } from './onboarding-progress';

export interface OnboardingStep {
  title: string;
  body: string;
}

export const ONBOARDING_TITLE = 'Multi-agent fleet on hosts you control';

export const ONBOARDING_SUB =
  'One organization coordinates agents and machines. Attach sources, place runs across the fleet, and keep approvals in one place.';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Create an organization',
    body: 'This machine becomes the relay. Name it something you will recognize later.',
  },
  {
    title: 'Connect a provider',
    body: 'Add an API or local runtime and attach at least one model before you enter the desk.',
  },
  {
    title: 'Create an agent and run it',
    body: 'Open a thread, send a task, and follow tool calls and approvals in the journal.',
  },
];

export const CREATE_PANEL_TITLE = 'Create organization';
export const CREATE_PANEL_BODY =
  'This host becomes the relay. You can enroll more machines later from Fleet.';
export const CREATE_NAME_LABEL = 'Organization name';
export const CREATE_NAME_HINT = 'Shown in the org switcher.';
export const CREATE_WORKSPACE_LABEL = 'Working folder';
export const CREATE_WORKSPACE_HINT =
  'Optional absolute path on this host. Leave empty to use the managed workspace (~/.harnesys/data/orgs/<org>/workspace).';
export const CREATE_SUBMIT = 'Create organization';

export const JOIN_PANEL_TITLE = 'Join a relay';
export const JOIN_PANEL_BODY =
  'Enroll this host as a worker. You need the relay URL, organization id, and invite code.';
export const JOIN_SUBMIT = 'Join organization';

export const SIGN_IN_PANEL_TITLE = 'Sign in to Harnesys';
export const SIGN_IN_PANEL_BODY =
  'Sign in with your Harnesys login. Access stays on this page; the refresh token lives in an HTTP-only cookie on the relay.';
export const SIGN_IN_LOGIN_LABEL = 'Login';
export const SIGN_IN_LOGIN_HINT = 'Your Harnesys account login.';
export const SIGN_IN_PASSWORD_LABEL = 'Password';
export const SIGN_IN_PASSWORD_HINT = 'Forgotten passwords reset with a new owner init.';
export const SIGN_IN_SUBMIT = 'Sign in';

export const SIGN_UP_PANEL_TITLE = 'Create the owner account';
export const SIGN_UP_PANEL_BODY =
  'This installation has no users yet. Set up the first owner account to start using Harnesys. Owner setup is only available from this machine.';
export const SIGN_UP_LOGIN_LABEL = 'Login';
export const SIGN_UP_LOGIN_HINT = 'You will use it to sign in later.';
export const SIGN_UP_NAME_LABEL = 'Name';
export const SIGN_UP_NAME_HINT = 'Shown to other members. Defaults to the login.';
export const SIGN_UP_PASSWORD_LABEL = 'Password';
export const SIGN_UP_PASSWORD_HINT = 'Stored as an argon2id hash on this machine.';
export const SIGN_UP_SUBMIT = 'Create owner account';

export const PROVIDER_PANEL_TITLE = 'Connect a provider';
export const PROVIDER_PANEL_BODY =
  'Agents need at least one model before you can run work. You can add more providers later in Settings.';
export const PROVIDER_NAME_LABEL = 'Provider name';
export const PROVIDER_NAME_HINT = 'Shown next to models when you create an agent.';
export const PROVIDER_KEY_LABEL = 'API key';
export const PROVIDER_KEY_HINT =
  'Stored in the org vault. Leave empty for local runtimes that do not need a key.';
export const PROVIDER_CONNECT_SUBMIT = 'Connect and discover';
export const PROVIDER_MODELS_TITLE = 'Attach models';
export const PROVIDER_MODELS_BODY =
  'Pick the models this org can use. Attach at least one to continue.';
export const PROVIDER_MODELS_SKIP = 'Skip for now';
export const PROVIDER_DISCOVER = 'Discover';
export const PROVIDER_DISCOVERING = 'Discovering…';
export const PROVIDER_MANUAL_LABEL = 'Model name';
export const PROVIDER_MANUAL_HINT = 'Use this when discover is empty or the runtime is offline.';
export const PROVIDER_MANUAL_ATTACH = 'Attach';
export const PROVIDER_CONTINUE = 'Continue to desk';
export const PROVIDER_ATTACHED = 'Attached';
export const PROVIDER_AVAILABLE = 'From provider';

export const PRESETS_STEP_TITLE = 'Add agents';
export const PRESETS_STEP_BODY =
  'Genie is created by default and always selected. Pick more presets from the library; you can change anything later.';
export const PRESETS_DEFAULT_BADGE = 'Default';
export const PRESETS_DEFAULT_PRESET_ID = 'harnesys/genie';
export const PRESETS_MODEL_LABEL = 'Model for all';
export const PRESETS_MODEL_HINT = 'Used for every agent you create below.';
export const PRESETS_SKIP = 'Skip for now';
export const PRESETS_CREATE = 'Create';
export const ONBOARDING_BACK = 'Back';

export const CHOOSE_CREATE_CTA = 'Create organization';
export const CHOOSE_CREATE_HINT = 'Use this if you are starting the fleet on this machine.';
export const CHOOSE_JOIN_CTA = 'Join with invite';
export const CHOOSE_JOIN_HINT = 'Use this if another machine already runs the relay.';
export const CHOOSE_BACK = 'Back';

export const ONBOARDING_FOOTER = 'Data stays on your hosts. Secrets live in the org vault.';

export const WIZARD_STEP_LABELS: Record<OnboardingWizardStepId, string> = {
  provider: 'Provider',
  models: 'Models',
  agents: 'Agents',
};

export const WIZARD_STEP_HINTS: Record<OnboardingWizardStepId, string> = {
  provider: 'Agents need a model to think with. Connect one API or local runtime.',
  models: 'Pick the models this org can use. Discovery lists what the provider serves.',
  agents: 'Genie is the default chief of staff. Add specialists only if you need them.',
};

export const CHECKLIST_TITLE = 'Getting set up';
export const CHECKLIST_BODY =
  'Finish these to get the most out of Harnesys. Genie in the assistant can do most of it for you.';
export const CHECKLIST_HIDE = 'Hide checklist';

export const CHECKLIST_LABELS: Record<OnboardingChecklistKey, string> = {
  provider: 'Connect a provider',
  models: 'Attach models',
  agents: 'Create an agent',
  dashboard: 'Build a dashboard',
  board: 'Create a board',
  issue: 'Add the first issue',
  issueDone: 'Finish an issue',
};

export const CHECKLIST_HINTS: Record<OnboardingChecklistKey, string> = {
  provider: 'An API or local runtime your agents can call.',
  models: 'At least one model attached to that provider.',
  agents: 'Genie comes first; specialists after.',
  dashboard: 'Ask Genie to draw dashboards for your company.',
  board: 'Boards hold the tasks and their column rules.',
  issue: 'A task on a board, from idea to done.',
  issueDone: 'Move the task to Todo so the rule fires, then close it.',
};

export const CHECKLIST_STARTERS: Record<OnboardingChecklistKey, string> = {
  provider: 'Help me connect an AI provider so my agents can run.',
  models: 'Help me choose and attach the right models.',
  agents: 'Create an agent shaped around how my team works.',
  dashboard: 'Build dashboards for my company: spend, fleet health, and the work in flight.',
  board: 'Set up a board that matches how my team works.',
  issue: "Create my first issues. I'll describe the project and the work.",
  issueDone: 'Show me how a board rule fires an agent on a task.',
};

export const ASSISTANT_FALLBACK_STARTERS = [
  'Show me around. What can I do in Harnesys?',
  'Create a project and connect a repository.',
  'Set up my first agent and a daily automation.',
];
