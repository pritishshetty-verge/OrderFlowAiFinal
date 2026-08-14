import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Loader2, Search, AlertCircle, MapPin, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────
// Progressive-disclosure form (§4A): search original order → see the
// customer read-only → optionally expand to edit phone/address → pick
// reason + urgency → submit. The server does the Shopify create.
// ─────────────────────────────────────────────────────────────────────

const REASONS = [
  { value: "courier_error", label: "Courier error" },
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "fake_delivery_attempt", label: "Fake delivery attempt" },
  { value: "address_issue", label: "Address issue" },
  { value: "product_damaged", label: "Product damaged" },
  { value: "other", label: "Other" },
] as const;

interface Order {
  id: string;
  shopifyOrderNumber: string | null;
  customerName: string;
  customerPhone: string;
  paymentMethod: string | null;
  shippingAddress: any;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
}

interface AddressForm {
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewReshipmentDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [address, setAddress] = useState<AddressForm | null>(null);
  const [reason, setReason] = useState<string>("");
  const [urgency, setUrgency] = useState<"instant" | "scheduled">("instant");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  // Reset the whole form when the dialog closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSubmittedQuery("");
      setExpanded(false);
      setAddress(null);
      setReason("");
      setUrgency("instant");
      setScheduledDate("");
      setNotes("");
    }
  }, [open]);

  // Look up the original order. We hit the existing search endpoint so
  // partial number lookups work ("#1234", "1234", or the full uuid).
  const {
    data: order,
    isLoading: loading,
    isError,
  } = useQuery<Order | null>({
    queryKey: ["/api/orders/search", submittedQuery, userId],
    queryFn: async () => {
      if (!submittedQuery) return null;
      // Strip leading #, try search endpoint first; falls back to /:id
      // when the query looks like a uuid.
      const clean = submittedQuery.replace(/^#/, "").trim();
      const res = await apiRequest(
        "GET",
        `/api/orders?search=${encodeURIComponent(clean)}&limit=1&currentUserId=${userId ?? ""}`,
      );
      const body = await res.json();
      const rows: Order[] = body?.orders ?? body ?? [];
      return rows[0] ?? null;
    },
    enabled: !!submittedQuery && !!userId,
    retry: false,
  });

  // Debounced pincode → city/state resolver. Fires when the operator
  // edits the zip to a fresh 6-digit value; leaves what they typed if
  // the pincode is unknown (no destructive overwrite).
  const [pincodeState, setPincodeState] = useState<"idle" | "loading" | "ok" | "notfound">(
    "idle",
  );
  useEffect(() => {
    if (!address || !expanded) return;
    const zip = address.zip.trim();
    if (!/^\d{6}$/.test(zip)) {
      setPincodeState("idle");
      return;
    }
    let cancelled = false;
    setPincodeState("loading");
    const t = window.setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/pincode/${zip}`);
        if (!res.ok) {
          if (!cancelled) setPincodeState("notfound");
          return;
        }
        const body: { city: string | null; state: string | null } = await res.json();
        if (cancelled) return;
        setAddress((a) =>
          a
            ? {
                ...a,
                // Only overwrite empty fields — never clobber a manual
                // edit the operator has already made.
                city: a.city || body.city || "",
                state: a.state || body.state || "",
              }
            : a,
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
    // Re-run only when zip changes (address ref changes on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address?.zip, expanded]);

  // Prefill the address once we have the order.
  useEffect(() => {
    if (order && !address) {
      setAddress({
        phone: order.customerPhone ?? "",
        address1: order.shippingAddressLine1 ?? order.shippingAddress?.address1 ?? "",
        address2: order.shippingAddressLine2 ?? order.shippingAddress?.address2 ?? "",
        city: order.shippingCity ?? order.shippingAddress?.city ?? "",
        state: order.shippingState ?? order.shippingAddress?.province ?? "",
        zip: order.shippingPincode ?? order.shippingAddress?.zip ?? "",
      });
    }
  }, [order, address]);

  const create = useMutation({
    mutationFn: async () => {
      if (!order || !address) throw new Error("Order not loaded");
      const res = await apiRequest(
        "POST",
        `/api/reshipments?userId=${userId ?? ""}`,
        {
          originalOrderId: order.id,
          customerName: order.customerName,
          customerPhone: address.phone,
          shippingAddress: {
            first_name: order.customerName?.split(" ")[0] ?? "",
            last_name: order.customerName?.split(" ").slice(1).join(" ") ?? "",
            name: order.customerName,
            phone: address.phone,
            address1: address.address1,
            address2: address.address2 || undefined,
            city: address.city,
            province: address.state,
            zip: address.zip,
            country: "India",
            country_code: "IN",
          },
          reason,
          urgency,
          scheduledDate: urgency === "scheduled" ? scheduledDate : null,
          internalNotes: notes || null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reshipment created",
        description: "Duplicate order queued in Shopify — AWB will attach on fulfilment.",
      });
      qc.invalidateQueries({ queryKey: ["/api/reshipments"] });
      onCreated();
    },
    onError: (err: any) => {
      // apiRequest throws `"<status>: <raw body>"`, and the body is our
      // JSON error envelope. Unwrap it so the operator sees the actual
      // sentence instead of `500: {"error":"…"}`.
      const raw = String(err?.message ?? "");
      let description = raw || "Try again";
      // [\s\S] rather than the `s` dotall flag — the TS target predates es2018.
      const match = raw.match(/^\d+:\s*([\s\S]*)$/);
      if (match) {
        try {
          description = JSON.parse(match[1]).error ?? match[1];
        } catch {
          description = match[1];
        }
      }
      toast({
        title: "Couldn't create reshipment",
        description,
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    !!order &&
    !!address?.address1 &&
    !!address?.zip &&
    !!address?.phone &&
    !!reason &&
    (urgency !== "scheduled" || !!scheduledDate);

  const paymentType = (order?.paymentMethod ?? "").toLowerCase().includes("cod")
    ? "COD"
    : "PREPAID";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* NOTE: DialogContent is `grid` in the primitive — do NOT add
          flex/flex-col here or the two display modes fight and the
          dialog stretches to full height with empty space. Cap the
          scroll on the body instead. */}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Reshipment</DialogTitle>
          <DialogDescription>
            Duplicate a failed order to Shopify. AWB and courier status flow in automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 max-h-[65vh] space-y-4 overflow-y-auto px-6">
          {/* 1. Search */}
          <div className="space-y-1.5">
            <Label htmlFor="reshipment-search">Original order</Label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmittedQuery(query.trim());
                setAddress(null); // force reload of prefill
              }}
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reshipment-search"
                  className="pl-9"
                  placeholder="Order number or ID (e.g. #1234)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" variant="secondary" disabled={!query.trim()}>
                Find
              </Button>
            </form>
          </div>

          {/* 2. Customer card */}
          {submittedQuery && (
            <>
              {loading ? (
                <Skeleton className="h-32" />
              ) : isError || !order ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  No order found for "{submittedQuery}". Check the number and try again.
                </div>
              ) : (
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold">
                          {order.customerName || "Guest"}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            paymentType === "COD"
                              ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                              : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {paymentType}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Order #{order.shopifyOrderNumber ?? order.id.slice(0, 8)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => !s)}
                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                      data-testid="btn-edit-address"
                    >
                      {expanded ? (
                        <>
                          <Save className="h-3 w-3" />
                          Save
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3 w-3" />
                          Edit address / phone
                        </>
                      )}
                    </button>
                  </div>

                  {!expanded && address && (
                    <div className="grid gap-1 text-sm text-muted-foreground">
                      <p className="font-mono">{address.phone || "—"}</p>
                      <p>
                        {[address.address1, address.address2].filter(Boolean).join(", ") ||
                          "—"}
                      </p>
                      <p>
                        {[address.city, address.state, address.zip]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  )}

                  {expanded && address && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormRow label="Phone">
                        <Input
                          value={address.phone}
                          onChange={(e) =>
                            setAddress({ ...address, phone: e.target.value })
                          }
                        />
                      </FormRow>
                      <FormRow label="Pincode">
                        <div className="relative">
                          <Input
                            value={address.zip}
                            onChange={(e) =>
                              setAddress({ ...address, zip: e.target.value })
                            }
                            maxLength={6}
                            inputMode="numeric"
                            className="pr-8"
                          />
                          {pincodeState === "loading" && (
                            <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                          )}
                          {pincodeState === "ok" && (
                            <MapPin
                              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
                              aria-label="Pincode resolved"
                            />
                          )}
                        </div>
                        {pincodeState === "notfound" && (
                          <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Pincode not in the directory — enter city / state manually.
                          </p>
                        )}
                      </FormRow>
                      <FormRow label="Address line 1" className="sm:col-span-2">
                        <Input
                          value={address.address1}
                          onChange={(e) =>
                            setAddress({ ...address, address1: e.target.value })
                          }
                        />
                      </FormRow>
                      <FormRow label="Landmark / line 2" className="sm:col-span-2">
                        <Input
                          value={address.address2}
                          onChange={(e) =>
                            setAddress({ ...address, address2: e.target.value })
                          }
                        />
                      </FormRow>
                      <FormRow label="City">
                        <Input
                          value={address.city}
                          onChange={(e) =>
                            setAddress({ ...address, city: e.target.value })
                          }
                        />
                      </FormRow>
                      <FormRow label="State">
                        <Input
                          value={address.state}
                          onChange={(e) =>
                            setAddress({ ...address, state: e.target.value })
                          }
                        />
                      </FormRow>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 3. Reason + urgency + notes */}
          {order && (
            <div className="space-y-3.5">
              <FormRow label="Reason">
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger data-testid="select-reason">
                    <SelectValue placeholder="Why is this being reshipped?" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>

              <FormRow label="Urgency">
                <RadioGroup
                  value={urgency}
                  onValueChange={(v) => setUrgency(v as any)}
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
                {urgency === "scheduled" && (
                  <Input
                    type="date"
                    className="mt-1.5 h-9 w-[168px]"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                )}
              </FormRow>

              <FormRow label="Internal notes (optional)">
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the fulfilment team should know"
                />
              </FormRow>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            data-testid="btn-create-reshipment"
          >
            {create.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Reshipment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormRow({
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
