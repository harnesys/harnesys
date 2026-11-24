export {
  createDepartment,
  deleteDepartment,
  moveAgentToDepartment,
  renameDepartment,
  setDepartmentLead,
} from './model/department-mutations';
export { openDepartmentLeadDialog } from './ui/department-lead-dialog';
export { openDepartmentNameDialog } from './ui/department-name-dialog';
export {
  type DepartmentSettingsResult,
  openDepartmentSettingsDialog,
} from './ui/department-settings-dialog';
