import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { ConversationStudio } from './features/conversations/ConversationStudio.tsx';
import { StyleProfilesPage } from './features/styleProfiles/StyleProfilesPage.tsx';

function ConversationRoute() {
  const { id } = useParams<{ id: string }>();
  return <ConversationStudio key={id} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/conversations" replace />} />
        <Route path="/conversations" element={<EmptyState />} />
        <Route path="/conversations/:id" element={<ConversationRoute />} />
        <Route path="/style-profiles" element={<StyleProfilesPage />} />
        <Route path="*" element={<Navigate to="/conversations" replace />} />
      </Route>
    </Routes>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Select a conversation or create a new one.
    </div>
  );
}
