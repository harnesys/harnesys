import { useEffect } from 'react';
import {
  AppUpdateToaster,
  runStartupUpdateCheck,
  ServerUpdateToaster,
} from '@/features/app-update';

export function AppUpdateCheck() {
  useEffect(() => {
    runStartupUpdateCheck();
  }, []);
  return (
    <>
      <AppUpdateToaster />
      <ServerUpdateToaster />
    </>
  );
}
