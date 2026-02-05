import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Alert, AlertDescription } from "../components/ui/alert";

type ApiKeyRow = {
  id: number;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [newKey, setNewKey] = useState<{ id: number; apiKey: string; name: string | null } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadKeys() {
    setError(null);
    try {
      const data = await apiGet("/admin/api-keys") as ApiKeyRow[];
      setKeys(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const body = createName.trim() ? { name: createName.trim() } : {};
      const data = await apiPost("/admin/api-keys", body) as { id: number; apiKey: string; name: string | null };
      setNewKey(data);
      setCreateName("");
      setCreateOpen(false);
      await loadKeys();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreateLoading(false);
    }
  }

  function copyKey() {
    if (!newKey?.apiKey) return;
    navigator.clipboard.writeText(newKey.apiKey);
  }

  function closeNewKeyDialog() {
    setNewKey(null);
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">API Keys</h1>
      <p className="text-muted-foreground mb-6">
        Create API keys for the appointment API. The raw key is shown only once after creation.
      </p>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Keys</CardTitle>
            <CardDescription>List of API keys (masked). Use x-api-key header with the raw key.</CardDescription>
          </div>
          <Button
            onClick={() => { setCreateOpen(true); setCreateError(null); }}
            className="bg-primary text-primary-foreground"
          >
            Create API key
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.id}</TableCell>
                    <TableCell className="text-foreground">{k.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(k.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent showClose={true}>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>Optional name for this key. The key will be shown only once after creation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            {createError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2 mb-4">
              <Label htmlFor="keyName">Name (optional)</Label>
              <Input
                id="keyName"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Production"
                disabled={createLoading}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={createLoading} className="bg-primary text-primary-foreground">
                {createLoading ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newKey} onOpenChange={(open) => !open && closeNewKeyDialog()}>
        <DialogContent showClose={true}>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this key now. It will not be shown again. Use it as the x-api-key header when calling the appointment API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Key</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={newKey?.apiKey ?? ""}
                className="font-mono text-sm"
              />
              <Button type="button" variant="secondary" onClick={copyKey} className="text-foreground">
                Copy
              </Button>
            </div>
          </div>
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>Store this key securely. You cannot retrieve it later.</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    </div>
  );
}
