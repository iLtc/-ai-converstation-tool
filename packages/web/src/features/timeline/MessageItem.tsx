import { useState } from 'react';
import { Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Message, Participant } from '../../api/types.ts';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { cn } from '../../lib/utils.ts';
import { useUpdateMessage, useDeleteMessage } from '../../hooks/useMessages.ts';

export function MessageItem(
  { message, sender, convId }: { message: Message; sender: Participant | undefined; convId: string },
) {
  const isMe = sender?.role === 'me';
  const update = useUpdateMessage(convId);
  const del = useDeleteMessage(convId);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: message.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn('group flex flex-col', isMe ? 'items-end' : 'items-start')}>
      <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">{sender?.displayName}</span>
      <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', isMe ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {editing ? (
          <div className="space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="text-foreground" />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => update.mutate({ id: message.id, input: { body } }, { onSuccess: () => setEditing(false) })}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setBody(message.body); setEditing(false); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : message.body}
      </div>
      {!editing && (
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button {...attributes} {...listeners} className="cursor-grab p-1 text-muted-foreground" aria-label="Drag to reorder">
            <GripVertical className="h-3 w-3" />
          </button>
          <button className="p-1 text-muted-foreground" aria-label="Edit" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </button>
          <button className="p-1 text-muted-foreground" aria-label="Delete" onClick={() => del.mutate(message.id)}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
