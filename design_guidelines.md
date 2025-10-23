# Design Guidelines: Shopify Order Management Platform - Milestone 1

## Design Approach: Design System Foundation

**Selected System:** Material Design principles adapted for shadcn/ui components
**Rationale:** This is a data-dense, utility-focused operations dashboard requiring clarity, consistency, and efficient information processing. The interface prioritizes real-time data visibility, quick scanning, and decisive action-taking over visual storytelling.

---

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 222 47% 11% (Deep slate for headers, primary actions)
- Secondary: 210 40% 96% (Light background for cards)
- Accent: 142 76% 36% (Success green for confirmed orders, positive states)
- Destructive: 0 84% 60% (For cancellations, alerts)
- Background: 0 0% 100% (Pure white base)
- Muted: 210 40% 96% (Subtle backgrounds)
- Border: 214 32% 91% (Dividers, table borders)

**Dark Mode:**
- Primary: 210 40% 98% (Light text on dark)
- Secondary: 217 33% 17% (Elevated surfaces)
- Accent: 142 76% 36% (Consistent success green)
- Destructive: 0 84% 60% (Consistent warning red)
- Background: 222 47% 11% (Dark base)
- Muted: 217 33% 17% (Subtle dark backgrounds)
- Border: 217 33% 24% (Dark mode dividers)

**Semantic Status Colors:**
- COD Badge: 45 93% 47% (Amber warning)
- Prepaid Badge: 142 76% 36% (Success green)
- Pending: 43 96% 56% (Yellow)
- Confirmed: 142 76% 36% (Green)
- Cancelled: 0 84% 60% (Red)
- Shipped: 217 91% 60% (Blue)
- NDR: 25 95% 53% (Orange alert)

### B. Typography

**Font Family:** 
- Primary: 'Inter' via Google Fonts CDN
- Monospace: 'JetBrains Mono' for order IDs, phone numbers

**Hierarchy:**
- Page Titles: text-3xl font-bold (30px)
- Section Headers: text-xl font-semibold (20px)
- Card Titles: text-lg font-medium (18px)
- Body Text: text-sm (14px)
- Table Content: text-sm font-normal
- Captions/Metadata: text-xs text-muted-foreground (12px)
- Order IDs: text-sm font-mono

### C. Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card margins: gap-4 to gap-6
- Table cell padding: px-4 py-3

**Grid System:**
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Order table: Full-width responsive table
- Sidebar navigation: Fixed 240px width on desktop, collapsible mobile

### D. Component Library

**Navigation:**
- Top navbar with logo, store name, user avatar dropdown
- Left sidebar with role-based menu items (Orders, Team, Settings)
- Breadcrumb trail for nested views
- Active state: bg-secondary with left border-l-4 border-primary

**Data Tables (shadcn Table):**
- Striped rows with hover states
- Sticky header on scroll
- Column sorting indicators
- Inline action buttons (Call, View, Assign)
- Status badges with pill shape, rounded-full
- Payment method badges with distinct colors
- Dense spacing for information efficiency

**Filters & Search:**
- Horizontal filter bar above table
- Multi-select dropdowns for status filtering
- Search input with debounced live search
- Clear filters button
- Active filter chips showing current selections

**Cards (shadcn Card):**
- Subtle shadow: shadow-sm
- Rounded corners: rounded-lg
- Header with title and optional action button
- Content padding: p-6
- Footer for metadata or actions

**Buttons:**
- Primary: Default shadcn button (solid, high contrast)
- Secondary: variant="outline"
- Destructive: variant="destructive" for cancellations
- Icon buttons: variant="ghost" with icon only
- Loading states with spinner

**Badges & Indicators:**
- Status badges: rounded-full px-3 py-1 text-xs font-medium
- Real-time pulse indicator: Online status with green dot
- Payment method: Larger pill badges with icons

**Forms:**
- Consistent input heights: h-10
- Label above input pattern
- Helper text below inputs: text-xs text-muted-foreground
- Error states with red border and error message
- Form sections with clear spacing

**Modals (shadcn Dialog):**
- Centered overlay with backdrop blur
- Max-width constraints: max-w-2xl
- Clear close button
- Action buttons aligned right in footer

### E. Animations

**Purposeful Motion Only:**
- Table row hover: Subtle background transition (duration-150)
- Real-time updates: Gentle highlight flash on new orders (animate-pulse once)
- Loading states: Skeleton screens with shimmer
- Status badge changes: Smooth color transition
- No decorative animations

---

## Dashboard-Specific Patterns

**Order Table Priority View:**
- COD orders highlighted with colored left border
- High-value orders with priority flag icon
- Unassigned orders in bold
- Recently updated rows with subtle glow (fades in 5s)

**Role-Based UI Adaptation:**
- Admin: Full navigation, all orders visible, assignment controls
- Manager: Limited admin controls, team oversight
- Agent: "My Orders" focused view, simplified navigation

**Real-Time Indicators:**
- WebSocket connection status in top-right corner
- Live order count updates without page refresh
- Toast notifications for new assignments
- Timestamp "X minutes ago" with auto-update

**Information Density:**
- Compact table rows for maximum orders per viewport
- Collapsible order details panel (slide-in from right)
- Tooltip details on hover for truncated content
- Avatar initials for team members (no placeholder images)

---

## Critical Implementation Notes

- **No Hero Sections:** This is not a marketing site
- **Table-First Design:** Orders table is the primary interface
- **Status Clarity:** Color-coded status system must be instantly recognizable
- **Mobile Responsive:** Stack filters vertically, scrollable table on mobile
- **Dark Mode Consistency:** All components including inputs must support dark mode
- **Performance:** Virtualized table rows for 1000+ orders
- **Accessibility:** ARIA labels on all action buttons, keyboard navigation support