import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReshipmentDetail } from "./reshipment-detail-drawer";

// Edit a PENDING reshipment. Address/phone edits are pushed to the
// Shopify duplicate by the server, so what the courier sees stays in
// sync with what's shown here. Customer name is deliberately read-only.

const REASONS = [
  { value: "courier_error", label: "Courier error" },
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "fake_delivery", label: "Fake delivery attempt" },
  { value: "address_issue", label: "Address issue" },
  { value: "product_damaged", label: "Product damaged" },
  { value: "other", label: "Other" },
] as const;

interface Form {
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  reason: string;
  urgency: "instant" | "scheduled";
  scheduledDate: string;
  notes: string;
}

export function EditReshipmentDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: ReshipmentDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [pincodeState, setPincodeState] = useState<"idle" | "loading" | "ok" | "notfound">("idle");
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  // Pre-populate from the existing record every time the dialog opens.
  useEffect(() => {
    if (open && row) {
      const a = (row.shippingAddress ?? {}) as any;
      setForm({
        phone: row.customerPhone ?? "",
        address1: a.address1 ?? "",
        address2: a.address2 ?? "",
        city: a.city ?? "",
        state: a.province ?? "",
        zip: a.zip ?? "",
        reason: row.reason,
        urgency: row.urgencyType,
        scheduledDate: row.scheduledDate ? String(row.scheduledDate).slice(0, 10) : "",
        notes: row.internalNotes ?? "",
      });
      setPincodeState("idle");
    }
    if (!open) setForm(null);
  }, [open, row]);

  // Pincode → city/state, same behaviour as the create modal: only fills
  // blanks, never overwrites something the operator typed.
  useEffect(() => {
    if (!form) return;
    const zip = form.zip.trim();
    if (!/^\d{6}$/.test(zip)) {
      setPincodeState("idle");
      return;
    }
    let cancelled = false;
    setPincodeState("loading");
    const t = window.setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/pincode/${zip}`);
        const body = await res.json();
        if (cancelled) return;
        setForm((f) =>
          f ? { ...f, city: f.city || body.city || "", state: f.state || body.state || "" } : f,
        );
        setPincodeState("ok");
      } catch {
        if (!cancelled) setPincodeState("notfound");
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.zip]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row || !form) throw new Error("Nothing to save");
      const res = await apiRequest("PATCH", `/api/reshipments/${row.id}?userId=${userId ?? ""}`, {
        customerPhone: form.phone,
        shippingAddress: {
          first_name: row.customerName?.split(" ")[0] ?? "",
          last_name: row.customerName?.split(" ").slice(1).join(" ") ?? "",
          name: row.customerName,
          phone: form.phone,
          address1: form.address1,
          address2: form.address2 || undefined,
          city: form.city,
          province: form.state,
          zip: form.zip,
          country: "India",
          country_code: "IN",
        },
        reason: form.reason,
        urgency: form.urgency,
        scheduledDate: form.urgency === "scheduled" ? form.scheduledDate : null,
        internalNotes: form.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reshipment updated",
        description: "Changes were pushed to the Shopify order too.",
      });
      qc.invalidateQueries({ queryKey: ["/api/reshipments"] });
      onSaved();
    },
    onError: (err: any) => {
      const raw = String(err?.message ?? "");
      let description = raw || "Try again";
      const m = raw.match(/^\d+:\s*([\s\S]*)$/);
      if (m) {
        try {
          description = JSON.parse(m[1]).error ?? m[1];
        } catch {
          description = m[1];
        }
      }
      toast({ title: "Couldn't save changes", description, variant: "destructive" });
    },
  });

  if (!row || !form) return null;

  const canSave =
    !!form.phone &&
    !!form.address1 &&
    !!form.zip &&
    !!form.reason &&
    (form.urgency !== "scheduled" || !!form.scheduledDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit reshipment</DialogTitle>
          <DialogDescription>
            {row.newShopifyOrderName ?? "Reshipment"} for {row.customerName} — address changes are
            applied to the Shopify order as well.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 max-h-[62vh] space-y-4 overflow-y-auto px-6">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Customer name is fixed at{" "}
            <span className="font-medium text-foreground">{row.customerName}</span> and can't be
            changed here.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Pincode">
              <div className="relative">
                <Input
                  value={form.zip}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  maxLength={6}
                  inputMode="numeric"
                  className="pr-8"
                />
                {pincodeState === "loading" && (
                  <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {pincodeState === "ok" && (
                  <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
            </Field>
            <Field label="Address line 1" className="sm:col-span-2">
              <Input
                value={form.address1}
                onChange={(e) => setForm({ ...form, address1: e.target.value })}
              />
            </Field>
            <Field label="Landmark / line 2" className="sm:col-span-2">
              <Input
                value={form.address2}
                onChange={(e) => setForm({ ...form, address2: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Reason">
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Urgency">
            <RadioGroup
              value={form.urgency}
              onValueChange={(v) => setForm({ ...form, urgency: v as any })}
              className="flex gap-6"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="instant" />
                Ship now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="scheduled" />
                Schedule for later
              </label>
            </RadioGroup>
            {form.urgency === "scheduled" && (
              <Input
                type="date"
                className="mt-1.5 h-9 w-[168px]"
                value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                min={new Date().toISOString().slice(0, 10)}
              />
            )}
          </Field>

          <Field label="Internal notes">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            data-testid="btn-save-reshipment"
          >
            {save.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
