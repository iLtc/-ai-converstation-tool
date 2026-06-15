import type { DraftTurn } from '../../api/types.ts';
import type { BriefContent, AnswersContent, DraftContent, FollowupContent } from '@app/shared';
import { cn } from '../../lib/utils.ts';

const LABELS: Record<DraftTurn['kind'], string> = {
  brief: 'Brief — you', answers: 'AI answers', draft: 'Draft', edit: 'Your edit', followup: 'Follow-up — you',
};

export function TurnView({ turn, isCurrentDraft, onRestore }: {
  turn: DraftTurn; isCurrentDraft: boolean; onRestore?: () => void;
}) {
  const tone =
    turn.kind === 'answers' ? 'bg-amber-50 border-amber-200'
    : turn.kind === 'draft' || turn.kind === 'edit' ? 'bg-emerald-50 border-emerald-200'
    : turn.kind === 'followup' ? 'bg-sky-50 border-sky-200'
    : 'bg-muted/40';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {LABELS[turn.kind]}{isCurrentDraft ? ' · current' : ''}
        </span>
        {onRestore && !isCurrentDraft && (turn.kind === 'draft' || turn.kind === 'edit') && (
          <button className="text-[10px] text-sky-700 hover:underline" onClick={onRestore}>↺ restore</button>
        )}
      </div>
      <div className={cn('rounded-lg border p-3 text-sm', tone, !isCurrentDraft && (turn.kind === 'draft' || turn.kind === 'edit') && 'opacity-70')}>
        {renderContent(turn)}
      </div>
    </div>
  );
}

function renderContent(turn: DraftTurn) {
  switch (turn.kind) {
    case 'brief': {
      const c = turn.content as BriefContent;
      return (
        <div className="space-y-1">
          <p>{c.goal}</p>
          {c.background && <p className="text-muted-foreground">Background: {c.background}</p>}
          {c.questions && <p className="text-muted-foreground">Questions: {c.questions}</p>}
        </div>
      );
    }
    case 'answers': {
      const c = turn.content as AnswersContent;
      return <ul className="list-disc pl-4">{c.items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
    }
    case 'draft':
    case 'edit': {
      const c = turn.content as DraftContent;
      return (
        <div className="space-y-1">
          {c.subject && <p className="font-medium">Subject: {c.subject}</p>}
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      );
    }
    case 'followup': {
      const c = turn.content as FollowupContent;
      return <p>{c.text}</p>;
    }
  }
}
