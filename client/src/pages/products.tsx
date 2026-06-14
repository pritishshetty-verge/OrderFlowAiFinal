import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, Search, Package } from "lucide-react";
import { useEffect, useState } from "react";
import type { CatalogProduct } from "@shared/schema";

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0 text-xs font-medium">
        Active
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-0 text-xs font-medium">
        Draft
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-medium capitalize">
      {status}
    </Badge>
  );
}

function ProductImage({
  src,
  title,
  size = "sm",
}: {
  src: string | null;
  title: string;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const icon = size === "lg" ? "h-8 w-8" : "h-5 w-5";
  if (!src) {
    return (
      <div
        className={`${dim} rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}
      >
        <Package className={`${icon} text-muted-foreground`} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className={`${dim} rounded-lg object-cover flex-shrink-0 border border-border`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function fmt(v: string | null | undefined, prefix = "") {
  if (v == null || v === "") return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : `${prefix}${n.toLocaleString("en-IN")}`;
}

// ── ERP form field ────────────────────────────────────────────────────────────

function ErpField({
  label,
  id,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground font-medium">
        {label}
      </Label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-muted-foreground select-none">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "—"}
          className={`h-9 text-sm ${prefix ? "pl-7" : ""} ${suffix ? "pr-10" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 text-xs text-muted-foreground select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Read-only info row ────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

// ── Ledger slide-out sheet ────────────────────────────────────────────────────

interface ErpState {
  cogs: string;
  packagingCost: string;
  gstRate: string;
  hsnCode: string;
  dimensionLength: string;
  dimensionWidth: string;
  dimensionHeight: string;
}

function blankErp(): ErpState {
  return {
    cogs: "",
    packagingCost: "",
    gstRate: "",
    hsnCode: "",
    dimensionLength: "",
    dimensionWidth: "",
    dimensionHeight: "",
  };
}

function productToErp(p: CatalogProduct): ErpState {
  return {
    cogs: p.cogs ?? "",
    packagingCost: p.packagingCost ?? "",
    gstRate: p.gstRate ?? "",
    hsnCode: p.hsnCode ?? "",
    dimensionLength: p.dimensionLength ?? "",
    dimensionWidth: p.dimensionWidth ?? "",
    dimensionHeight: p.dimensionHeight ?? "",
  };
}

function LedgerSheet({
  product,
  onClose,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [erp, setErp] = useState<ErpState>(blankErp());

  useEffect(() => {
    setErp(product ? productToErp(product) : blankErp());
  }, [product]);

  const set = (field: keyof ErpState) => (v: string) =>
    setErp((prev) => ({ ...prev, [field]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/products/${product!.id}`, {
        cogs: erp.cogs !== "" ? erp.cogs : null,
        packagingCost: erp.packagingCost !== "" ? erp.packagingCost : null,
        gstRate: erp.gstRate !== "" ? erp.gstRate : null,
        hsnCode: erp.hsnCode !== "" ? erp.hsnCode : null,
        dimensionLength: erp.dimensionLength !== "" ? erp.dimensionLength : null,
        dimensionWidth: erp.dimensionWidth !== "" ? erp.dimensionWidth : null,
        dimensionHeight: erp.dimensionHeight !== "" ? erp.dimensionHeight : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Saved", description: "ERP data updated successfully." });
      onClose();
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Could not update product data.",
        variant: "destructive",
      });
    },
  });

  const weightDisplay =
    product?.weight && product?.weightUnit
      ? `${parseFloat(product.weight).toLocaleString("en-IN")} ${product.weightUnit}`
      : product?.weight
      ? `${parseFloat(product.weight)} kg`
      : "—";

  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        {product && (
          <>
            {/* Header */}
            <div className="flex items-start gap-4 p-6 border-b">
              <ProductImage src={product.imageUrl} title={product.title} size="lg" />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-semibold text-base leading-snug line-clamp-2">
                  {product.title}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={product.status} />
                  {product.vendor && (
                    <span className="text-xs text-muted-foreground">{product.vendor}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Shopify native data — read-only */}
              <div className="px-6 pt-5 pb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Shopify Data
                </p>
                <div className="divide-y divide-border">
                  <InfoRow
                    label="Selling Price"
                    value={fmt(product.price, "₹")}
                  />
                  <InfoRow
                    label="Compare-at Price"
                    value={fmt(product.compareAtPrice, "₹")}
                  />
                  <InfoRow label="SKU" value={product.sku || "—"} />
                  <InfoRow label="Barcode" value={product.barcode || "—"} />
                  <InfoRow label="Weight" value={weightDisplay} />
                  <InfoRow
                    label="Inventory"
                    value={
                      product.totalInventory > 0
                        ? `${product.totalInventory} in stock`
                        : "Out of stock"
                    }
                  />
                  <InfoRow
                    label="Variants"
                    value={String(product.variantCount)}
                  />
                  <InfoRow
                    label="Product Type"
                    value={product.productType || "—"}
                  />
                </div>
              </div>

              <Separator />

              {/* ERP Financial */}
              <div className="px-6 pt-5 pb-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  ERP / Financials
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <ErpField
                    label="COGS"
                    id="cogs"
                    value={erp.cogs}
                    onChange={set("cogs")}
                    placeholder="0.00"
                    prefix="₹"
                  />
                  <ErpField
                    label="Packaging Cost"
                    id="packagingCost"
                    value={erp.packagingCost}
                    onChange={set("packagingCost")}
                    placeholder="0.00"
                    prefix="₹"
                  />
                  <ErpField
                    label="GST Rate"
                    id="gstRate"
                    value={erp.gstRate}
                    onChange={set("gstRate")}
                    placeholder="18"
                    suffix="%"
                  />
                  <ErpField
                    label="HSN Code"
                    id="hsnCode"
                    value={erp.hsnCode}
                    onChange={set("hsnCode")}
                    placeholder="e.g. 6109"
                  />
                </div>
              </div>

              <Separator />

              {/* Logistics / Dimensions */}
              <div className="px-6 pt-5 pb-6 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Logistics (cm)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <ErpField
                    label="Length"
                    id="dimL"
                    value={erp.dimensionLength}
                    onChange={set("dimensionLength")}
                    placeholder="0"
                    suffix="cm"
                  />
                  <ErpField
                    label="Width"
                    id="dimW"
                    value={erp.dimensionWidth}
                    onChange={set("dimensionWidth")}
                    placeholder="0"
                    suffix="cm"
                  />
                  <ErpField
                    label="Height"
                    id="dimH"
                    value={erp.dimensionHeight}
                    onChange={set("dimensionHeight")}
                    placeholder="0"
                    suffix="cm"
                  />
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="border-t px-6 py-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Products page ─────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogProduct | null>(null);

  const { data: products = [], isLoading } = useQuery<CatalogProduct[]>({
    queryKey: ["/api/products"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-products");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Sync complete",
        description: data.message || `${data.productsCount} products synced.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sync failed",
        description: err?.message || "Could not sync products from Shopify.",
        variant: "destructive",
      });
    },
  });

  const filtered = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.vendor ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.productType ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="flex-1 overflow-auto">
      <div className="p-6 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading
                ? "Loading…"
                : `${products.length} products synced from Shopify`}
            </p>
          </div>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            {syncMutation.isPending ? "Syncing…" : "Sync Products"}
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[38%]">
                  Product
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[11%]">
                  Status
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[13%]">
                  Inventory
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[11%]">
                  Price
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[11%]">
                  COGS
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[8%]">
                  GST
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[8%]">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                    </td>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">
                      {search
                        ? "No products match your search"
                        : "No products synced yet"}
                    </p>
                    {!search && (
                      <p className="text-muted-foreground text-sm mt-1">
                        Click <strong>Sync Products</strong> to import your
                        Shopify catalog.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setSelected(product)}
                  >
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductImage
                          src={product.imageUrl}
                          title={product.title}
                        />
                        <div className="min-w-0">
                          <p className="font-medium truncate leading-snug">
                            {product.title}
                          </p>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                              {product.sku}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={product.status} />
                    </td>

                    {/* Inventory */}
                    <td className="px-4 py-3">
                      {product.totalInventory > 0 ? (
                        <span>{product.totalInventory} in stock</span>
                      ) : (
                        <span className="text-red-500">Out of stock</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmt(product.price, "₹")}
                    </td>

                    {/* COGS */}
                    <td className="px-4 py-3">
                      {product.cogs ? (
                        <span className="text-foreground font-medium">
                          {fmt(product.cogs, "₹")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">
                          Not set
                        </span>
                      )}
                    </td>

                    {/* GST */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.gstRate ? `${product.gstRate}%` : "—"}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.productType || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {products.length} products · Click a
              row to edit financial data
            </div>
          )}
        </div>
      </div>

      {/* Slide-out ledger */}
      <LedgerSheet product={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
