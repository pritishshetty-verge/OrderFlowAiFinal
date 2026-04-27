import { useState } from "react";
import { Link, Redirect } from "wouter";
import {
  Truck,
  Package,
  Webhook,
  MessageCircle,
  ShoppingBag,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ShopifyConnectionCard } from "@/components/settings-shopify-main";

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
        {/* Header bar with active count */}
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
