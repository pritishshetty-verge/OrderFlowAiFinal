# OrderSync - Shopify Order Management Platform

## Overview

OrderSync is a real-time order management system for Indian e-commerce brands on Shopify. Its primary purpose is to reduce high Cash-on-Delivery (COD) and Return-to-Origin (RTO) rates and streamline multi-courier logistics through systematic customer verification. The platform provides a comprehensive team operations dashboard for real-time order tracking, assignment, customer communication, and performance analytics, functioning as a full-stack SaaS application with bidirectional Shopify synchronization.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It utilizes shadcn/ui (based on Radix UI) and Tailwind CSS, adhering to Material Design principles with a custom color palette for light/dark modes.

### Backend

The backend uses Node.js, Express, and TypeScript, with Drizzle ORM for type-safe SQL queries against a Neon Serverless PostgreSQL database. It features a modular route system, a storage abstraction layer, custom middleware, and RESTful API endpoints. Authentication uses localStorage for user data, with plans for a JWT/session-based system.

### Database Schema

The system uses PostgreSQL via Neon with Drizzle ORM. Key tables include Users (with UUIDs, roles, admin types, and granular permissions), Invites, Orders, Order Items, Customers, and Calls. A 2-role permission system (Admin with Full or Partial Control, and Agent) is implemented with permissions stored as JSONB.

### Authentication & Authorization

A 2-role permission system (Admin and Agent) with customizable permissions stored as JSONB. An email-based invite system with secure, expiring tokens facilitates team member onboarding.

### Real-Time Capabilities

Planned features include WebSocket connections for live order updates, bidirectional Shopify sync, and real-time notifications.

### Theme System

A custom theme system supports light and dark modes via CSS variables and a theme provider.

### Avatar System

Users have graphical avatar images (6 presets) randomly assigned on signup, with user selection available. Avatars are stored as filenames in the `users` table.

### Call Status Workflow

A simplified three-status workflow (Confirmed, Cancelled, Follow Up) for customer verification. This involves modals for data capture, automatic order history entries, and scheduled notifications for "Follow Up" orders.

### Orders and Fulfil Pages

The "Orders" page provides role-based filtering, allowing agents to see assigned orders and admins to view all. The "Fulfil" page displays only confirmed orders for shipment processing.

### Attendance & Shift Controller

Timezone-safe attendance tracking with break management for payroll. It features a 3-state workflow (Offline, Working, On Break) and automatically closes open sessions.

### Multi-Courier Integration

The platform supports Shiprocket and Delhivery, including shipment creation, tracking, and unified NDR (Non-Delivery Report) management via dedicated service modules and webhook handlers.

### Shopify Fulfillment Tracking Sync

Fulfillment tracking data (trackingNumber, trackingUrl, courierName, shipmentStatus) is consistently synced from Shopify across all order ingestion paths and displayed prominently.

### Learning Center (LMS)

A comprehensive Learning Management System with a course/lesson hierarchy, video embedding, rich text content, lesson prerequisites, progress tracking, and category-based organization. It includes a publish/draft system for courses and lessons, ensuring agents only see published content. Admin interfaces are provided for course and lesson management.

## External Dependencies

- **Shopify Integration**: OAuth for store connection, Shopify Admin API for historical data, and n8n webhook relay for real-time sync (`orders/create`, `orders/updated`, `orders/cancelled`).
- **UI Component Libraries**: Radix UI Primitives, shadcn/ui.
- **Telephony Integration**: IVR solutions API via environment variables for Click-to-Call functionality.
- **Styling & Design**: Tailwind CSS with PostCSS, Inter (UI font), JetBrains Mono (monospace).
- **Development Tools**: Vite, TypeScript, esbuild, Cartographer.
- **Date Handling**: date-fns.