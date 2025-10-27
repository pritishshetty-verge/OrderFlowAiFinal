# OrderSync - Shopify Order Management Platform

## Overview

OrderSync is a real-time order management system for Indian e-commerce brands on Shopify. It aims to reduce high COD/RTO rates and streamline multi-courier logistics through systematic customer verification. The platform offers a comprehensive team operations dashboard for real-time order tracking, assignment, customer communication, and performance analytics, functioning as a full-stack SaaS application with bidirectional Shopify synchronization.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend uses React with TypeScript, Vite for building, Wouter for routing, and TanStack Query for server state management. The UI is built with shadcn/ui (based on Radix UI) and Tailwind CSS, following Material Design principles with a custom color palette for light/dark modes and semantic status colors. Components are modular, utilizing React hooks, TanStack Query, localStorage for authentication, and a context provider for themes.

### Backend

The backend is built with Node.js, Express, and TypeScript, using Drizzle ORM for type-safe SQL queries against a Neon Serverless PostgreSQL database. It features a modular route system, a storage abstraction layer, and custom middleware. API endpoints are RESTful, prefixed with `/api`, use credential-based session management, and provide structured JSON error responses.

### Database Schema

The system uses PostgreSQL via Neon with Drizzle ORM. Key tables include Users (with UUIDs, roles, admin types, and granular permissions), Invites (for team member onboarding), Orders, Order Items, Customers, and Calls (for IVR Click-to-Call tracking). A 2-role permission system (Admin with Full or Partial Control, and Agent) is implemented, with permissions stored as JSONB.

### Authentication & Authorization

A 2-role permission system (Admin and Agent) allows for "Full Control" or "Partial Control" admins with customizable permissions. Permissions are stored as JSONB and validated server-side. The current authentication uses localStorage for user data (userId, userEmail, userRole) after login, with plans for a future JWT/session-based system. A two-modal email-based invite system with secure, expiring tokens facilitates team member onboarding and permission configuration.

### Real-Time Capabilities

Planned features include WebSocket connections for live order updates, bidirectional sync with Shopify, and real-time notifications for order assignments and status changes.

### Theme System

A custom theme system supports light and dark modes via CSS variables and a theme provider, with semantic color tokens.

### Call Status Workflow

A simplified three-status workflow (Confirmed, Cancelled, Follow Up) enables systematic customer verification. Each status action involves modals for data capture, automatically creating order history entries and, for "Follow Up", scheduling notifications. Notifications are managed by a background checker that creates `followup_reminder` notifications when due.

### Orders and Fulfil Pages

The "Orders" page provides role-based filtering, allowing agents to see only their assigned orders, while admins view all orders. Filters include "All Orders", "Pending", "Confirmed", "Cancelled", and "Follow Up" tabs. The "Fulfil" page displays only confirmed orders for shipment processing, accessible to all agents and admins.

### Shiprocket Integration

The Shiprocket integration manages advanced shipment tracking, failed delivery (NDR) management, and automated reattempt scheduling. It involves creating Shiprocket shipments for confirmed orders, monitoring delivery status via webhooks (at `/api/webhooks/courier-events` - renamed from `/shiprocket` due to Shiprocket URL restrictions), and allowing agents to handle NDR cases with address updates and reattempt scheduling through dedicated UI components and API endpoints. Webhook security is enforced via HMAC-SHA256 signature verification using the `SHIPROCKET_WEBHOOK_SECRET` environment variable.

### Learning Center (LMS)

A comprehensive Learning Management System inspired by Skool.com provides structured training for team members. The system includes:

**Core Features:**
- Course/Lesson hierarchy with progress tracking
- Video embedding support (YouTube, Vimeo) via iframe
- Rich text lesson content with HTML support
- Lesson prerequisites to enforce learning sequences
- Progress tracking (completion percentage, time spent, bookmarks)
- Category-based course organization (onboarding, operations, training)
- Difficulty levels (beginner, intermediate, advanced)

**Database Schema:**
- `courses`: Course metadata, categories, difficulty, estimated duration
- `lessons`: Individual lessons with content, videos, and sequencing
- `resources`: Downloadable files and reference materials
- `user_lesson_progress`: Tracks completion, time spent, bookmarks
- `lesson_analytics`: View counts and engagement metrics
- `onboarding_checklists`: Role-based onboarding tasks
- `user_onboarding_progress`: Checklist completion tracking

**API Endpoints:**
- `GET /api/learning/courses` - List all courses with user progress
- `GET /api/learning/courses/:slug` - Course details with lessons
- `GET /api/learning/lessons/:slug` - Individual lesson content
- `POST /api/learning/lessons/:lessonId/progress` - Update progress
- `POST /api/learning/lessons/:lessonId/bookmark` - Toggle bookmark
- `GET /api/learning/resources` - List resources
- `GET /api/learning/onboarding/:userId` - User's onboarding progress
- Admin routes for content management

**Frontend Pages:**
- Learning Dashboard (`/learning`) - Course catalog with progress cards
- Course Detail (`/learning/courses/:slug`) - Lesson list with prerequisites
- Lesson View (`/learning/lessons/:slug`) - Video player and content display

## External Dependencies

### Shopify Integration

OAuth is used for secure store connection. The Shopify Admin API facilitates historical order fetching and real-time sync via an n8n webhook relay system. Webhooks for `orders/create`, `orders/updated`, and `orders/cancelled` are verified using HMAC for direct Shopify calls and header-based checks for n8n relays.

### UI Component Libraries

Radix UI Primitives provide accessible, unstyled components, which are styled with shadcn/ui and Tailwind CSS.

### Telephony Integration

IVR (Interactive Voice Response) is integrated via environment variables for API tokens and DID numbers. A Click-to-Call API (`POST /api/calls/initiate`) integrates with an IVR Solutions API, tracking call attempts in the database.

### Styling & Design

Inter is used for the primary UI font, and JetBrains Mono for monospace. Tailwind CSS with PostCSS provides styling, supporting responsive design and custom utilities.

### Development Tools

Vite is used for client bundling and HMR. TypeScript and esbuild are used for server bundling. Cartographer aids code navigation within Replit.

### Date Handling

date-fns is used for date formatting, manipulation, and relative time displays.