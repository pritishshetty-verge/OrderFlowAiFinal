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

A 2-role permission system (Admin and Agent) is used. Admins can be "Full Control" (unrestricted) or "Partial Control" (customizable permissions across Team Management, Order Management, Analytics & Reports, and System Settings). Permissions are stored as JSONB and validated server-side. An email-based team invite system with secure, expiring tokens allows role and permission assignment during onboarding. Security considerations include backend route protection, conditional validation, webhook signature verification, and planned session-based authentication with HTTP-only cookies and CSRF protection.

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