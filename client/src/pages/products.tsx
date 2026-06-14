import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, Search, Package } from "lucide-react";
import { useState } from "react";
import type { CatalogProduct } from "@shared/schema";

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

function ProductImage({ src, title }: { src: string | null; title: string }) {
  if (!src) {
    return (
      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className="h-10 w-10 rounded-md object-cover flex-shrink-0 border border-border"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export default function ProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

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

  const filtered = products.filter((p) =>
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
              {isLoading ? "Loading..." : `${products.length} products synced from Shopify`}
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
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[40%]">
                  Product
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[12%]">
                  Status
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[14%]">
                  Inventory
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[12%]">
                  Price
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[12%]">
                  Type
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[10%]">
                  Vendor
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
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">
                      {search ? "No products match your search" : "No products synced yet"}
                    </p>
                    {!search && (
                      <p className="text-muted-foreground text-sm mt-1">
                        Click <strong>Sync Products</strong> to import your Shopify catalog.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    {/* Product title + thumbnail */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductImage src={product.imageUrl} title={product.title} />
                        <div className="min-w-0">
                          <p className="font-medium truncate leading-snug">{product.title}</p>
                          {product.variantCount > 1 && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {product.variantCount} variants
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.totalInventory > 0 ? (
                        <span className="text-foreground">
                          {product.totalInventory} in stock
                        </span>
                      ) : (
                        <span className="text-red-500">Out of stock</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.price ? `₹${parseFloat(product.price).toLocaleString("en-IN")}` : "—"}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.productType || <span className="text-muted-foreground/50">—</span>}
                    </td>

                    {/* Vendor */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {product.vendor || <span className="text-muted-foreground/50">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Footer count */}
          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {products.length} products
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
