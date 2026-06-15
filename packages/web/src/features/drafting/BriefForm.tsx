import { useState } from 'react';
import type { BriefContent } from '@app/shared';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { Label } from '../../components/ui/label.tsx';

export function BriefForm({ onSubmit, pending }: { onSubmit: (b: BriefContent) => void; pending: boolean }) {
  const [goal, setGoal] = useState('');
  const [background, setBackground] = useState('');
  const [questions, setQuestions] = useState('');
  const [error, setError] = useState(false);

  function submit() {
    if (!goal.trim()) { setError(true); return; }
    onSubmit({ goal: goal.trim(), background: background.trim() || undefined, questions: questions.trim() || undefined });
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <Label htmlFor="goal">Goal</Label>
        <Textarea id="goal" value={goal} onChange={(e) => { setGoal(e.target.value); setError(false); }}
          placeholder="What do you want to say?" />
        {error && <p className="text-xs text-destructive">A goal is required.</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="background">Background</Label>
        <Textarea id="background" value={background} onChange={(e) => setBackground(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="questions">Questions for the AI</Label>
        <Textarea id="questions" value={questions} onChange={(e) => setQuestions(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={pending}>{pending ? 'Drafting…' : 'Start drafting'}</Button>
    </div>
  );
}
