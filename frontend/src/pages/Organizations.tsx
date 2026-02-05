import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "../api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Pencil, Plus } from "lucide-react";

type Organization = {
  id: number;
  name: string;
  timezone: string;
  acceptingBookings: boolean;
  minDaysInAdvance: number;
  maxDaysInAdvance: number;
};

const defaultForm = {
  name: "",
  timezone: "America/New_York",
  acceptingBookings: true,
  minDaysInAdvance: 0,
  maxDaysInAdvance: 90,
};

export default function Organizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadOrgs() {
    try {
      const data = (await apiGet("/admin/organizations")) as Organization[];
      setOrgs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  function openCreate() {
    setForm(defaultForm);
    setSubmitError(null);
    setCreateOpen(true);
  }

  function openEdit(o: Organization) {
    setEditingOrg(o);
    setForm({
      name: o.name,
      timezone: o.timezone,
      acceptingBookings: o.acceptingBookings,
      minDaysInAdvance: o.minDaysInAdvance,
      maxDaysInAdvance: o.maxDaysInAdvance,
    });
    setSubmitError(null);
    setEditOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiPost("/admin/organizations", {
        name: form.name.trim(),
        timezone: form.timezone.trim(),
        acceptingBookings: form.acceptingBookings,
        minDaysInAdvance: form.minDaysInAdvance,
        maxDaysInAdvance: form.maxDaysInAdvance,
      });
      setCreateOpen(false);
      await loadOrgs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrg) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiPatch(`/admin/organizations/${editingOrg.id}`, {
        name: form.name.trim(),
        timezone: form.timezone.trim(),
        acceptingBookings: form.acceptingBookings,
        minDaysInAdvance: form.minDaysInAdvance,
        maxDaysInAdvance: form.maxDaysInAdvance,
      });
      setEditOpen(false);
      setEditingOrg(null);
      await loadOrgs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setSubmitting(false);
    }
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
      <h1 className="text-2xl font-semibold text-foreground mb-2">Organizations</h1>
      <p className="text-muted-foreground mb-6">Create or edit organizations (clinics / offices).</p>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Organization list</CardTitle>
            <CardDescription>Clinics / offices</CardDescription>
          </div>
          <Button onClick={openCreate} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Create organization
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
                  <TableHead>Timezone</TableHead>
                  <TableHead>Accepting bookings</TableHead>
                  <TableHead>Min days</TableHead>
                  <TableHead>Max days</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{o.name}</TableCell>
                    <TableCell className="text-muted-foreground">{o.timezone}</TableCell>
                    <TableCell>
                      <Badge variant={o.acceptingBookings ? "default" : "secondary"} className="text-primary-foreground">
                        {o.acceptingBookings ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>{o.minDaysInAdvance}</TableCell>
                    <TableCell>{o.maxDaysInAdvance}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="text-foreground" onClick={() => openEdit(o)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>Add a new clinic or office.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-org-name">Name</Label>
                <Input
                  id="create-org-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-org-timezone">Timezone (IANA)</Label>
                <Input
                  id="create-org-timezone"
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder="America/New_York"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="create-org-accepting"
                  checked={form.acceptingBookings}
                  onChange={(e) => setForm((f) => ({ ...f, acceptingBookings: e.target.checked }))}
                  className="rounded border-input"
                />
                <Label htmlFor="create-org-accepting">Accepting bookings</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-org-min">Min days in advance</Label>
                  <Input
                    id="create-org-min"
                    type="number"
                    min={0}
                    value={form.minDaysInAdvance}
                    onChange={(e) => setForm((f) => ({ ...f, minDaysInAdvance: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-org-max">Max days in advance</Label>
                  <Input
                    id="create-org-max"
                    type="number"
                    min={0}
                    value={form.maxDaysInAdvance}
                    onChange={(e) => setForm((f) => ({ ...f, maxDaysInAdvance: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground">
                {submitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit organization</DialogTitle>
            <DialogDescription>Update organization details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-org-name">Name</Label>
                <Input
                  id="edit-org-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-org-timezone">Timezone (IANA)</Label>
                <Input
                  id="edit-org-timezone"
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-org-accepting"
                  checked={form.acceptingBookings}
                  onChange={(e) => setForm((f) => ({ ...f, acceptingBookings: e.target.checked }))}
                  className="rounded border-input"
                />
                <Label htmlFor="edit-org-accepting">Accepting bookings</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-org-min">Min days in advance</Label>
                  <Input
                    id="edit-org-min"
                    type="number"
                    min={0}
                    value={form.minDaysInAdvance}
                    onChange={(e) => setForm((f) => ({ ...f, minDaysInAdvance: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-org-max">Max days in advance</Label>
                  <Input
                    id="edit-org-max"
                    type="number"
                    min={0}
                    value={form.maxDaysInAdvance}
                    onChange={(e) => setForm((f) => ({ ...f, maxDaysInAdvance: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground">
                {submitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
