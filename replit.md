# OrderSync - Shopify Order Management Platform

## Overview

OrderSync is a real-time order management system for Indian e-commerce brands on Shopify. It addresses challenges like high COD/RTO rates and multi-courier logistics with systematic customer verification. The platform provides a comprehensive team operations dashboard for real-time order tracking, assignment, customer communication, and performance analytics, functioning as a full-stack SaaS application with bidirectional Shopify synchronization.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend uses **React** with **TypeScript**, **Vite** for building, **Wouter** for routing, and **TanStack Query** for server state management. **shadcn/ui** (based on Radix UI) and **Tailwind CSS** form the UI, following Material Design principles with a custom color palette for light/dark modes and semantic status colors. Components are modular, with reusable UI elements and feature-specific components. An OrderQuickPreview drawer dynamically fetches order details, items, and history. State management uses React hooks, TanStack Query, localStorage for auth, and a context provider for themes.

### Backend

The backend is built with **Node.js**, **Express**, and **TypeScript**, utilizing **Drizzle ORM** for type-safe SQL queries against a **Neon Serverless PostgreSQL** database. It features a modular route system, a storage abstraction layer, and custom middleware. API endpoints are RESTful, prefixed with `/api`, use credential-based session management, and provide structured JSON error responses.

### Database Schema

The system uses **PostgreSQL** via Neon with **Drizzle ORM**. Key tables include Users (with UUIDs, roles, admin types, and granular permissions), Invites (for team member onboarding), Orders, Order Items, Customers, and Calls (for IVR Click-to-Call tracking, linked to orders and agents). A 2-role permission system (Admin with Full or Partial Control, and Agent) is implemented, with permissions stored as JSONB for flexibility.

### Authentication & Authorization

A 2-role permission system (Admin and Agent) is used. Admins can be "Full Control" (unrestricted) or "Partial Control" (customizable permissions across Team Management, Order Management, Analytics & Reports, and System Settings). Permissions are stored as JSONB and validated server-side. 

**Current Authentication Flow** (localStorage-based, temporary solution):
- Login page calls public endpoint `GET /api/users/by-email/:email` which returns user data for both admins and agents
- Upon successful login, userId, userEmail, and userRole are stored in localStorage
- All frontend components read userId directly from localStorage for API calls
- Notification endpoints (`/api/notifications`, `/api/notifications/unread-count`) accept userId as query parameter
- Proper JWT/session-based authentication planned for future milestone

**Team Invite System**: A two-modal email-based invite flow with secure, expiring tokens:
1. **Initial Invite Modal**: Captures basic information (email, name, role). Created via `POST /api/invites` with invitedBy field tracking the inviter.
2. **Configure Permissions Modal**: Opens automatically for admin invites. Allows selection of admin type (Full/Partial Control) and granular permissions. Updates via `PATCH /api/invites/:id/permissions`.

This separation provides a cleaner UX by deferring complex permission configuration until after the invite is sent. Security considerations include backend route protection, conditional validation, permission-based access control, webhook signature verification, and planned session-based authentication with HTTP-only cookies and CSRF protection.

### Real-Time Capabilities

Planned features include WebSocket connections for live order updates, bidirectional sync with Shopify, and real-time notifications for order assignments and status changes.

### Theme System

A custom theme system supports light and dark modes via CSS variables and a theme provider, with semantic color tokens for various UI states.

## External Dependencies

### Shopify Integration

OAuth is used for secure store connection and access token management. The **Shopify Admin API** facilitates historical order fetching and real-time sync via an **n8n webhook relay system**. Webhooks are verified using HMAC for direct Shopify calls and header-based checks for n8n relays. Three distinct n8n workflows handle `orders/create`, `orders/updated`, and `orders/cancelled` events. A detailed order status mapping system uses `status` (internal workflow), `shipmentStatus` (courier tracking), and `fulfillmentStatus` (Shopify) to accurately reflect order progress.

### UI Component Libraries

**Radix UI Primitives** provide accessible, unstyled components (Dialog, Dropdown, Select, etc.), which are styled with **shadcn/ui** and **Tailwind CSS**.

### Telephony Integration

**IVR (Interactive Voice Response)** is integrated using environment variables for API token and DID number. Agent extensions are stored in the database for routing. A **Click-to-Call API** (`POST /api/calls/initiate`) integrates with an IVR Solutions API using `application/x-www-form-urlencoded` format, tracking call attempts in the database. Frontend features include a phone button, TanStack Query mutations, toast notifications, loading states, and a cooldown. IVR diagnostic tools include a Settings page widget and a backend endpoint (`GET /api/ivr/test-credentials`) for connection status and troubleshooting.

### Styling & Design

**Inter** is used for primary UI font, and **JetBrains Mono** for monospace. **Tailwind CSS** with PostCSS provides styling, supporting responsive design and custom utilities.

### Development Tools

**Vite** is used for client bundling and HMR. **TypeScript** and **esbuild** are used for server bundling. **Cartographer** aids code navigation within Replit.

### Date Handling

**date-fns** is used for date formatting, manipulation, and relative time displays.

## Call Status Workflow

### Overview
A simplified three-status workflow for systematic customer verification: **Confirmed**, **Cancelled**, and **Follow Up**. Each status action includes modals for data capture and automatically creates order history entries.

### Status Actions

**1. Confirmed**
- Endpoint: `POST /api/orders/:id/confirm`
- Sets `confirmed_at` timestamp
- Direct action with optional note
- Order appears in Fulfil page (`/fulfil`)
- Creates order history entry with event type "confirmed"

**2. Cancelled**
- Endpoint: `POST /api/orders/:id/cancel`
- Opens CancelOrderModal with required reason selection
- 8 cancellation reasons: Wrong Number, Customer Denied, Address Issue, Payment Issue, Duplicate Order, Product Unavailable, Changed Mind, Other
- Optional notes field
- Sets `cancelled_at` timestamp and stores reason
- Creates order history entry with event type "cancelled"

**3. Follow Up**
- Endpoint: `POST /api/orders/:id/followup`
- Opens FollowUpModal with time selection
- Quick presets: 30 Minutes, 1 Hour, 2 Hours, 4 Hours, Tomorrow
- Custom date/time picker available
- Optional notes field
- Sets `followupAt` timestamp
- Creates order history entry with event type "followup_scheduled"
- Background task creates notification when follow-up is due

### UI Components
- **CallStatusActions**: Reusable component with three action buttons, integrated into orders table and order detail drawer
- **CancelOrderModal**: Form with reason dropdown and notes textarea
- **FollowUpOrderModal**: Form with quick presets, custom datetime picker, and notes textarea
- **Order History Timeline**: Displays all status changes with timestamps, agent names, and action details

### Notifications System
- Bell icon in header with unread count badge
- Background checker runs every 60 seconds
- Creates `followup_reminder` notifications when `followupAt` time is reached
- Only creates notifications for orders with `assignedTo` value (skips unassigned orders)
- Endpoints: `GET /api/notifications?userId=X`, `GET /api/notifications/unread-count?userId=X`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`

### Fulfil Page
- Displays confirmed orders only (`confirmed_at IS NOT NULL`)
- Filters: Date range (from/to), Agent dropdown, Payment method (COD/Prepaid)
- Shows order details with confirmation timestamps
- Accessible via sidebar: Orders > Fulfil

### Agent Filtering
- Agents see only orders assigned to them (`assignedTo = userId`)
- Orders page defaults to showing all assigned orders (activeTab = "all")
- Progress bar "Total Orders" counts all orders visible to the user
- Agents cannot take actions on unassigned orders

### Recent Fixes (October 2025)
1. **Authentication**: Created public `/api/users/by-email/:email` endpoint for login, updated all components to use localStorage userId
2. **Notifications API**: Updated to accept userId from query params instead of req.user
3. **Orders Page**: Fixed activeTab default from "assigned" to "all" so agents see all their orders
4. **Progress Bar**: Fixed "Total Orders" count to show actual total instead of only assigned
5. **Background Task**: Added check to skip notifications for unassigned orders (prevents null user_id errors)