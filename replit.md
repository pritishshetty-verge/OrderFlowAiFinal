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
- Video embedding support (YouTube, Vimeo) via embed URL (iframe)
- Rich text lesson content with TipTap WYSIWYG editor (supports bold, italic, underline, links, images, lists, alignment)
- Lesson prerequisites to enforce learning sequences (frontend checks prerequisite completion)
- Progress tracking (completion percentage, time spent, bookmarks)
- Category-based course organization (onboarding, operations, training)
- Difficulty levels (beginner, intermediate, advanced)
- **Publish/Draft System**: Courses and lessons have `isPublished` flag; agents only see published content, admins see all

**Database Schema:**
- `courses`: Course metadata, categories, difficulty, estimated duration, isPublished, order
- `lessons`: Individual lessons with content, videos, sequencing, isPublished, prerequisiteLessonIds
- `resources`: Downloadable files and reference materials
- `user_lesson_progress`: Tracks completion, time spent, bookmarks
- `lesson_analytics`: View counts and engagement metrics
- `onboarding_checklists`: Role-based onboarding tasks
- `user_onboarding_progress`: Checklist completion tracking

**API Endpoints (Student/Agent):**
- `GET /api/learning/courses` - List published courses with user progress (defaults to `isPublished=true`)
- `GET /api/learning/courses?isPublished=all` - List all courses (admin use)
- `GET /api/learning/courses/:slug` - Course details with published lessons only
- `GET /api/learning/lessons/:slug` - Individual lesson content
- `POST /api/learning/lessons/:lessonId/progress` - Update progress (completion %, time spent, isCompleted)
- `POST /api/learning/lessons/:lessonId/bookmark` - Toggle bookmark
- `GET /api/learning/resources` - List resources
- `GET /api/learning/onboarding/:userId` - User's onboarding progress

**API Endpoints (Admin):**
- `GET /api/admin/learning/courses/:courseId` - Get course by ID for editing
- `POST /api/admin/learning/courses` - Create new course
- `PATCH /api/admin/learning/courses/:courseId` - Update course (including isPublished toggle)
- `DELETE /api/admin/learning/courses/:courseId` - Delete course
- `GET /api/admin/learning/courses/:courseId/lessons` - Get lessons for course
- `GET /api/admin/learning/lessons/:lessonId` - Get lesson by ID for editing
- `POST /api/admin/learning/lessons` - Create new lesson
- `PATCH /api/admin/learning/lessons/:lessonId` - Update lesson
- `DELETE /api/admin/learning/lessons/:lessonId` - Delete lesson

**Frontend Pages (Agent/Student):**
- Learning Dashboard (`/learning`) - Course catalog with progress cards, category tabs
- Course Detail (`/learning/courses/:slug`) - Lesson list with prerequisites, lock icons, progress tracking
- Lesson View (`/learning/lessons/:slug`) - Video embed, rich content, mark complete button, bookmark, progress bar

**Frontend Pages (Admin):**
- Admin Learning Dashboard (`/learning/admin`) - All courses table with lesson counts, publish/draft toggle buttons
- Course Form (`/learning/admin/courses/:id`) - Create/edit course with metadata, slug generation
- Lesson Form (`/learning/admin/lessons/:id`) - Create/edit lesson with TipTap editor, video embed URL, prerequisites

**Known Implementation Status:**
✅ **Production-Ready & Fully Tested:**
- **Publish/Draft System**: 
  - Course publish toggle in admin dashboard table (one-click)
  - Lesson publish toggle in lesson edit form (Switch component, data-testid="toggle-publish")
  - Agents see only published courses/lessons (filtering enforced backend + frontend)
  - Admin publish workflow tested end-to-end (create → publish → verify agent access)
- **Progress Tracking**: 
  - Completion percentage calculated correctly (33%, 67%, 100% verified)
  - Progress persists across sessions (cache invalidation for both lesson and course queries)
  - Backend field `percentage` matches frontend interface
- **Course Browsing**: 
  - Published courses displayed with progress cards
  - Category tabs functional (onboarding, operations, training)
  - Progress indicators show completion percentage
- **Lesson Viewing**:
  - Mark complete button updates progress immediately
  - Automatic time tracking on lesson page
  - Progress bar reflects completion state
- **Bookmark System**: 
  - Toggle bookmark button persists state
  - Bookmark status loads correctly on page refresh
- **Prerequisite System**: 
  - Lessons with unmet prerequisites show lock icon
  - Prerequisites unlock automatically when dependencies complete
  - Frontend checks prerequisite completion before allowing access
- **TipTap Rich Text Editor**: 
  - All formatting options functional (bold, italic, underline, links, images, lists, alignment)
  - StarterKit properly configured (duplicate extension warnings resolved)
  - Content saves and loads correctly
- **Video Embeds**: 
  - YouTube/Vimeo iframe embedding via embed URL
  - Video displays in lesson view
- **Admin Course/Lesson Management**:
  - Create/edit course form with metadata, slug auto-generation
  - Create/edit lesson form with TipTap editor, video URL, prerequisites, publish toggle
  - All CRUD operations functional

**Testing Summary (December 2024):**
- 10+ automated end-to-end Playwright tests executed
- All core workflows verified: publish, progress tracking, bookmarks, prerequisites, video embeds, admin CRUD
- Architect approved as production-ready
- No critical bugs remaining

⚠️ **Needs Testing:**
- Resource library (file uploads, downloads, tracking)
- Onboarding checklists (role-based task tracking)
- Analytics dashboard (view counts, completion rates)
- Multi-level prerequisite chains (>2 levels deep)
- Course completion calculation with complex lesson hierarchies

📋 **Not Yet Implemented:**
- Lesson reordering UI (drag-and-drop)
- Bulk lesson operations
- Course duplication
- Content versioning
- Student roster/enrollment management

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