import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiGet, apiPost, apiPatch } from "../api";
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
import { Pencil, Plus } from "lucide-react";

type Appointment = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  organizationId: number;
  organizationName: string;
  providerId: number;
  providerName: string;
  visitType: string;
  reason: string | null;
  start: string;
  end: string;
  status: string;
  channel: string | null;
};

type UserOption = { id: number; firstName: string; lastName: string };
type OrgOption = { id: number; name: string };
type ProviderOption = { id: number; name: string; organizationId: number };
type AvailabilitySlot = { slotId: number; providerId: number; start: string; end: string };

function formatDate(d: string) {
  try {
    const date = new Date(d);
    return date.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return d;
  }
}

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return "";
  }
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function weekFromTodayStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function Appointments() {
  const location = useLocation();
  const stateUserId = (location.state as { userId?: number })?.userId;

  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(weekFromTodayStr);
  const [userId, setUserId] = useState<string>(stateUserId != null ? String(stateUserId) : "");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [createForm, setCreateForm] = useState({
    userId: 0,
    organizationId: 0,
    providerId: 0,
    slotId: 0,
    visitType: "follow_up",
    start: "",
    end: "",
    reason: "",
  });
  const [slotSearchFrom, setSlotSearchFrom] = useState(todayStr);
  const [slotSearchTo, setSlotSearchTo] = useState(weekFromTodayStr);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [hasSearchedSlots, setHasSearchedSlots] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotSearchError, setSlotSearchError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ newStart: "", newEnd: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (stateUserId != null) setUserId(String(stateUserId));
  }, [stateUserId]);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const params: Record<string, string> = { fromDate, toDate };
      if (userId.trim()) params.userId = userId.trim();
      const data = (await apiGet("/admin/appointments", params)) as Appointment[];
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadOptions(): Promise<{ users: UserOption[]; orgs: OrgOption[] }> {
    try {
      const [usersRes, orgsRes] = await Promise.all([
        apiGet("/admin/users") as Promise<{ id: number; firstName: string; lastName: string }[]>,
        apiGet("/admin/organizations") as Promise<OrgOption[]>,
      ]);
      const u = Array.isArray(usersRes) ? usersRes : [];
      const o = Array.isArray(orgsRes) ? orgsRes : [];
      setUsers(u);
      setOrgs(o);
      return { users: u, orgs: o };
    } catch {
      return { users: [], orgs: [] };
    }
  }

  useEffect(() => {
    if (createForm.organizationId > 0) {
      apiGet("/admin/providers", { organizationId: String(createForm.organizationId) })
        .then((data) => setProviders(Array.isArray(data) ? (data as ProviderOption[]) : []))
        .catch(() => setProviders([]));
    } else {
      setProviders([]);
    }
  }, [createForm.organizationId]);

  async function openCreate() {
    setSubmitError(null);
    setSlotSearchError(null);
    setSlots([]);
    setHasSearchedSlots(false);
    setCreateOpen(true);
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const { users: u, orgs: o } = await loadOptions();
    const orgId = o[0]?.id ?? 0;
    setCreateForm({
      userId: u[0]?.id ?? 0,
      organizationId: orgId,
      providerId: 0,
      slotId: 0,
      visitType: "follow_up",
      start: toDatetimeLocal(now.toISOString()),
      end: toDatetimeLocal(end.toISOString()),
      reason: "",
    });
    if (orgId > 0) {
      try {
        const data = await apiGet("/admin/providers", { organizationId: String(orgId) });
        setProviders(Array.isArray(data) ? (data as ProviderOption[]) : []);
      } catch {
        setProviders([]);
      }
    }
  }

  function openEdit(a: Appointment) {
    setEditingAppt(a);
    setEditForm({
      newStart: toDatetimeLocal(a.start),
      newEnd: toDatetimeLocal(a.end),
    });
    setSubmitError(null);
    setEditOpen(true);
  }

  async function searchSlots() {
    if (createForm.organizationId <= 0) {
      setSlotSearchError("Select an organization first.");
      return;
    }
    setSlotSearchError(null);
    setLoadingSlots(true);
    setHasSearchedSlots(false);
    try {
      const params: Record<string, string> = {
        organizationId: String(createForm.organizationId),
        fromDate: slotSearchFrom,
        toDate: slotSearchTo,
      };
      if (createForm.visitType.trim()) params.visitType = createForm.visitType.trim();
      if (createForm.providerId > 0) params.providerId = String(createForm.providerId);
      const data = (await apiGet("/admin/availability", params)) as AvailabilitySlot[];
      setSlots(Array.isArray(data) ? data : []);
      setHasSearchedSlots(true);
    } catch (err) {
      setSlotSearchError(err instanceof Error ? err.message : "Failed to load slots");
      setSlots([]);
      setHasSearchedSlots(true);
    } finally {
      setLoadingSlots(false);
    }
  }

  function selectSlot(slot: AvailabilitySlot) {
    setCreateForm((f) => ({
      ...f,
      slotId: slot.slotId,
      providerId: slot.providerId,
      start: toDatetimeLocal(slot.start),
      end: toDatetimeLocal(slot.end),
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        userId: createForm.userId,
        organizationId: createForm.organizationId,
        providerId: createForm.providerId,
        visitType: createForm.visitType,
        reason: createForm.reason.trim() || undefined,
      };
      if (createForm.slotId > 0) {
        body.slotId = createForm.slotId;
      } else {
        const startDate = new Date(createForm.start);
        const endDate = new Date(createForm.end);
        body.start = startDate.toISOString();
        body.end = endDate.toISOString();
      }
      await apiPost("/admin/appointments", body);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create appointment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAppt) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiPatch(`/admin/appointments/${editingAppt.id}`, {
        newStart: new Date(editForm.newStart).toISOString(),
        newEnd: new Date(editForm.newEnd).toISOString(),
      });
      setEditOpen(false);
      setEditingAppt(null);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to reschedule appointment");
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
      <h1 className="text-2xl font-semibold text-foreground mb-2">Appointments</h1>
      <p className="text-muted-foreground mb-6">
        Default range: today to one week from today. Create or edit appointments; filter by user ID from Users → View appointments.
      </p>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Date range</CardTitle>
            <CardDescription>Start and end date (YYYY-MM-DD)</CardDescription>
          </div>
          <Button onClick={openCreate} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Create appointment
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="fromDate">From</Label>
            <Input id="fromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toDate">To</Label>
            <Input id="toDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="userId">User ID (optional)</Label>
            <Input id="userId" type="text" placeholder="e.g. 1" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading} className="bg-primary text-primary-foreground">
            {loading ? "Loading…" : "Apply"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>List in selected range</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{a.userName}</TableCell>
                    <TableCell className="text-muted-foreground">{a.organizationName}</TableCell>
                    <TableCell className="text-muted-foreground">{a.providerName}</TableCell>
                    <TableCell>{formatDate(a.start)}</TableCell>
                    <TableCell>{formatDate(a.end)}</TableCell>
                    <TableCell>{a.visitType}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-foreground">{a.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.status === "booked" && (
                        <Button variant="outline" size="sm" className="text-foreground" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && appointments.length === 0 && (
            <p className="text-muted-foreground py-4">No appointments in this range.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create appointment</DialogTitle>
            <DialogDescription>Book an appointment for a user with start and end time.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>User</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={createForm.userId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, userId: parseInt(e.target.value, 10) }))}
                  required
                >
                  <option value={0}>Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} (ID: {u.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Organization</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={createForm.organizationId}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      organizationId: parseInt(e.target.value, 10),
                      providerId: 0,
                      slotId: 0,
                    }))
                  }
                  required
                >
                  <option value={0}>Select organization</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={createForm.providerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, providerId: parseInt(e.target.value, 10) }))}
                  required
                >
                  <option value={0}>Select provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-visitType">Visit type</Label>
                <Input
                  id="create-visitType"
                  value={createForm.visitType}
                  onChange={(e) => setCreateForm((f) => ({ ...f, visitType: e.target.value }))}
                  placeholder="follow_up"
                />
              </div>
              <div className="border-t pt-4 space-y-3">
                <Label className="text-base">Search available slots</Label>
                <p className="text-sm text-muted-foreground">
                  Set date range and click Search to load slots; select one to fill start/end and provider.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="slot-from" className="text-xs">From (date)</Label>
                    <Input
                      id="slot-from"
                      type="date"
                      value={slotSearchFrom}
                      onChange={(e) => setSlotSearchFrom(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="slot-to" className="text-xs">To (date)</Label>
                    <Input
                      id="slot-to"
                      type="date"
                      value={slotSearchTo}
                      onChange={(e) => setSlotSearchTo(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-foreground"
                    onClick={searchSlots}
                    disabled={loadingSlots || createForm.organizationId <= 0}
                  >
                    {loadingSlots ? "Searching…" : "Search slots"}
                  </Button>
                </div>
                {slotSearchError && (
                  <Alert variant="destructive">
                    <AlertDescription>{slotSearchError}</AlertDescription>
                  </Alert>
                )}
                {hasSearchedSlots && (
                  <div className="space-y-2">
                    <Label htmlFor="slot-select">Select slot to book</Label>
                    <select
                      id="slot-select"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground"
                      value={createForm.slotId ? String(createForm.slotId) : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setCreateForm((f) => ({ ...f, slotId: 0, providerId: 0 }));
                          return;
                        }
                        const slotId = parseInt(val, 10);
                        const slot = slots.find((s) => s.slotId === slotId);
                        if (slot) selectSlot(slot);
                      }}
                    >
                      <option value="">
                        {slots.length === 0
                          ? "No slots found in this range"
                          : "Select a slot"}
                      </option>
                      {slots.map((slot) => {
                        const prov = providers.find((p) => p.id === slot.providerId);
                        const label = `${formatDate(slot.start)} – ${formatDate(slot.end)}${prov ? ` · ${prov.name}` : ""}`;
                        return (
                          <option key={slot.slotId} value={slot.slotId}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    {slots.length === 0 && (
                      <p className="text-sm text-muted-foreground">No slots found in this range. Try a different date range or visit type.</p>
                    )}
                  </div>
                )}
                {!hasSearchedSlots && !loadingSlots && !slotSearchError && (
                  <p className="text-sm text-muted-foreground">Use &quot;Search slots&quot; to load availability, then choose a slot from the dropdown.</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="create-reason">Reason (optional)</Label>
                <Input
                  id="create-reason"
                  value={createForm.reason}
                  onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
                />
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

      <Dialog open={editOpen} onOpenChange={(open) => !open && setEditingAppt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>Set new start and end time.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-newStart">New start (local)</Label>
                  <Input
                    id="edit-newStart"
                    type="datetime-local"
                    value={editForm.newStart}
                    onChange={(e) => setEditForm((f) => ({ ...f, newStart: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-newEnd">New end (local)</Label>
                  <Input
                    id="edit-newEnd"
                    type="datetime-local"
                    value={editForm.newEnd}
                    onChange={(e) => setEditForm((f) => ({ ...f, newEnd: e.target.value }))}
                    required
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
