# OrderSync - Shopify Order Management Platform

## Overview

OrderSync is a real-time order management system designed for Indian e-commerce brands operating on Shopify. The platform addresses critical operational challenges specific to the Indian market, including high COD (Cash on Delivery) order volumes, RTO (Return to Origin) rates, multi-courier logistics, and systematic customer verification workflows.

The system provides a comprehensive team operations dashboard that enables real-time order tracking, assignment management, customer communication, and performance analytics. It is built as a full-stack SaaS application with bidirectional synchronization with Shopify stores.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React**: Component-based UI with TypeScript for type safety
- **Vite**: Build tool and development server with hot module replacement
- **Wouter**: Lightweight client-side routing
- **TanStack Query (React Query)**: Server state management with automatic caching and refetching

**UI Framework:**
- **shadcn/ui**: Component library built on Radix UI primitives using the "New York" style variant
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Design System**: Material Design principles adapted for data-dense operations dashboards
- Custom color palette supporting both light and dark modes with semantic status colors for order states

**Component Architecture:**
- Modular component structure with separation of concerns
- Reusable UI components in `client/src/components/ui/`
  - StatusBadge: Connection/status indicators with variant support
  - SettingsCard: Clean card wrapper for settings sections
  - CopyButton: Copy-to-clipboard functionality
  - CodeBlock: Code display with syntax highlighting and copy button
- Feature-specific components for orders, analytics, team management
- Page-level components with protected routing based on user roles (admin, manager, agent)
- OrderQuickPreview drawer component with dynamic data fetching:
  - Real customer details including email and shipping address
  - Discount code badge (high-contrast indigo badge when discount code exists)
  - Real order items with product names, variants, quantities, and prices
  - Real payment breakdown with subtotal, discount, shipping, tax, and total
  - Order timeline from status history
  - Loading states with skeleton loaders
  - Three parallel API queries: order details, order items, order history

**State Management:**
- Local state with React hooks
- Server state with TanStack Query
- User authentication state in localStorage
- Theme preferences with context provider

### Backend Architecture

**Technology Stack:**
- **Node.js with Express**: HTTP server and API routing
- **TypeScript**: Type-safe server-side code with ES modules
- **Drizzle ORM**: Type-safe SQL query builder
- **Neon Serverless PostgreSQL**: Database with WebSocket support

**Server Structure:**
- Modular route registration system
- Storage abstraction layer (currently using in-memory storage with interface for database migration)
- Custom middleware for request/response logging and JSON body parsing with raw body preservation (for webhook verification)
- Vite integration for development with HMR and production static file serving

**API Design:**
- RESTful API endpoints prefixed with `/api`
- Credential-based session management
- Error handling with structured JSON responses

### Database Schema

**Current Implementation:**
- PostgreSQL database via Neon Serverless with WebSocket constructor for real-time capabilities
- Drizzle ORM for schema definition and migrations
- User table with UUID primary keys, username, password, first name, last name, role, and agent_extension fields
  - **Agent Extension**: IVR phone extension field for agents (VARCHAR(10), nullable, unique across agents)
- Invites table for managing team member invitation workflow with email, token, expiration, and status tracking
- Orders, order items, customers, and supporting tables for full order management
- **Calls table** for IVR Click-to-Call tracking with fields: order_id, agent_id, customer_phone, call_status, called_at, created_at
  - Tracks all call attempts made through the IVR system
  - Foreign keys to orders and users tables with cascade delete
  - Call status: initiated, connected, failed, completed
- Schema definitions in `shared/schema.ts` for type sharing between client and server

**Planned Schema Extensions:**
- Orders table for Shopify order data
- Team assignments and activity tracking
- Customer verification history
- Analytics and performance metrics
- Leave requests and team messages

### Real-Time Capabilities

**Planned Implementation:**
- WebSocket connections for live order updates across all connected users
- Bidirectional sync with Shopify ensuring status changes reflect instantly
- Real-time notifications for order assignments and status changes

### Authentication & Authorization

**Current Implementation:**
- Role-based access control (admin, manager, agent)
- Role stored in localStorage for client-side routing protection
- Protected routes with automatic redirection to login

**Team Invite System:**
- Email-based invitation workflow replacing direct user creation
- Secure token generation with 7-day expiration
- Invite API endpoint: POST /api/invites (creates invite, logs email to console)
- Future integration with SendGrid or Resend for email delivery
- Users set their own password when accepting invite (invitation link with token)

**Security Considerations:**
- Raw body parsing preserved for webhook signature verification
- Cryptographically secure invite tokens with expiration
- Session-based authentication with HTTP-only cookies (planned)
- CSRF protection for state-changing operations (planned)

### Theme System

**Implementation:**
- Custom CSS variables for light and dark modes
- Theme provider context for toggling and persistence
- Semantic color tokens for order statuses, payment methods, and UI states
- Automatic theme class application to root element

## External Dependencies

### Shopify Integration

**OAuth Authentication:**
- Secure store connection flow
- Access token management for API calls
- Store metadata and configuration storage

**Shopify Admin API:**
- Historical order fetching via manual sync
- Real-time order synchronization via n8n webhook relay
- Status update propagation back to Shopify (planned)

**Webhook Architecture:**
- **n8n Relay System**: Uses n8n as a stable webhook relay to handle Replit's ephemeral URLs
- **Webhook Verification**: Dual-mode verification system
  - Direct Shopify webhooks: HMAC signature verification required
  - n8n relay webhooks: Header-based verification (`X-Forwarded-By: n8n` header required)
- **Simplified Setup**: 3 separate n8n workflows (one per event type) instead of complex Switch workflow
  - orders/create workflow → `/api/webhooks/orders/create`
  - orders/updated workflow → `/api/webhooks/orders/update`
  - orders/cancelled workflow → `/api/webhooks/orders/cancelled`
- **Setup Guides**: 
  - Main settings page (/settings, Shopify tab): Clean status overview with quick actions
  - Initial Setup Guide (/settings/shopify/setup): 3-step wizard for Shopify connection
  - Webhook Setup Guide (/settings/shopify/webhooks): Tabbed guide with detailed n8n configuration

**Order Status Mapping:**
- **Three Status Fields**: The system tracks order progress using three separate status fields:
  - `status`: Application workflow status (Pending → Assigned → Shipped → Delivered)
  - `shipmentStatus`: Real-time courier tracking status (in_transit, out_for_delivery, delivered, etc.)
  - `fulfillmentStatus`: Shopify's fulfillment status (unfulfilled, fulfilled, partial)
- **Status Logic**: Orders are marked "Delivered" ONLY when shipmentStatus = "delivered" (actual courier confirmation)
- **Shipped vs Delivered**: When Shopify reports fulfillmentStatus = "fulfilled", status is set to "Shipped" (not "Delivered")
- **Prevents Confusion**: This ensures users see accurate delivery status instead of confusing "Delivered" for orders still in transit
- **Implementation**: mapShopifyStatus function in server/webhooks.ts handles the status mapping logic

### UI Component Libraries

**Radix UI Primitives:**
- Accessible, unstyled component primitives
- Dialog, Dropdown, Select, Toast, Tooltip, and 20+ other components
- Keyboard navigation and ARIA support

**shadcn/ui Configuration:**
- Component aliases: `@/components`, `@/lib`, `@/hooks`
- Tailwind integration with CSS variables
- Custom border radius and color system

### Telephony Integration

**IVR Configuration:**
- Environment variables for IVR integration:
  - `IVR_API_TOKEN`: API token for IVR service authentication
  - `IVR_DID_NUMBER`: DID number for outbound calling
- Agent extensions stored in database (users.agent_extension field)
- Admins/managers can assign extensions via Team Directory interface

**Agent Extension Management:**
- Each agent can have a unique phone extension (e.g., "101", "102")
- Extensions displayed in team member cards in Team Directory
- Edit dialog allows admins to set/update extensions
- Backend validation ensures extensions are unique across all agents
- Used for routing IVR calls to specific agents

**Click-to-Call API:**
- Endpoint: POST `/api/calls/initiate`
- Request body: `{ userId, orderId, customerPhone }`
- Validates agent has extension configured before initiating call
- Integrates with IVR Solutions API (https://api.ivrsolutions.in/api/c2c_post)
- **CRITICAL**: Uses `application/x-www-form-urlencoded` format (NOT JSON)
  - Body formatted as URLSearchParams: `did=X&ext_no=Y&phone=Z`
  - Authorization header: `Bearer {IVR_API_TOKEN}`
  - This format requirement discovered through working Airtable implementation
- Creates call record in database with status tracking (initiated, connected, failed, completed)
- Returns success/error responses with appropriate messages
- Enhanced error logging with masked credentials and detailed IVR API responses
- Comprehensive error handling for 200/400/404/405/500+ status codes
- Additional endpoints:
  - GET `/api/calls/order/:orderId` - Get all calls for an order
  - GET `/api/calls/agent/:agentId` - Get all calls for an agent
  - GET `/api/ivr/test-credentials` - Test IVR credentials and connection status

**Click-to-Call Frontend:**
- Phone button in orders table Actions column for assigned COD orders
- TanStack Query mutation with proper error handling
- Toast notifications for success ("Call initiated!") and error messages
- Loading states: disabled button with Loader2 spinner during API call
- 5-second cooldown after successful call to prevent duplicate calls
- User ID resolution: fetches real user ID from /api/users using email from localStorage
- Error message parsing from API responses with fallback to generic message
- Button re-enables immediately on error, stays disabled during cooldown on success

**IVR Diagnostic Tools:**
- **Settings Page Widget**: IVR Connection Status card on Settings → Shopify tab
  - Test IVR Connection button with loading states
  - Displays masked API token (first 8 + last 4 chars visible)
  - Shows DID number from configuration
  - Connection status badge (Connected/Not Connected)
  - Color-coded result box (green for success, red for errors)
  - For 405 errors: Lists possible causes and next steps
  - "Test Again" button for retrying
- **Backend Endpoint**: GET `/api/ivr/test-credentials`
  - Safely displays masked IVR credentials
  - Makes test call to IVR API with dummy phone number
  - Returns comprehensive diagnostic information
  - Expected responses:
    - 200/400: Credentials valid (400 expected with test phone)
    - 405: Authentication failed (invalid token or DID)
    - 500+: IVR server errors
- **Documentation**: IVR_SETUP.md with setup checklist and troubleshooting guide

**Future Enhancements:**
- Call duration tracking and sentiment analysis
- WebSocket notifications for call status updates
- Call history panel in order details
- Share currentUserId from parent to avoid duplicate /api/users fetch

### Styling & Design

**Fonts:**
- Inter: Primary UI font family via Google Fonts CDN
- JetBrains Mono: Monospace font for order IDs and phone numbers

**CSS Framework:**
- Tailwind CSS with PostCSS processing
- Custom utility classes for hover and active states
- Responsive design with mobile breakpoint at 768px

### Development Tools

**Replit Integration:**
- Vite plugins for runtime error overlay
- Cartographer for code navigation
- Development banner for Replit environment

**Build Pipeline:**
- TypeScript compilation with strict mode
- Vite for client bundle optimization
- esbuild for server bundle with ESM output

### Data Visualization (Planned)

**Recharts:**
- Bar charts for order trends
- Line charts for revenue analysis
- Pie charts for status and payment distribution

### Date Handling

**date-fns:**
- Date formatting and manipulation
- Relative time display (e.g., "30 minutes ago")
- Calendar component integration