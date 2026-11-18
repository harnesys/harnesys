import type {
  ActionList,
  DashboardCatalogEntryDto,
  WidgetDoc,
  WidgetItem,
} from '@harnesys/contracts';
import { PrimitiveIdSchema } from '@harnesys/contracts';
import { ChevronDownIcon, GripVerticalIcon, TrashIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bindingPathOptions } from '@/features/dashboards/model/binding-paths';
import { propFieldSpecs } from '@/features/dashboards/model/prop-fields';
import {
  defaultPropsFor,
  formPrimitives,
  primitiveEvents,
  primitiveIcon,
  primitiveTitle,
} from '@/features/dashboards/model/widget-form';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ActionEditor, ActionListEditor } from './inspector-action';
import { PropEditor } from './inspector-config';
import { ItemBindingsEditor } from './item-bindings';

interface ItemFormProps {
  orgId: string;
  catalog: DashboardCatalogEntryDto[];
  item: WidgetItem;
  doc: WidgetDoc;
  index: number;
  focused: boolean;
  onFocus: () => void;
  onChange: (item: WidgetItem) => void;
  onRemove: () => void;
}

/** One primitive box: layout slot, descriptor props, data bindings, event actions. */
export function ItemForm({
  orgId,
  catalog,
  item,
  doc,
  index,
  focused,
  onFocus,
  onChange,
  onRemove,
}: ItemFormProps): React.ReactNode {
  const [open, setOpen] = useState(focused);
  useEffect(() => {
    if (focused) {
      setOpen(true);
    }
  }, [focused]);
  const Icon = primitiveIcon(item.primitive);
  const fields = propFieldSpecs(item.primitive);
  const options = bindingPathOptions(doc, catalog, orgId);
  const events = primitiveEvents(item.primitive);

  const switchPrimitive = (next: string): void => {
    const parsed = PrimitiveIdSchema.safeParse(next);
    if (!parsed.success || parsed.data === item.primitive) {
      return;
    }
    onChange({
      ...item,
      primitive: parsed.data,
      props: defaultPropsFor(parsed.data),
      bindings: {},
      on: {},
      action: undefined,
    });
  };

  return (
    <div className="flex flex-col text-[12px]">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          aria-label="Toggle primitive form"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          onClick={() => {
            setOpen((value) => !value);
            onFocus();
          }}
        >
          <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {item.title ?? primitiveTitle(item.primitive)}
          </span>
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
            {item.rect.x},{item.rect.y} · {item.rect.w}×{item.rect.h}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Collapse"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDownIcon
            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Remove primitive" onClick={onRemove}>
          <TrashIcon />
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-border/40 border-t px-2.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Primitive</span>
            <Select value={item.primitive} onValueChange={(next) => next && switchPrimitive(next)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Primitive type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formPrimitives().map((primitive) => (
                  <SelectItem key={primitive.id} value={primitive.id}>
                    {primitive.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Box name</span>
            <Input
              value={item.title ?? ''}
              placeholder={`#${index + 1} ${primitiveTitle(item.primitive)}`}
              onChange={(event) => onChange({ ...item, title: event.target.value || undefined })}
              className="h-7 w-44 text-[12px]"
              aria-label="Primitive name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
              Props
            </p>
            <PropEditor
              primitive={item.primitive}
              props={item.props}
              options={options}
              onChange={(props) => onChange({ ...item, props })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
              Bindings
            </p>
            <ItemBindingsEditor
              item={item}
              fields={fields}
              options={options}
              onChange={(bindings) => onChange({ ...item, bindings })}
            />
          </div>
          {events.map((event) => (
            <div key={event} className="flex flex-col gap-1.5">
              <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
                {eventLabel(event)}
              </p>
              <ActionListEditor
                actionList={item.on[event]}
                sources={doc.sources}
                stateKeys={Object.keys(doc.state)}
                orgId={orgId}
                onChange={(next) => onChange({ ...item, on: withEvent(item.on, event, next) })}
              />
            </div>
          ))}
          {item.action ? (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
                Legacy action
              </p>
              <ActionEditor
                action={item.action}
                sources={doc.sources}
                stateKeys={Object.keys(doc.state)}
                orgId={orgId}
                onChange={(action) => onChange({ ...item, action })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function eventLabel(event: string): string {
  const spaced = event.replace(/([A-Z])/g, ' $1').toLowerCase();
  return `On ${spaced}`;
}

function withEvent(
  on: Record<string, ActionList>,
  event: string,
  next: ActionList | undefined,
): Record<string, ActionList> {
  const result = { ...on };
  if (next === undefined) {
    delete result[event];
  } else {
    result[event] = next;
  }
  return result;
}
