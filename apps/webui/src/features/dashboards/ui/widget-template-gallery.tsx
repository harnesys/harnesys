import type { WidgetTemplate } from '@harnesys/contracts';
import { WIDGET_TEMPLATES } from '@harnesys/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { findIcon } from '../model/icon-options';

interface WidgetTemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (template: WidgetTemplate) => void;
}

/** Starter docs offered behind "Add widget"; every template is a shared contract object. */
export function WidgetTemplateGallery({
  open,
  onOpenChange,
  onPick,
}: WidgetTemplateGalleryProps): React.ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layoutKey="widget-template-gallery"
        className="sm:max-w-xl"
        data-testid="widget-template-gallery"
      >
        <DialogHeader>
          <DialogTitle>Add widget</DialogTitle>
          <DialogDescription>
            Start from a working document; everything stays editable in the inspector.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto">
          {WIDGET_TEMPLATES.map((template) => {
            const TemplateIcon = findIcon(template.doc.icon);
            return (
              <button
                key={template.id}
                type="button"
                className="flex h-full flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-muted/40"
                onClick={() => onPick(template)}
                data-testid={`widget-template-${template.id}`}
              >
                <span className="flex items-center gap-1.5 font-medium text-[13px]">
                  {TemplateIcon ? (
                    <TemplateIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  {template.title}
                </span>
                <span className="text-[11px] text-muted-foreground">{template.description}</span>
                <span className="mt-auto font-mono text-[9px] text-muted-foreground/70">
                  {template.doc.items.length} items · {template.doc.sources.length} sources
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
