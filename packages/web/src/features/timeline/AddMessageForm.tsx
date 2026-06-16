import { useState } from 'react';
import { toast } from 'sonner';
import type { Role } from '@app/shared';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { cn } from '../../lib/utils.ts';
import { useAddMessage } from '../../hooks/useMessages.ts';

export function AddMessageForm({ convId }: { convId: string }) {
  const add = useAddMessage(convId);
  const [sender, setSender] = useState<Role>('them');
  const [body, setBody] = useState('');

  function submit() {
    if (!body.trim()) return;
    add.mutate(
      { senderRole: sender, body: body.trim(), kind: 'reconstructed' },
      { onSuccess: () => setBody(''), onError: (e: Error) => toast.error(e.message) },
    );
  }

  return (
    <div className="border-t p-3">
      <div className="mb-2 flex gap-1">
        {(['me', 'them'] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setSender(r)}
            className={cn('rounded-md px-2 py-1 text-xs capitalize',
              sender === r ? 'bg-primary text-primary-foreground' : 'bg-muted')}
          >
            {r}
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a message to the history…" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit} disabled={add.isPending || !body.trim()}>Add message</Button>
      </div>
    </div>
  );
}
