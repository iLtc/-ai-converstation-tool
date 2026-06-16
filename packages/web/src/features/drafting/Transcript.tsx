import type { DraftTurn } from '../../api/types.ts';
import { TurnView } from './TurnView.tsx';

/** Index of the latest draft/edit turn (the current draft), or -1. */
export function currentDraftIndex(turns: DraftTurn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.kind === 'draft' || turns[i]!.kind === 'edit') return i;
  }
  return -1;
}

export function Transcript({ turns, onRestore }: { turns: DraftTurn[]; onRestore: (turn: DraftTurn) => void }) {
  const currentIdx = currentDraftIndex(turns);
  return (
    <div className="space-y-4">
      {turns.map((turn, i) => (
        <TurnView
          key={turn.id}
          turn={turn}
          isCurrentDraft={i === currentIdx}
          onRestore={() => onRestore(turn)}
        />
      ))}
    </div>
  );
}
