import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { ToolCodeView } from '@/shared/ui/tool-code-view';
import { ToolDiffView } from '@/shared/ui/tool-diff-view';
import type { HttpDetail, TerminalDetail, ToolDetail } from '../model/tool-output';
import { ToolEntriesView, ToolGrepView } from './tool-entries-view';
export function ToolDetailView({ detail }: { detail: ToolDetail }) {
  return <div className="overflow-hidden">{renderContent(detail)}</div>;
}
function renderContent(detail: ToolDetail) {
  switch (detail.type) {
    case 'diff':
      return <ToolDiffView detail={detail} />;
    case 'file':
      return (
        <ToolCodeView
          lines={detail.lines}
          language={detail.language}
          copyText={detail.rawContent}
        />
      );
    case 'entries':
      return <ToolEntriesView detail={detail} />;
    case 'grep':
      return <ToolGrepView detail={detail} />;
    case 'terminal':
      return <TerminalView detail={detail} />;
    case 'http':
      return <HttpView detail={detail} />;
    case 'generic':
      return (
        <ToolCodeView lines={detail.lines} language={detail.language} copyText={detail.text} />
      );
  }
}
const OUTPUT_LINE_LIMIT = 100;
function truncateOutput(text: string): { text: string; truncated: boolean } {
  const lines = text.split('\n');
  if (lines.length <= OUTPUT_LINE_LIMIT) {
    return { text, truncated: false };
  }
  return { text: lines.slice(0, OUTPUT_LINE_LIMIT).join('\n'), truncated: true };
}
function TerminalView({ detail }: { detail: TerminalDetail }) {
  const stdout = truncateOutput(detail.stdout);
  const stderr = truncateOutput(detail.stderr);
  if (!detail.stdout && !detail.stderr) {
    return (
      <div className="rounded-md px-2.5 py-2 font-mono text-[12px] text-muted-foreground/60 italic">
        (no output)
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md font-mono text-[12px] leading-5">
      <ExpandableScroll previewClassName="max-h-48">
        <div className="min-w-max p-2.5 text-foreground/90">
          {detail.stderr ? (
            <div className="pb-0.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide">
              stdout
            </div>
          ) : null}
          <div className="whitespace-pre">{stdout.text || ' '}</div>
          {stdout.truncated ? <OutputTruncated /> : null}
          {detail.stderr ? (
            <>
              <div className="pt-2 pb-0.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                stderr
              </div>
              <div className="whitespace-pre text-destructive/90">{stderr.text || ' '}</div>
              {stderr.truncated ? <OutputTruncated /> : null}
            </>
          ) : null}
        </div>
      </ExpandableScroll>
    </div>
  );
}
function OutputTruncated() {
  return <div className="pt-1 text-[11px] text-muted-foreground/60">… truncated</div>;
}
function HttpView({ detail }: { detail: HttpDetail }) {
  const isJson = detail.body.trim().startsWith('{') || detail.body.trim().startsWith('[');
  let formattedBody = detail.body;
  if (isJson) {
    try {
      formattedBody = JSON.stringify(JSON.parse(detail.body), null, 2);
    } catch {}
  }
  const lines = formattedBody.split('\n').map((text, idx) => ({ number: idx + 1, text }));
  return (
    <ToolCodeView lines={lines} language={isJson ? 'json' : undefined} copyText={formattedBody} />
  );
}
