import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';

export function RefineBar({ onRefine, onFinalize, onAbandon, pending }: {
  onRefine: (instruction: string) => void;
  onFinalize: () => void;
  onAbandon: () => void;
  pending: boolean;
}) {
  const [instruction, setInstruction] = useState('');

  function refine() {
    if (!instruction.trim()) return;
    onRefine(instruction.trim());
    setInstruction('');
  }

  return (
    <div className="space-y-2 border-t bg-muted/30 p-3">
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Ask a follow-up or describe a change…"
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={refine} disabled={pending || !instruction.trim()}>Send to AI</Button>
        <Button size="sm" variant="secondary" onClick={onFinalize} disabled={pending}>Finalize &amp; send</Button>
        <Button size="sm" variant="ghost" onClick={onAbandon} disabled={pending}>Abandon</Button>
      </div>
    </div>
  );
}
