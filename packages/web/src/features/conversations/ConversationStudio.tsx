import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Button } from '../../components/ui/button.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { useConversation } from '../../hooks/useConversations.ts';
import { Timeline } from '../timeline/Timeline.tsx';
import { DraftWorkspace } from '../drafting/DraftWorkspace.tsx';
import { ConversationSettingsDialog } from './ConversationSettingsDialog.tsx';

export function ConversationStudio() {
  const { id } = useParams<{ id: string }>();
  const { data: conversation, isLoading, isError } = useConversation(id!);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (isError || !conversation) return <div className="p-6 text-muted-foreground">Couldn't load this conversation.</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">{conversation.title}</h1>
          <Badge variant="secondary">{conversation.type}</Badge>
          {conversation.model && <Badge variant="outline">{conversation.model}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-1 h-4 w-4" /> Settings
        </Button>
      </header>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] overflow-hidden">
        <Timeline conversation={conversation} />
        <DraftWorkspace conversation={conversation} />
      </div>
      {settingsOpen && (
        <ConversationSettingsDialog
          conversation={conversation}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
    </div>
  );
}
