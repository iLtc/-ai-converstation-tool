import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ConversationType } from '@app/shared';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select.tsx';
import { useCreateConversation } from '../../hooks/useConversations.ts';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';

const NONE = '__none__';

export function NewConversationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateConversation();
  const { data: profiles = [] } = useStyleProfiles();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ConversationType>('chat');
  const [emailSubject, setEmailSubject] = useState('');
  const [theirName, setTheirName] = useState('');
  const [myName, setMyName] = useState('');
  const [toneNote, setToneNote] = useState('');
  const [styleProfileId, setStyleProfileId] = useState<string>(NONE);

  function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    create.mutate(
      {
        title: title.trim(),
        type,
        emailSubject: type === 'email' && emailSubject ? emailSubject : undefined,
        theirName: theirName || undefined,
        myName: myName || undefined,
        toneNote: toneNote || undefined,
        styleProfileId: styleProfileId === NONE ? undefined : styleProfileId,
      },
      {
        onSuccess: (conv) => { onOpenChange(false); navigate(`/conversations/${conv.id}`); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New conversation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConversationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'email' && (
            <div className="space-y-1">
              <Label htmlFor="subject">Email subject</Label>
              <Input id="subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="myName">Your name</Label>
              <Input id="myName" placeholder="Me" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="theirName">Their name</Label>
              <Input id="theirName" placeholder="Them" value={theirName} onChange={(e) => setTheirName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tone">Tone note</Label>
            <Textarea id="tone" value={toneNote} onChange={(e) => setToneNote(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Style profile</Label>
            <Select value={styleProfileId} onValueChange={setStyleProfileId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
