import { useState } from 'react';
import { toast } from 'sonner';
import type { ConversationType } from '@app/shared';
import type { Conversation } from '../../api/types.ts';
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
import { useUpdateConversation } from '../../hooks/useConversations.ts';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';

const NONE = '__none__';

export function ConversationSettingsDialog(
  { conversation, open, onOpenChange }:
  { conversation: Conversation; open: boolean; onOpenChange: (o: boolean) => void },
) {
  const update = useUpdateConversation(conversation.id);
  const { data: profiles = [] } = useStyleProfiles();
  const them = conversation.participants.find((p) => p.role === 'them');
  const me = conversation.participants.find((p) => p.role === 'me');

  const [title, setTitle] = useState(conversation.title);
  const [type, setType] = useState<ConversationType>(conversation.type);
  const [emailSubject, setEmailSubject] = useState(conversation.emailSubject ?? '');
  const [toneNote, setToneNote] = useState(conversation.toneNote ?? '');
  const [styleProfileId, setStyleProfileId] = useState(conversation.styleProfileId ?? NONE);
  const [provider, setProvider] = useState(conversation.provider ?? '');
  const [model, setModel] = useState(conversation.model ?? '');
  const [myName, setMyName] = useState(me?.displayName ?? '');
  const [theirName, setTheirName] = useState(them?.displayName ?? '');

  function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    update.mutate(
      {
        title: title.trim(),
        type,
        emailSubject: emailSubject ? emailSubject : null,
        toneNote: toneNote ? toneNote : null,
        styleProfileId: styleProfileId === NONE ? null : styleProfileId,
        provider: provider ? provider : null,
        model: model ? model : null,
        myName: myName || undefined,
        theirName: theirName || undefined,
      },
      {
        onSuccess: () => { toast.success('Settings saved'); onOpenChange(false); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Conversation settings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="s-title">Title</Label>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <Label htmlFor="s-subject">Email subject</Label>
              <Input id="s-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-myName">Your name</Label>
              <Input id="s-myName" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-theirName">Their name</Label>
              <Input id="s-theirName" value={theirName} onChange={(e) => setTheirName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-tone">Tone note</Label>
            <Textarea id="s-tone" value={toneNote} onChange={(e) => setToneNote(e.target.value)} />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-provider">Provider override</Label>
              <Input id="s-provider" placeholder="default" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-model">Model override</Label>
              <Input id="s-model" placeholder="default" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
