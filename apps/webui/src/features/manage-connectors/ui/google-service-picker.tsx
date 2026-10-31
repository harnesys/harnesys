import type { GoogleOAuthService } from '@harnesys/contracts';
import {
  CalendarIcon,
  FileTextIcon,
  HardDriveIcon,
  MailIcon,
  SearchIcon,
  SheetIcon,
  VideoIcon,
} from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import { GOOGLE_SERVICES, googleServiceInfo } from '../model/google-services';
import { ConnectorCard } from './connector-card';

const SERVICE_ICONS: Record<GoogleOAuthService, typeof CalendarIcon> = {
  drive: HardDriveIcon,
  gmail: MailIcon,
  calendar: CalendarIcon,
  youtube: VideoIcon,
  sheets: SheetIcon,
  docs: FileTextIcon,
  search_console: SearchIcon,
};

interface GoogleServicePickerProps {
  selected: GoogleOAuthService[];
  onChange: (next: GoogleOAuthService[]) => void;
  testId?: string;
}

export function GoogleServicePicker({ selected, onChange, testId }: GoogleServicePickerProps) {
  const toggle = (key: GoogleOAuthService) => {
    if (selected.includes(key)) {
      onChange(selected.filter((entry) => entry !== key));
      return;
    }
    onChange([...selected, key]);
  };

  const youtubeLocked = selected.includes('youtube');
  const othersLocked = selected.some((key) => key !== 'youtube');

  return (
    <div className="flex flex-col gap-2" data-testid={testId ?? 'connectors-google-service-picker'}>
      {GOOGLE_SERVICES.map((service) => {
        const checked = selected.includes(service.key);
        const controlId = `google-service-check-${service.key}`;
        const disabled = service.key === 'youtube' ? othersLocked : youtubeLocked;
        return (
          <div
            key={service.key}
            className={`flex items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/5 transition-colors ${disabled ? 'opacity-50' : 'hover:bg-muted/50'}`}
          >
            <Checkbox
              id={controlId}
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => toggle(service.key)}
              data-testid={`connectors-google-service-${service.key}`}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <label
                htmlFor={controlId}
                className={`flex w-fit items-center gap-2 font-medium text-sm ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {service.label}
                {service.sensitive ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-normal text-[11px] text-muted-foreground">
                    shows a Google warning
                  </span>
                ) : null}
              </label>
              <span className="text-muted-foreground text-xs leading-4">{service.summary}</span>
              <span className="text-[11px] text-muted-foreground/80">{service.abilities}</span>
            </span>
          </div>
        );
      })}
      {youtubeLocked ? (
        <p className="text-muted-foreground text-xs leading-4">
          Google doesn&apos;t allow YouTube together with other services — connect YouTube as a
          separate account.
        </p>
      ) : null}
    </div>
  );
}

export function GoogleServiceChips({ services }: { services: GoogleOAuthService[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {services.map((key) => {
        const { label } = googleServiceInfo(key);
        const Icon = SERVICE_ICONS[key];
        return (
          <span
            key={key}
            className="flex items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground uppercase leading-4 tracking-wide"
            title={`${label} granted`}
          >
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </span>
  );
}

export function GoogleServiceSummaryLine({ services }: { services: GoogleOAuthService[] }) {
  if (services.length === 0) {
    return <p className="text-destructive text-xs">Pick at least one service to continue.</p>;
  }
  return (
    <ConnectorCard className="p-3">
      <p className="font-medium text-xs">Google will ask to grant</p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground text-xs leading-4">
        {services.map((key) => {
          const service = googleServiceInfo(key);
          return (
            <li key={key}>
              {service.label} — {service.abilities.toLowerCase()}
            </li>
          );
        })}
      </ul>
    </ConnectorCard>
  );
}
