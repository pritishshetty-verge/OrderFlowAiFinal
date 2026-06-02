import { useEffect, useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import {
  Truck,
  Package,
  Webhook,
  MessageCircle,
  ShoppingBag,
  Loader2,
  ChevronLeft,
  Check,
  type LucideIcon,
} from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ShopifyConnectionCard } from "@/components/settings-shopify-main";
import { AddStoreDialog } from "@/components/add-store-dialog";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────
// Integrations hub.
//
// Bird's-eye catalog of every external platform OrderFlow speaks to.
// Each integration is a card with logo / one-liner / status / action.
// "Configure" on a connected service opens a slide-over Sheet with the
// credential / API surface — operational tooling (webhook health,
// product catalog, payment mapping, help) lives on Settings → Store
// Operations to keep this view clean.
//
// Admin-only (matches AdminOnlyGuard in App.tsx).
// ─────────────────────────────────────────────────────────────────────

type IntegrationStatus = "connected" | "available" | "coming_soon";

type IntegrationCategory =
  | "E-commerce"
  | "Logistics"
  | "Marketing"
  | "Communication";

type Integration = {
  id: string;
  name: string;
  domain: string;
  category: IntegrationCategory;
  description: string;
  status: IntegrationStatus;
  // Pick one — iconImg wins if both are set.
  iconImg?: string;
  iconBg?: string; // tailwind bg class used behind a fallback letter avatar
  iconFg?: string; // tailwind text class for the letter avatar
  icon?: LucideIcon;
  // When set, the action button becomes a wouter <Link> to this path
  // instead of opening the in-page Sheet. Use for integrations that
  // already have their own dedicated management page (e.g. Custom
  // Webhooks → /webhooks).
  href?: string;
};

// `iconImg` URLs are user-supplied direct CDN links (Shopify CDN). We
// went external because saving binary assets through the chat surface
// isn't supported. If any URL ever 404s the IntegrationLogo `onError`
// fallback re-renders with the matching Lucide glyph (Truck,
// ShoppingBag, MessageCircle, …) on the tinted tile, so the page never
// shows a broken-image icon.
const INTEGRATIONS: Integration[] = [
  // E-commerce
  {
    id: "shopify",
    name: "Shopify",
    domain: "shopify.com",
    category: "E-commerce",
    description: "Sync orders, products, and customers from your storefront",
    status: "connected",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/free-shopify-logo-icon-svg-download-png-3030408.webp?v=1777137731",
    iconBg: "bg-green-500/10",
    iconFg: "text-green-600 dark:text-green-400",
  },
  // Logistics
  {
    id: "delhivery",
    name: "Delhivery",
    domain: "delhivery.com",
    category: "Logistics",
    description: "Push manifests and pull tracking events automatically",
    status: "connected",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/DELHIVERY.NS-24f77207.png?v=1777134962",
    icon: Truck,
    iconBg: "bg-red-500/10",
    iconFg: "text-red-600 dark:text-red-400",
  },
  {
    id: "shiprocket",
    name: "Shiprocket",
    domain: "shiprocket.in",
    category: "Logistics",
    description: "Multi-courier shipping & NDR automation",
    status: "coming_soon",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/SrLogoIcon.png?v=1777134944",
    icon: Package,
    iconBg: "bg-purple-500/10",
    iconFg: "text-purple-600 dark:text-purple-400",
  },
  // Marketing
  {
    id: "meta-ads",
    name: "Meta Ads",
    domain: "business.facebook.com",
    category: "Marketing",
    description: "Attribute orders to Facebook & Instagram campaigns",
    status: "connected",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/CITYPNG.COM_Facebook_Meta_Logo_Icon_HD_PNG_-_1000x1000_902b0d0b-e0a5-438c-a452-9d58e4b74003.png?v=1777134928",
    icon: ShoppingBag,
    iconBg: "bg-blue-500/10",
    iconFg: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    domain: "ads.google.com",
    category: "Marketing",
    description: "Track ROAS across Search, Shopping, and Performance Max",
    status: "coming_soon",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/google_ads_logo_icon_171064.webp?v=1777134960",
    icon: ShoppingBag,
    iconBg: "bg-amber-500/10",
    iconFg: "text-amber-600 dark:text-amber-400",
  },
  // Communication
  {
    id: "interakt",
    name: "Interakt",
    domain: "interakt.shop",
    category: "Communication",
    description: "Trigger WhatsApp flows on order events",
    status: "coming_soon",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/unnamed_1.png?v=1777134943",
    icon: MessageCircle,
    iconBg: "bg-emerald-500/10",
    iconFg: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "bitespeed",
    name: "Bitespeed",
    domain: "bitespeed.co",
    category: "Communication",
    description: "Recover abandoned carts via WhatsApp campaigns",
    status: "coming_soon",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/400x400bb-75.webp?v=1777137372",
    icon: MessageCircle,
    iconBg: "bg-teal-500/10",
    iconFg: "text-teal-600 dark:text-teal-400",
  },
  {
    id: "custom-webhooks",
    name: "Custom Webhooks",
    domain: "Build your own",
    category: "Communication",
    description: "Receive order events at any HTTPS endpoint you control",
    status: "connected",
    iconImg:
      "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/color-webhook-240-1deccb0e365ff4ea493396ad28638fb7.png?v=1777134962",
    icon: Webhook,
    iconBg: "bg-slate-500/10",
    iconFg: "text-slate-600 dark:text-slate-400",
    // Webhooks has its own full-page management UI, so we route
    // there directly instead of squeezing it into the Sheet. This
    // also replaces the old standalone "Webhooks" sidebar entry.
    href: "/webhooks",
  },
];

const CATEGORY_ORDER: IntegrationCategory[] = [
  "E-commerce",
  "Logistics",
  "Marketing",
  "Communication",
];

function StatusPill({ status }: { status: IntegrationStatus }) {
  if (status === "connected") {
    return (
      <Badge
        variant="outline"
        className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10 gap-1.5"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Connected
      </Badge>
    );
  }
  if (status === "available") {
    return (
      <Badge
        variant="outline"
        className="text-muted-foreground border-border"
      >
        Available
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
    >
      Coming soon
    </Badge>
  );
}

function IntegrationLogo({ integration }: { integration: Integration }) {
  // "Coming soon" cards are visually muted — grayscale on the logo,
  // softened opacity on the wrapper. Status-driven, so it's automatic
  // for every new integration we add.
  const isMuted = integration.status === "coming_soon";

  // Track whether the configured iconImg failed to load (404, hotlink
  // block, offline asset). When it does, fall back to the Lucide icon
  // or letter avatar so the card never shows a broken image glyph —
  // matters specifically while the local PNGs aren't yet dropped into
  // /public/assets/logos.
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = integration.iconImg && !imgFailed;

  // Tinted square tile keeps the visual rhythm consistent across the
  // grid whether the logo lands as <img>, lucide icon, or letter.
  const wrapClass = `h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${
    integration.iconBg ?? "bg-muted"
  } ${isMuted ? "opacity-70" : ""}`;

  if (showImg) {
    return (
      <div className={wrapClass}>
        <img
          src={integration.iconImg}
          alt={`${integration.name} logo`}
          className={`h-10 w-10 object-contain ${isMuted ? "grayscale" : ""}`}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }
  if (integration.icon) {
    const Icon = integration.icon;
    return (
      <div className={wrapClass}>
        <Icon
          className={`h-5 w-5 ${integration.iconFg ?? "text-muted-foreground"} ${
            isMuted ? "grayscale" : ""
          }`}
        />
      </div>
    );
  }
  return (
    <div className={wrapClass}>
      <span
        className={`text-sm font-semibold ${integration.iconFg ?? ""} ${
          isMuted ? "grayscale" : ""
        }`}
      >
        {integration.name.charAt(0)}
      </span>
    </div>
  );
}

interface IntegrationCardProps {
  integration: Integration;
  onConfigure: (integration: Integration) => void;
}

function IntegrationCard({ integration, onConfigure }: IntegrationCardProps) {
  const isComingSoon = integration.status === "coming_soon";
  const ctaLabel =
    integration.status === "connected"
      ? "Manage"
      : integration.status === "available"
        ? "Connect"
        : "Notify Me";

  return (
    <Card
      className={`flex flex-col transition-shadow ${
        isComingSoon ? "opacity-75" : "hover:shadow-md"
      }`}
      data-testid={`integration-card-${integration.id}`}
    >
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <IntegrationLogo integration={integration} />
          <StatusPill status={integration.status} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-none">
            {integration.name}
          </h3>
          <p className="text-xs text-muted-foreground">{integration.domain}</p>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {integration.description}
        </p>
      </CardContent>
      <CardFooter className="border-t pt-4">
        {integration.href && !isComingSoon ? (
          // Integration owns its own management page — route there
          // instead of opening the in-page Sheet. wouter <Link>
          // composes with shadcn <Button asChild> via a single child.
          <Button
            asChild
            variant={integration.status === "connected" ? "default" : "outline"}
            size="sm"
            className="w-full"
            data-testid={`button-configure-${integration.id}`}
          >
            <Link href={integration.href}>{ctaLabel}</Link>
          </Button>
        ) : (
          <Button
            variant={integration.status === "connected" ? "default" : "outline"}
            size="sm"
            className="w-full"
            disabled={isComingSoon}
            onClick={() => onConfigure(integration)}
            data-testid={`button-configure-${integration.id}`}
          >
            {ctaLabel}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default function IntegrationsPage() {
  // Hooks must be called unconditionally — keep these above the
  // role-based early return below.
  const [activeIntegration, setActiveIntegration] =
    useState<Integration | null>(null);

  const userRole =
    typeof window !== "undefined" ? localStorage.getItem("userRole") : null;
  if (userRole && userRole !== "admin") {
    return <Redirect to="/" />;
  }

  // The Sheet renders different bodies depending on which integration
  // was clicked. Today only Shopify has a real config surface; the
  // others use a generic "config coming soon" placeholder so admins
  // still get useful feedback when they click "Manage" on a
  // not-yet-wired card (e.g. Delhivery / Meta Ads).
  const renderSheetBody = () => {
    if (!activeIntegration) return null;
    if (activeIntegration.id === "shopify") {
      return <ShopifyConnectionCard />;
    }
    if (activeIntegration.id === "meta-ads") {
      return (
        <MetaConnectionCard
          onClose={() => setActiveIntegration(null)}
        />
      );
    }
    return (
      <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
        <p className="text-sm font-medium">Configuration coming soon</p>
        <p className="text-sm text-muted-foreground">
          We're still wiring up the {activeIntegration.name} configuration
          panel. In the meantime, reach out to support to get this
          integration provisioned for your store.
        </p>
      </div>
    );
  };

  // Group integrations by category for the sectioned layout.
  const grouped = INTEGRATIONS.reduce<Record<string, Integration[]>>(
    (acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    },
    {},
  );

  // Headline counters for the page subhead.
  const connectedCount = INTEGRATIONS.filter(
    (i) => i.status === "connected",
  ).length;
  const totalCount = INTEGRATIONS.length;

  return (
    <PageLayout
      title="Integrations"
      description="Connect OrderFlow to the platforms your business runs on"
    >
      <div className="p-6 space-y-8">
        {/* Header bar with active count + Add store CTA. The CTA
            is the multi-store onboarding entry-point: POST /api/stores
            with credentials and the new tenant is live immediately.
            Existing Shopify card still hosts the legacy single-store
            flow for back-compat. */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {connectedCount} of {totalCount} connected
            </Badge>
          </div>
          <AddStoreDialog
            trigger={
              <Button
                size="sm"
                className="gap-2"
                data-testid="button-add-store-header"
              >
                <Plus className="h-4 w-4" />
                Add Shopify store
              </Button>
            }
          />
        </div>

        {CATEGORY_ORDER.map((category) => {
          const items = grouped[category];
          if (!items?.length) return null;
          return (
            <section
              key={category}
              className="space-y-4"
              data-testid={`section-${category.toLowerCase()}`}
            >
              <div>
                <h2 className="text-lg font-semibold">{category}</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onConfigure={setActiveIntegration}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Slide-over config panel. Kept lean: only credentials / API
          surface. Operational tooling lives in Settings → Store
          Operations on purpose. */}
      <Sheet
        open={!!activeIntegration}
        onOpenChange={(open) => !open && setActiveIntegration(null)}
      >
        <SheetContent
          className="w-full sm:max-w-2xl overflow-y-auto"
          data-testid="sheet-integration-config"
        >
          {activeIntegration && (
            <>
              <SheetHeader className="space-y-3 pb-6 border-b">
                <div className="flex items-center gap-3">
                  <IntegrationLogo integration={activeIntegration} />
                  <div>
                    <SheetTitle className="text-lg">
                      {activeIntegration.name}
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                      {activeIntegration.domain} · {activeIntegration.category}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="pt-6">{renderSheetBody()}</div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MetaConnectionCard — multi-step Meta Ads onboarding wizard rendered
// inside the integrations Sheet. Steps: credentials → accounts →
// campaigns → review. The server keeps the access token encrypted and
// scoped to the currently active store; the client never sees the raw
// token after it's saved.
// ─────────────────────────────────────────────────────────────────────

type MetaStep = "credentials" | "accounts" | "campaigns" | "review";

type MetaAdAccountConfig = {
  adAccountId: string;
  linkedCampaignIds: string[];
  syncAll: boolean;
};

type MetaConfigResponse = {
  hasToken: boolean;
  adAccountsConfig: MetaAdAccountConfig[];
};

type MetaAdAccount = {
  id: string;
  name: string;
  account_status?: number;
  currency?: string;
  business_name?: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  effective_status?: string;
};

interface MetaConnectionCardProps {
  onClose: () => void;
}

function MetaStepHeader({ step }: { step: MetaStep }) {
  const labels: { id: MetaStep; n: number; label: string }[] = [
    { id: "credentials", n: 1, label: "Credentials" },
    { id: "accounts", n: 2, label: "Accounts" },
    { id: "campaigns", n: 3, label: "Campaigns" },
    { id: "review", n: 4, label: "Review" },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {labels.map((s, idx) => {
        const active = s.id === step;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className={
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }
            >
              {s.n} {s.label}
            </span>
            {idx < labels.length - 1 && (
              <span className="text-muted-foreground">·</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetaConnectionCard({ onClose }: MetaConnectionCardProps) {
  const { activeStoreId } = useActiveStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<MetaStep>("credentials");
  const [tokenInput, setTokenInput] = useState("");
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string | null>(
    null,
  );
  const [syncAll, setSyncAll] = useState(true);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(
    new Set(),
  );
  const [campaignSearch, setCampaignSearch] = useState("");
  const [didBootstrap, setDidBootstrap] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────
  const configQuery = useQuery<MetaConfigResponse>({
    queryKey: ["/api/meta/config", activeStoreId],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/meta/config");
      return (await res.json()) as MetaConfigResponse;
    },
    enabled: !!activeStoreId,
  });

  // Bootstrap: if a token is already configured, skip past step 1 the
  // first time the query resolves. Don't keep forcing the step after
  // that — the user may navigate back to "credentials" to rotate the
  // token.
  useEffect(() => {
    if (didBootstrap) return;
    if (configQuery.data) {
      if (configQuery.data.hasToken) {
        const existing = configQuery.data.adAccountsConfig?.[0];
        if (existing) {
          setSelectedAdAccountId(existing.adAccountId);
          setSyncAll(existing.syncAll);
          setSelectedCampaignIds(new Set(existing.linkedCampaignIds));
        }
        // Land users on Review when a config already exists so they
        // see the summary/manage view; otherwise step them through
        // Accounts → Campaigns. Token-only setups still resume at
        // Accounts to finish the wizard.
        if ((configQuery.data.adAccountsConfig ?? []).length > 0) {
          setStep("review");
        } else {
          setStep("accounts");
        }
      }
      setDidBootstrap(true);
    }
  }, [configQuery.data, didBootstrap]);

  const hasToken = !!configQuery.data?.hasToken;

  const adAccountsQuery = useQuery<{ adAccounts: MetaAdAccount[] }>({
    queryKey: ["/api/meta/ad-accounts", activeStoreId],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/meta/ad-accounts");
      return (await res.json()) as { adAccounts: MetaAdAccount[] };
    },
    enabled:
      !!activeStoreId &&
      hasToken &&
      (step === "accounts" || step === "campaigns" || step === "review"),
  });

  const campaignsQuery = useQuery<{ campaigns: MetaCampaign[] }>({
    queryKey: ["/api/meta/campaigns", activeStoreId, selectedAdAccountId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/meta/campaigns?adAccountId=${encodeURIComponent(
          selectedAdAccountId ?? "",
        )}`,
      );
      return (await res.json()) as { campaigns: MetaCampaign[] };
    },
    enabled:
      !!activeStoreId &&
      !!selectedAdAccountId &&
      (step === "campaigns" || step === "review"),
  });

  // ── Mutations ────────────────────────────────────────────────────
  const saveTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/meta/config", {
        accessToken: tokenInput,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Token saved",
        description: "Your Meta access token is securely stored.",
      });
      setTokenInput("");
      setStep("accounts");
      queryClient.invalidateQueries({
        queryKey: ["/api/meta/config", activeStoreId],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save token",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAdAccountId) throw new Error("No ad account selected");
      const cfg: MetaAdAccountConfig = {
        adAccountId: selectedAdAccountId,
        linkedCampaignIds: syncAll ? [] : Array.from(selectedCampaignIds),
        syncAll,
      };
      const res = await apiRequest("PUT", "/api/meta/config", {
        adAccountsConfig: [cfg],
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Meta Ads connected",
        description: "Pulling the last 30 days of data — this can take a minute.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/meta/config", activeStoreId],
      });
      syncHistoricalMutation.mutate();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save configuration",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const syncHistoricalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/sync", { days: 30 });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Historical sync complete",
        description: "30 days of Meta data are now on your dashboard.",
      });
      // Refresh anything the dashboard reads off marketing_metrics.
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Configuration saved, but sync failed",
        description:
          err.message +
          " — you can retry the sync from Pare once the issue is resolved.",
        variant: "destructive",
      });
      // Still close the sheet — the config DID save; only the
      // backfill failed, which the user can re-trigger later.
      onClose();
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────
  const selectedAdAccount = useMemo(
    () =>
      adAccountsQuery.data?.adAccounts.find(
        (a) => a.id === selectedAdAccountId,
      ) ?? null,
    [adAccountsQuery.data, selectedAdAccountId],
  );

  const filteredCampaigns = useMemo(() => {
    const all = campaignsQuery.data?.campaigns ?? [];
    if (!campaignSearch.trim()) return all;
    const q = campaignSearch.trim().toLowerCase();
    return all.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaignsQuery.data, campaignSearch]);

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saving =
    saveConfigMutation.isPending || syncHistoricalMutation.isPending;

  // ── Render ───────────────────────────────────────────────────────
  if (!activeStoreId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
        Select an active store to configure Meta Ads.
      </div>
    );
  }

  if (configQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaStepHeader step={step} />

      {step === "credentials" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Connect Meta Business</h3>
            <p className="text-xs text-muted-foreground">
              Paste a System User access token from Meta Business Manager.
              We'll store it encrypted and never expose it back to the
              browser.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta-token">System User Access Token</Label>
            <Input
              id="meta-token"
              type="password"
              autoComplete="off"
              placeholder="EAAB..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              data-testid="input-meta-token"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => saveTokenMutation.mutate()}
              disabled={
                !tokenInput.trim() || saveTokenMutation.isPending
              }
              data-testid="button-meta-save-token"
            >
              {saveTokenMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save & Continue
            </Button>
          </div>
        </div>
      )}

      {step === "accounts" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Choose an ad account</h3>
            <p className="text-xs text-muted-foreground">
              Pick the Meta ad account you want to attribute spend from.
            </p>
          </div>
          {adAccountsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : adAccountsQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(adAccountsQuery.error as Error)?.message ??
                "Could not load ad accounts."}
            </div>
          ) : (
            <div
              className="space-y-2"
              data-testid="list-meta-ad-accounts"
            >
              {(adAccountsQuery.data?.adAccounts ?? []).map((acc) => {
                const isSel = selectedAdAccountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAdAccountId(acc.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      isSel
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {acc.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {acc.id}
                          {acc.currency ? ` · ${acc.currency}` : ""}
                          {acc.business_name
                            ? ` · ${acc.business_name}`
                            : ""}
                        </div>
                      </div>
                      {isSel && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
              {(adAccountsQuery.data?.adAccounts ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                  No ad accounts visible to this token.
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("credentials")}
              data-testid="button-meta-back"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Edit token
            </Button>
            <Button
              onClick={() => setStep("campaigns")}
              disabled={!selectedAdAccountId}
              data-testid="button-meta-continue"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "campaigns" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Pick campaigns to track</h3>
            <p className="text-xs text-muted-foreground">
              Link specific campaigns, or sync every campaign in this
              account automatically.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="meta-sync-all" className="text-sm">
                Link all campaigns automatically
              </Label>
              <p className="text-xs text-muted-foreground">
                New campaigns added in Meta will be picked up on the next
                sync.
              </p>
            </div>
            <Switch
              id="meta-sync-all"
              checked={syncAll}
              onCheckedChange={setSyncAll}
              data-testid="switch-meta-sync-all"
            />
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Search campaigns…"
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              disabled={syncAll}
              data-testid="input-meta-campaign-search"
            />
            {campaignsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : campaignsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {(campaignsQuery.error as Error)?.message ??
                  "Could not load campaigns."}
              </div>
            ) : (
              <div
                className={`rounded-lg border divide-y max-h-80 overflow-y-auto ${
                  syncAll ? "opacity-60" : ""
                }`}
                data-testid="list-meta-campaigns"
              >
                {syncAll && (
                  <div className="p-3 text-xs text-muted-foreground">
                    All current and future campaigns will be synced.
                  </div>
                )}
                {filteredCampaigns.map((c) => {
                  const checked = selectedCampaignIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCampaign(c.id)}
                        disabled={syncAll}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.objective ?? "—"}
                          {c.status ? ` · ${c.status}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {!syncAll && filteredCampaigns.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    No campaigns match your search.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("accounts")}
              data-testid="button-meta-back"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep("review")}
              disabled={!syncAll && selectedCampaignIds.size === 0}
              data-testid="button-meta-continue"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Review & save</h3>
            <p className="text-xs text-muted-foreground">
              Confirm the configuration before we start syncing.
            </p>
          </div>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between p-3">
              <span className="text-xs text-muted-foreground">
                Ad account
              </span>
              <span className="text-sm font-medium">
                {selectedAdAccount?.name ?? selectedAdAccountId ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3">
              <span className="text-xs text-muted-foreground">
                Sync all campaigns
              </span>
              <Badge variant="outline">{syncAll ? "Yes" : "No"}</Badge>
            </div>
            <div className="flex items-center justify-between p-3">
              <span className="text-xs text-muted-foreground">
                Linked campaigns
              </span>
              <span className="text-sm font-medium">
                {syncAll
                  ? "All campaigns"
                  : `${selectedCampaignIds.size} selected`}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("campaigns")}
              disabled={saving}
              data-testid="button-meta-back"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              data-testid="button-meta-save-config"
              onClick={() => saveConfigMutation.mutate()}
              disabled={saving || !selectedAdAccountId}
              className="gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? "Saving & syncing historical data (30 days)…"
                : "Save configuration"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
