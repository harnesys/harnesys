export type {
  AutomationConnection,
  AutomationStatus,
  ClientAutomation,
} from './model/automation';
export {
  automationInk,
  automationStatusLabel,
  CORE_AUTOMATION_INTEGRATION_ID,
  isCoreAutomation,
  isScheduleAutomationKind,
  toClientAutomation,
} from './model/automation';
export { useAutomationStore } from './model/automation.store';
