import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { useAddMessage } from '../../hooks/useMessages.ts';

export function PasteReplyButton({ convId }: { convId: string }) {
  const add = useAddMessage(convId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  function submit() {
    if (!body.trim()) return;
    add.mutate(
      { senderRole: 'them', body: body.trim(), kind: 'live', status: 'received' },
      {
        onSuccess: () => { setBody(''); setOpen(false); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Paste their reply</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Paste their reply</DialogTitle></DialogHeader>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the message you received…" rows={6} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending || !body.trim()}>Add to timeline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
