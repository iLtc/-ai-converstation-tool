import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { Conversation } from '../../api/types.ts';
import { useMessages, useReorderMessage } from '../../hooks/useMessages.ts';
import { MessageItem } from './MessageItem.tsx';
import { AddMessageForm } from './AddMessageForm.tsx';
import { PasteReplyButton } from './PasteReplyButton.tsx';

export function Timeline({ conversation }: { conversation: Conversation }) {
  const convId = conversation.id;
  const { data: messages = [], isLoading } = useMessages(convId);
  const reorder = useReorderMessage(convId);
  const byParticipant = new Map(conversation.participants.map((p) => [p.id, p]));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = messages.map((m) => m.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    const reordered = arrayMove(messages, from, to);
    const newIndex = reordered.findIndex((m) => m.id === active.id);
    const afterMessageId = newIndex === 0 ? null : reordered[newIndex - 1]!.id;
    reorder.mutate({ id: active.id as string, input: { afterMessageId } });
  }

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-semibold">Timeline</span>
        <PasteReplyButton convId={convId} />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={messages.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} sender={byParticipant.get(m.senderParticipantId)} convId={convId} />
              ))}
            </SortableContext>
          </DndContext>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet. Add the conversation history below.</p>
        )}
      </div>
      <AddMessageForm convId={convId} />
    </div>
  );
}
