import { useState } from 'react';
import { toast } from 'sonner';
import type { BriefContent, DraftContent } from '@app/shared';
import type { Conversation, DraftTurn, SessionWithTurns } from '../../api/types.ts';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { Label } from '../../components/ui/label.tsx';
import { ApiError } from '../../api/client.ts';
import {
  useDraftSessions, useOpenDraftSession, useAddFollowup, useEditDraft,
  useFinalizeSession, useAbandonSession,
} from '../../hooks/useDraftSessions.ts';
import { BriefForm } from './BriefForm.tsx';
import { Transcript, currentDraftIndex } from './Transcript.tsx';
import { RefineBar } from './RefineBar.tsx';

export function DraftWorkspace({ conversation }: { conversation: Conversation }) {
  const convId = conversation.id;
  const { data, isLoading, isError } = useDraftSessions(convId);
  const open = useOpenDraftSession(convId);
  const followup = useAddFollowup(convId);
  const edit = useEditDraft(convId);
  const finalize = useFinalizeSession(convId);
  const abandon = useAbandonSession(convId);

  const sessions = data?.sessions ?? [];
  const openSession = sessions.find((s) => s.status === 'open');
  const pending = open.isPending || followup.isPending || edit.isPending || finalize.isPending || abandon.isPending;

  function handleError(e: unknown) {
    if (e instanceof ApiError && (e.code === 'context_too_large' || e.code === 'needs_manual_selection')) {
      toast.error('This conversation is too long for the model\'s context window.');
    } else if (e instanceof Error) {
      toast.error(e.message);
    }
  }

  function startDraft(brief: BriefContent) {
    open.mutate(brief, { onError: handleError });
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  if (isError) {
    return <div className="p-4 text-sm text-destructive">Failed to load drafting sessions.</div>;
  }

  if (!openSession) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Compose a reply" />
        <div className="flex-1 overflow-y-auto">
          <BriefForm onSubmit={startDraft} pending={open.isPending} />
        </div>
      </div>
    );
  }

  return (
    <OpenSessionView
      conversation={conversation}
      session={openSession}
      pending={pending}
      onRefine={(instruction, onDone) => followup.mutate({ sessionId: openSession.id, instruction }, { onSuccess: onDone, onError: handleError })}
      onEdit={(draft, onDone) => edit.mutate({ sessionId: openSession.id, draft }, { onSuccess: onDone, onError: handleError })}
      onRestore={(turn) => edit.mutate({ sessionId: openSession.id, draft: turn.content as DraftContent }, { onError: handleError })}
      onFinalize={() => finalize.mutate(openSession.id, {
        onSuccess: () => toast.success('Sent — added to the timeline.'),
        onError: handleError,
      })}
      onAbandon={() => abandon.mutate(openSession.id, { onError: handleError })}
    />
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b p-3">
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function OpenSessionView({
  conversation, session, pending, onRefine, onEdit, onRestore, onFinalize, onAbandon,
}: {
  conversation: Conversation;
  session: SessionWithTurns;
  pending: boolean;
  onRefine: (instruction: string, onSuccess: () => void) => void;
  onEdit: (draft: DraftContent, onSuccess: () => void) => void;
  onRestore: (turn: DraftTurn) => void;
  onFinalize: () => void;
  onAbandon: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const idx = currentDraftIndex(session.turns);
  const current = idx >= 0 ? (session.turns[idx]!.content as DraftContent) : null;
  // Seeded from the latest draft by beginEdit() each time the editor opens.
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');

  function beginEdit() {
    setBody(current?.body ?? '');
    setSubject(current?.subject ?? '');
    setEditing(true);
  }
  function saveEdit() {
    onEdit({ body, ...(conversation.type === 'email' && subject ? { subject } : {}) }, () => setEditing(false));
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Drafting reply" />
      <div className="flex-1 overflow-y-auto p-4">
        <Transcript turns={session.turns} onRestore={onRestore} />
        {editing && (
          <div className="mt-4 space-y-2 rounded-lg border border-emerald-300 p-3">
            {conversation.type === 'email' && (
              <div className="space-y-1">
                <Label htmlFor="edit-subject">Subject</Label>
                <Input id="edit-subject"
                  value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={pending || !body.trim()}>Save edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {!editing && current && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={beginEdit} disabled={pending}>Edit draft</Button>
          </div>
        )}
      </div>
      {!editing && <RefineBar onRefine={onRefine} onFinalize={onFinalize} onAbandon={onAbandon} pending={pending} />}
    </div>
  );
}
