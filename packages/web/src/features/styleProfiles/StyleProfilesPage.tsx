import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';
import { NewStyleProfileForm } from './NewStyleProfileForm.tsx';

export function StyleProfilesPage() {
  const { data: profiles = [], isLoading } = useStyleProfiles();

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-6 h-full">
      <h1 className="text-lg font-semibold">Style profiles</h1>
      <NewStyleProfileForm />
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && profiles.length === 0 && <p className="text-sm text-muted-foreground">No profiles yet.</p>}
        {profiles.map((p) => (
          <Card key={p.id}>
            <CardHeader><CardTitle className="text-base">{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {p.description && <p className="text-muted-foreground">{p.description}</p>}
              <p className="whitespace-pre-wrap">{p.instructions}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
