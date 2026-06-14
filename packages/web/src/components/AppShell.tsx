import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { useConversations } from '../hooks/useConversations.ts';
import { NewConversationDialog } from '../features/conversations/NewConversationDialog.tsx';
import { cn } from '../lib/utils.ts';

export function AppShell() {
  const { data: conversations = [] } = useConversations();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="grid h-screen grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-semibold">Conversations</span>
          <Button size="sm" onClick={() => setNewOpen(true)}>＋ New</Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          {conversations.map((c) => (
            <NavLink
              key={c.id}
              to={`/conversations/${c.id}`}
              className={({ isActive }) => cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{c.title}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/style-profiles"
          className={({ isActive }) => cn(
            'flex items-center gap-2 border-t px-4 py-3 text-sm',
            isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
          )}
        >
          <Sparkles className="h-4 w-4" /> Style profiles
        </NavLink>
      </aside>
      <main className="overflow-hidden">
        <Outlet />
      </main>
      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
