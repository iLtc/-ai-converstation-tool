import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { useCreateStyleProfile } from '../../hooks/useStyleProfiles.ts';

export function NewStyleProfileForm() {
  const create = useCreateStyleProfile();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  function submit() {
    if (!name.trim() || !instructions.trim()) { toast.error('Name and instructions are required'); return; }
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, instructions: instructions.trim() },
      {
        onSuccess: () => { setName(''); setDescription(''); setInstructions(''); toast.success('Profile created'); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">New style profile</h2>
      <div className="space-y-1"><Label htmlFor="sp-name">Name</Label>
        <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sp-desc">Description</Label>
        <Input id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sp-instr">Instructions</Label>
        <Textarea id="sp-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} /></div>
      <Button onClick={submit} disabled={create.isPending}>Create profile</Button>
    </div>
  );
}
