# Shopify Order Management & Team Operations Platform for Indian E-Commerce

## **Project Overview:**

The goal of this project is to develop a modern, real-time order management system specifically designed for Indian e-commerce brands operating on Shopify. The system will address critical operational challenges including COD order verification, RTO (Return to Origin) reduction, intelligent order assignment, team coordination, and performance tracking. The platform will provide a unified interface where brands can manage their entire order-to-delivery lifecycle while empowering their operations teams with smart automation, in-app calling capabilities, and actionable insights.

The system will take into account the unique challenges of the Indian e-commerce landscape—high COD order volumes, RTO rates, multi-courier logistics, and the need for systematic customer verification before dispatch. Additionally, it will provide tools for team management, attendance tracking, performance analytics, and continuous learning to ensure operational excellence and scalability.

## **Level:**

Medium to Hard

### **Type of Project:**

Full-Stack SaaS Development, E-Commerce Operations, Real-Time Systems, Team Management

### **Skills Required:**

- React
- Node.js & Express
- Real-Time Data Synchronization (WebSockets)
- Shopify API & Webhooks
- Telephony Integration (Twilio/Exotel)
- Database Management (Replit DB/PostgreSQL)
- shadcn/ui Components
- Shipping API Integration
- Sentiment Analysis (OpenAI API)
- UI Development

---

## **Key Features**

### **Milestone 1: Foundation & Shopify Sync**

**Core Infrastructure:**
- **Shopify Store Connection:**
  - OAuth authentication flow to securely connect Shopify stores
  - Fetch and display all historical orders via Shopify Admin API
  - Clean table interface using shadcn Table component
  - Display key order information: Order ID, Customer Name, Items, Total, Payment Method, Status, Date

- **Real-Time Bidirectional Sync:**
  - Implement webhook listeners for order events (orders/create, orders/update, orders/cancelled)
  - Automatic order ingestion when new orders are placed on Shopify
  - Bidirectional sync ensuring status changes in app reflect back to Shopify instantly
  - WebSocket connections for live UI updates across all connected users

- **Order Management Views:**
  - Advanced filtering by status (Pending, Assigned, Confirmed, Cancelled, Shipped, Delivered, NDR)
  - Search functionality by order number, customer name, phone number
  - Sort by date, order value, priority level
  - Payment method badges (COD vs Prepaid)

- **User Authentication & Role Management:**
  - Secure JWT-based authentication
  - Role-based access control (Admin, Manager, Agent)
  - Team member invitation system via email
  - Role-specific dashboard views and permissions

**Success Criteria:**
- Orders sync from Shopify to app within 5 seconds of placement
- App accurately displays all historical orders with correct data
- Status updates in app reflect in Shopify within 10 seconds
- Role-based access correctly restricts agent views to assigned orders only

---

### **Milestone 2: Intelligent Order Assignment Engine**

**Automated Distribution System:**
- **Smart COD Detection & Assignment:**
  - Automatically identify all COD orders requiring verification
  - Intelligent round-robin distribution algorithm to Present staff
  - Load-balanced assignment preventing agent overload
  - Real-time tracking of orders per agent for fair distribution

- **Presence-Based Assignment Logic:**
  - Orders assigned ONLY to staff with Presence status = "Present"
  - Presence status options: Present, On Leave, Inactive
  - All active staff automatically marked "Present" by default
  - During approved leave, Presence automatically set to "On Leave" (no assignments)
  - Admins can manually mark staff as "Inactive" to pause assignments
  - Assignment eligibility determined by Presence status, NOT Clock In/Out status
  - Staff can receive orders even if they haven't clocked in that day (as long as Presence = Present)

- **Agent Dashboard:**
  - "My Orders" view showing only assigned orders
  - Order cards with essential information: customer details, items, delivery address, phone
  - Visual status indicators (New, In Progress, Completed)
  - Quick action buttons: Call Customer, Update Status, View Details

- **Attendance & Presence System:**
  - **Clock In/Out for Attendance Tracking:**
    - One-click Clock In/Out functionality
    - Attendance log with timestamps (date, clock-in time, clock-out time, total hours)
    - Used purely for HR records and payroll purposes
    - Does NOT control order assignment eligibility

  - **Presence Status for Order Assignment:**
    - Three status options: Present, On Leave, Inactive
    - All active staff automatically marked "Present" by default
    - Staff marked "On Leave" during approved leave periods (no assignments)
    - Admins can manually set staff to "Inactive" to pause assignments
    - Orders distributed ONLY to staff with Presence = "Present"
    - Staff can receive orders even without clocking in (if Presence = Present)

- **Admin Override Controls:**
  - Manual order reassignment capability
  - Pause/resume auto-assignment for specific agents
  - Bulk order assignment for special cases
  - View all agent workloads in real-time

**Success Criteria:**
- Orders distributed evenly within 10 seconds of staff being marked Present
- Staff with Presence = "On Leave" or "Inactive" receive zero assignments
- Orders successfully assigned to Present staff regardless of Clock In status
- Admins can successfully reassign any order with instant effect

---

### **Milestone 3: In-App Calling & Status Management**

**Integrated Communication System:**
- **In-App Telephony:**
  - "Call Customer" button initiating calls through integrated dialer (Twilio/Exotel API)
  - In-app dialer widget showing call status (Connecting, Active, Ended)
  - Real-time call duration timer
  - Automatic call recording for all conversations
  - Call recordings stored securely with order reference

- **Streamlined Status Update Workflow:**
  - Quick status action buttons appearing during/after call:
    - ✅ **Confirmed** → Moves order to fulfillment queue, syncs to Shopify
    - ❌ **Cancelled** → Opens modal for cancellation reason selection with notes
    - 📞 **No Answer** → Automatically schedules follow-up in 2 hours
    - ⏰ **Follow-up Later** → Agent selects custom date/time for callback
  - Status changes instantly sync to Shopify (tags, notes, internal status)
  - Order timeline showing all status changes and actions

- **Cancellation Reason Management:**
  - Pre-built dropdown of common Indian e-commerce cancellation reasons:
    - Customer changed mind
    - Found better price elsewhere
    - Wrong item/size/color ordered
    - Delivery time too long
    - Family member disapproved
    - Fake/test order
    - Customer unreachable
    - Address issues
  - Optional notes field for additional context
  - Analytics on cancellation reasons for insights

- **Call History & Audit Trail:**
  - Complete call log per order (date, time, duration, outcome, agent)
  - Playback functionality for recorded calls (admin/manager access)
  - Download call recordings for training/quality assurance
  - Searchable call history across all orders

- **Follow-Up Management:**
  - Dedicated "Follow-Ups" tab in agent dashboard
  - Orders automatically appear at scheduled follow-up time
  - Follow-ups prioritized over new order assignments
  - Escalation for multiple failed attempts

**Success Criteria:**
- Calls connect within 3 seconds of clicking "Call"
- 98%+ call recording success rate
- All status updates sync to Shopify within 10 seconds
- Follow-ups appear exactly at scheduled time with zero delays

---

### **Milestone 4: NDR Management & Resolution System**

**Failed Delivery Recovery:**
- **NDR Detection & Integration:**
  - Webhook integration with major Indian courier APIs (Delhivery, Shiprocket, etc.)
  - Automatic NDR creation when delivery fails
  - NDR reason capture (Customer Unavailable, Wrong Address, Refused Delivery, etc.)
  - Real-time notifications to admins and assigned agents

- **Intelligent NDR Assignment:**
  - Automatic assignment using same round-robin logic as orders
  - High-value order prioritization in NDR queue
  - Separate "NDR Queue" tab in agent dashboard
  - Visual distinction between new orders and NDRs

- **Resolution Workflow:**
  - Call customer to understand delivery failure reason
  - Update resolution action:
    - **Re-attempt Delivery** → Confirm/correct delivery address, schedule new attempt
    - **Schedule Specific Time** → Coordinate delivery window with customer
    - **Convert to Prepaid** → Send payment link, update order type
    - **Return to Origin (RTO)** → Mark as failed, process refund
  - Resolution updates automatically sync back to courier system
  - Courier notification sent when re-attempt scheduled

- **NDR Analytics Dashboard:**
  - NDR rate calculation (% of orders)
  - Breakdown by courier, region, product category
  - Resolution rate per agent
  - Average time to resolve NDRs
  - RTO rate tracking
  - Cost impact analysis (lost revenue from RTOs)

- **Escalation Management:**
  - Automatic escalation for unresolved NDRs after 48 hours
  - Manager assignment for complex cases
  - Customer communication templates for common scenarios

**Success Criteria:**
- NDRs created and assigned within 1 hour of courier notification
- 70% of NDRs successfully resolved before becoming RTO
- Resolution updates sync to courier in real-time
- Clear audit trail for every NDR showing all actions taken

---

### **Milestone 5: Performance Dashboards & Analytics**

**Data-Driven Insights:**
- **Admin Overview Dashboard (shadcn Cards & Recharts):**
  - **Key Metrics Widgets:**
    - Total orders (today/week/month with comparisons)
    - Confirmation rate (% of COD orders confirmed)
    - Cancellation rate (% and trend)
    - NDR rate and RTO rate
    - Average Order Value (AOV)
    - Revenue at risk (pending COD orders value)

  - **Real-Time Operational Metrics:**
    - Orders pending verification (count and value)
    - Active calls in progress
    - Staff currently online
    - Today's confirmed orders vs target
    - Call queue depth

  - **Trend Visualizations:**
    - Order volume trends (line charts)
    - Confirmation rate trends over time
    - RTO rate weekly comparison
    - Peak calling hours heatmap

- **Staff Performance Dashboard:**
  - Comprehensive agent performance table showing:
    - Agent name and online status
    - Calls made today
    - Confirmation rate (%)
    - Cancellation rate (%)
    - Average call duration
    - Customer sentiment score (avg. across all calls)
    - NDR resolution rate
  - Sortable by any metric
  - Color-coded performance indicators (green/yellow/red)
  - Drill-down: Click agent name → detailed call history and order list

- **Order Flow Visualization:**
  - Funnel chart showing conversion at each stage:
    - Total Orders → Assigned → Called → Confirmed → Shipped → Delivered
  - Drop-off identification at each stage
  - Time-to-completion metrics for each stage
  - Bottleneck detection

- **Sentiment Analysis Integration:**
  - Automatic call recording transcription
  - AI-powered sentiment analysis (OpenAI/Google Cloud NLP)
  - Sentiment scoring: Positive, Neutral, Negative
  - Aggregate sentiment score per agent
  - Flag negative sentiment calls for coaching
  - Keyword extraction for common customer concerns
  - Sentiment trends over time

- **Custom Reporting:**
  - Flexible date range selector
  - Export functionality (CSV, Excel)
  - Pre-built report templates:
    - Weekly Performance Summary
    - RTO Deep-Dive Analysis
    - Agent Comparison Report
    - Courier Performance Report
    - Product-wise Cancellation Analysis
  - Scheduled email reports for stakeholders

**Success Criteria:**
- Dashboard loads completely in under 2 seconds
- All metrics update in real-time without page refresh
- Sentiment analysis accuracy above 80%
- Reports generate and export within 5 seconds

---

### **Milestone 6: Team Collaboration & HR Features**

**Unified Team Management:**
- **People Section:**
  - Complete team directory with:
    - Name, role, email, phone, join date
    - Current online/offline status
    - Profile photo
    - Performance summary (calls, confirmation rate, sentiment)
  - Quick actions: Edit role, Update details, Deactivate account
  - Filterable by role, status, performance tier
  - Export team roster

- **Enhanced Attendance Management:**
  - Full attendance history in calendar view
  - Late arrival tracking and alerts
  - Early departure logging
  - Overtime calculation
  - Monthly attendance summary per employee
  - Export attendance reports for payroll
  - Visual indicators for patterns (frequent lateness, absences)

- **Leave Management System:**
  - Staff submit leave requests:
    - Date range picker
    - Leave type (Sick, Casual, Planned)
    - Reason/notes
  - Admin approval workflow:
    - Approve/Reject with comments
    - Leave balance validation
    - Coverage check (minimum staff requirement)
  - Leave balance tracking per employee
  - Leave calendar showing team availability
  - Automatic leave deduction from balance

- **In-App Team Chat:**
  - Real-time team communication channel
  - Order-specific threads (mention orders with #ORDER123)
  - @mentions for direct messages to team members
  - File/image sharing capability
  - Message reactions and threads
  - Searchable message history
  - Unread message indicators

- **Unified Notifications Hub:**
  - Centralized notification center with:
    - New order assignment alerts
    - NDR assignment notifications
    - Leave request status updates
    - Team mentions in chat
    - Performance milestone achievements
    - System updates and announcements
  - Mark as read/unread functionality
  - Notification preferences/settings
  - Browser push notifications
  - Email digest option for missed notifications

**Success Criteria:**
- Chat messages delivered instantly (< 1 second latency)
- Leave workflow reduces email/WhatsApp coordination by 80%
- Zero missed assignments due to notification system
- Attendance tracking eliminates manual spreadsheets

---

### **Milestone 7: Learning Center & Shipping Integration**

**Knowledge & Fulfillment Systems:**
- **Learning Center:**
  - Comprehensive resource library:
    - Standard Operating Procedures (SOPs)
    - Training videos and tutorials
    - Product knowledge guides
    - Call script templates
    - Best practices documentation
  - Content categorization:
    - Onboarding (new hire essentials)
    - Advanced Techniques
    - Policy & Compliance
    - Product Training
    - Soft Skills Development
  - Search functionality across all content
  - Bookmark/favorite resources
  - Completion tracking (admin visibility)
  - Quiz/assessment integration for knowledge validation

- **New Hire Onboarding:**
  - Structured onboarding checklist with milestones:
    - Complete profile setup
    - Watch welcome videos
    - Read essential SOPs
    - Shadow experienced agent
    - Complete first 10 calls
    - Pass assessment quiz
  - Progress tracking (% completion)
  - Auto-assignment of intro training modules
  - Manager sign-off on readiness
  - Time-to-productivity tracking

- **Integrated Shipping Management:**
  - **Courier Selection:**
    - View available couriers for delivery pincode
    - Serviceability check (real-time pincode validation)
    - Rate comparison across couriers
    - Show estimated delivery time
    - Recommend optimal courier based on historical performance

  - **Label Generation:**
    - Generate shipping labels directly in app (Shiprocket/Delhivery API)
    - Bulk label generation (select multiple orders)
    - Print-ready label format (PDF download)
    - Automatic tracking number capture
    - QR code generation for warehouse scanning

  - **Order Fulfillment:**
    - Mark orders as "Fulfilled" with tracking details
    - Auto-sync tracking numbers to Shopify
    - Update fulfillment status in real-time
    - Manifest generation for courier pickup
    - Pickup scheduling integration

- **Courier Performance Analytics:**
  - Delivery success rate per courier
  - Average delivery time (ordered → delivered)
  - NDR rate comparison across couriers
  - Region-wise performance breakdown
  - Cost efficiency analysis
  - Recommendations for best courier per region/product type
  - SLA compliance tracking

**Success Criteria:**
- New agents complete onboarding in under 2 days
- Shipping labels generated in under 30 seconds
- Tracking numbers sync to Shopify within 10 seconds
- Courier selection optimized based on data increases delivery success by 15%

---

## **Technical Architecture**

### **Frontend (React + shadcn UI)**
- **State Management:** Context API + Zustand (for complex state like orders, users)
- **Real-Time Updates:** Socket.io client
- **API Client:** Axios with interceptors for auth
- **Routing:** React Router (role-based protected routes)

### **Backend (Node.js + Express)**
- **API Structure:** RESTful endpoints + WebSocket server
- **Authentication:** JWT tokens
- **Job Queue:** Bull (Redis-backed) for async tasks (webhooks, sentiment analysis)
- **File Storage:** AWS S3 or Cloudflare R2 (call recordings, documents)

### **Database Schema**

#### **Core Tables**

**1. stores**
```sql
id (PK)
shopify_store_id (unique)
store_name
store_domain
access_token (encrypted)
webhook_address
created_at
updated_at
is_active
```

**2. users (Staff/Team Members)**
```sql
id (PK)
store_id (FK → stores.id)
email (unique)
password_hash
name
phone
role (ENUM: 'admin', 'agent')
presence_status (ENUM: 'present', 'on_leave', 'inactive')
created_at
updated_at
is_active
```

**3. customers**
```sql
id (PK)
store_id (FK → stores.id)
shopify_customer_id
name
phone
email
address_line_1
address_line_2
city
state
pincode
landmark
created_at
updated_at
```

**4. products**
```sql
id (PK)
store_id (FK → stores.id)
shopify_product_id
title
sku
price
inventory_quantity
created_at
updated_at
```

**5. orders**
```sql
id (PK)
store_id (FK → stores.id)
shopify_order_id (unique)
order_number
customer_id (FK → customers.id)
assigned_to (FK → users.id, nullable)
payment_method (ENUM: 'cod', 'prepaid')
call_status (ENUM: 'pending', 'confirmed', 'cancelled', 'no_answer', 'follow_up')
shipment_status (ENUM: 'unfulfilled', 'label_generated', 'shipped', 'delivered', 'ndr', 'rto')
automation_status (VARCHAR: 'CNF', 'CLG', etc.)
final_tag (VARCHAR, nullable)
subtotal (DECIMAL)
discount_code (VARCHAR, nullable)
total_amount (DECIMAL)
notes (TEXT, nullable)
order_date
order_time
follow_up_date (nullable)
follow_up_time (nullable)
fulfillment_status (ENUM: 'unfulfilled', 'fulfilled')
fulfillment_date (nullable)
tracking_company (VARCHAR, nullable)
tracking_id (VARCHAR, nullable)
tracking_url (TEXT, nullable)
cancelled_reason (VARCHAR, nullable)
cancelled_notes (TEXT, nullable)
created_at
updated_at
synced_at
```

**6. order_items**
```sql
id (PK)
order_id (FK → orders.id)
product_id (FK → products.id)
shopify_line_item_id
product_title (snapshot)
sku (snapshot)
quantity
price (snapshot)
total (calculated)
created_at
```

**7. calls**
```sql
id (PK)
order_id (FK → orders.id)
agent_id (FK → users.id)
call_sid (Twilio/Exotel call ID)
recording_url (TEXT, nullable)
duration_seconds (INT)
call_outcome (ENUM: 'confirmed', 'cancelled', 'no_answer', 'follow_up')
sentiment_score (DECIMAL, nullable, -1 to +1)
notes (TEXT, nullable)
called_at
created_at
```

**8. ndrs (Non-Delivery Reports)**
```sql
id (PK)
order_id (FK → orders.id)
assigned_to (FK → users.id, nullable)
courier_reason (VARCHAR)
ndr_status (ENUM: 'pending', 'in_progress', 'resolved', 'rto')
resolution_outcome (ENUM: 'reattempt', 'converted_prepaid', 'rto', nullable)
resolution_notes (TEXT, nullable)
reported_at
resolved_at (nullable)
created_at
updated_at
```

**9. attendance**
```sql
id (PK)
user_id (FK → users.id)
date (DATE)
clock_in_time (TIMESTAMP, nullable)
clock_out_time (TIMESTAMP, nullable)
total_hours (DECIMAL, calculated)
presence_status (ENUM: 'present', 'on_leave', 'inactive')
notes (TEXT, nullable)
created_at
updated_at
```

**10. leave_requests**
```sql
id (PK)
user_id (FK → users.id)
start_date (DATE)
end_date (DATE)
leave_type (ENUM: 'sick', 'casual', 'planned')
reason (TEXT)
status (ENUM: 'pending', 'approved', 'rejected')
approved_by (FK → users.id, nullable)
approved_at (nullable)
created_at
updated_at
```

**11. webhook_logs**
```sql
id (PK)
store_id (FK → stores.id)
webhook_topic (VARCHAR: 'orders/create', 'orders/updated', etc.)
shopify_order_id (VARCHAR, nullable)
payload (JSON)
status (ENUM: 'received', 'processed', 'failed')
error_message (TEXT, nullable)
retry_count (INT, default 0)
received_at
processed_at (nullable)
created_at
```

**12. sync_errors**
```sql
id (PK)
store_id (FK → stores.id)
order_id (FK → orders.id, nullable)
sync_type (ENUM: 'order_fetch', 'status_update', 'fulfillment_sync')
error_type (VARCHAR)
error_message (TEXT)
retry_count (INT, default 0)
resolved (BOOLEAN, default false)
occurred_at
resolved_at (nullable)
created_at
```

**13. chat_messages**
```sql
id (PK)
store_id (FK → stores.id)
sender_id (FK → users.id)
order_id (FK → orders.id, nullable - for order-specific threads)
message_text (TEXT)
mentioned_users (JSON array of user IDs, nullable)
sent_at
read_by (JSON array of user IDs who read the message)
created_at
```

**14. notifications**
```sql
id (PK)
user_id (FK → users.id)
notification_type (ENUM: 'order_assigned', 'ndr_assigned', 'leave_approved', 'leave_rejected', 'mention', 'system')
title (VARCHAR)
message (TEXT)
related_order_id (FK → orders.id, nullable)
related_user_id (FK → users.id, nullable)
is_read (BOOLEAN, default false)
action_url (VARCHAR, nullable)
created_at
read_at (nullable)
```

**15. learning_resources**
```sql
id (PK)
store_id (FK → stores.id, nullable - if store-specific)
title (VARCHAR)
description (TEXT)
category (ENUM: 'onboarding', 'advanced', 'policy', 'product', 'soft_skills')
content_type (ENUM: 'video', 'document', 'article', 'sop')
file_url (TEXT, nullable)
content_text (TEXT, nullable)
is_required (BOOLEAN, default false)
order_index (INT - for ordering within category)
created_at
updated_at
```

**16. learning_progress**
```sql
id (PK)
user_id (FK → users.id)
resource_id (FK → learning_resources.id)
completed (BOOLEAN, default false)
completion_date (nullable)
created_at
updated_at
```

#### **Indexes for Performance**

```sql
-- Orders table indexes
CREATE INDEX idx_orders_shopify_id ON orders(shopify_order_id);
CREATE INDEX idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX idx_orders_call_status ON orders(call_status);
CREATE INDEX idx_orders_shipment_status ON orders(shipment_status);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_order_date ON orders(order_date DESC);
CREATE INDEX idx_orders_store_payment ON orders(store_id, payment_method);

-- Customers table indexes
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_shopify_id ON customers(shopify_customer_id);

-- Calls table indexes
CREATE INDEX idx_calls_order_id ON calls(order_id);
CREATE INDEX idx_calls_agent_id ON calls(agent_id);
CREATE INDEX idx_calls_called_at ON calls(called_at DESC);

-- NDRs table indexes
CREATE INDEX idx_ndrs_order_id ON ndrs(order_id);
CREATE INDEX idx_ndrs_assigned_to ON ndrs(assigned_to);
CREATE INDEX idx_ndrs_status ON ndrs(ndr_status);

-- Attendance table indexes
CREATE INDEX idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX idx_attendance_date ON attendance(date DESC);

-- Webhook logs indexes
CREATE INDEX idx_webhook_logs_store_id ON webhook_logs(store_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_received_at ON webhook_logs(received_at DESC);

-- Notifications indexes
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

#### **Key Design Decisions**

1. **Scalability for Multi-Store:**
   - All core tables include `store_id` foreign key
   - Easy to add multiple stores per brand with minimal refactoring
   - Query optimization using store_id in compound indexes

2. **Product Snapshots:**
   - `order_items` stores product snapshot data (title, sku, price) for historical accuracy
   - Links to `products` table for current inventory/analytics
   - Prevents issues when product details change after order placement

3. **Single Phone Number:**
   - One phone per customer in MVP
   - Column design allows easy expansion to phone_numbers junction table later

4. **Webhook Reliability:**
   - `webhook_logs` tracks all incoming webhooks for debugging
   - `sync_errors` provides detailed error tracking
   - Retry count fields enable exponential backoff logic

5. **Performance Optimization:**
   - Strategic indexes on high-query columns
   - ENUM types for constrained values (reduces storage, improves query speed)
   - JSON fields only where truly flexible data needed (mentioned_users, read_by)

6. **Assignment Logic:**
   - `assigned_to` in orders table = current assignment only
   - No historical assignment tracking in MVP (can add audit log table later)
   - NULL when unassigned

7. **Presence vs Attendance:**
   - `presence_status` in users table = real-time assignment eligibility
   - `attendance` table = daily clock in/out records for HR/payroll
   - Separate concerns for clarity

### **Shopify Integration**
- **APIs Used:** Admin REST/GraphQL API (orders, customers, fulfillment)
- **Webhooks:** orders/create, orders/updated, orders/cancelled, fulfillments/create
- **Scopes Required:** read_orders, write_orders, read_customers, write_fulfillments

### **Telephony Integration (Twilio/Exotel)**
- **Features Used:** Programmable Voice, Call Recording, Call Logs
- **Flow:** App → API → Twilio → Customer | Recording → S3 → App

### **Sentiment Analysis**
- **Approach:** Transcribe call → Send to OpenAI/Google NLP → Extract sentiment
- **Frequency:** Async job after call ends
- **Output:** Score (-1 to +1) + Keywords

---

## **User Experience & Interface Design**

### **Design Principles**
1. **Clarity Over Complexity:** Every screen has one primary action
2. **Speed Matters:** Minimize clicks—agents complete tasks in 3 clicks or less
3. **Visual Hierarchy:** Use shadcn components (Cards, Badges, Tables) to organize info
4. **Responsive & Mobile-First:** Works seamlessly on tablets/phones
5. **Real-Time Feedback:** Loading states, success messages, error handling

### **Color System (Tailwind/shadcn)**
- **Primary:** Blue (actions, links)
- **Success:** Green (confirmed orders, positive metrics)
- **Warning:** Orange (follow-ups, pending tasks)
- **Danger:** Red (cancellations, RTO, negative sentiment)
- **Neutral:** Gray (secondary info, disabled states)

### **Key UI Components (shadcn)**
- **Tables:** Order lists with sorting, filtering
- **Cards:** Dashboard widgets, order details
- **Modals/Dialogs:** Status updates, confirmations
- **Toasts:** Success/error notifications
- **Badges:** Status indicators (New, Confirmed, NDR)
- **Charts:** Performance graphs (Recharts integration)
- **Forms:** Status updates, leave requests
- **Command Palette:** Quick search/navigation (Cmd+K)

---

## **Security & Compliance**

### **Data Protection**
- Encrypt call recordings at rest (AES-256)
- HTTPS for all API communication
- Customer PII masked for non-admin users
- Regular backups (daily)

### **Access Control**
- Role-based permissions (Admin, Manager, Agent)
- API rate limiting
- Session timeout after inactivity

### **Indian Compliance**
- TRAI DND compliance—verify consent before calling
- Data residency (store data in India for local customers)
- GDPR/DPDPA readiness—allow customer data deletion

---

## **Success Metrics (KPIs)**

### **Business Metrics**
- **RTO Reduction:** Target 30-50% reduction in first 3 months
- **Order Confirmation Rate:** >85%
- **NDR Resolution Rate:** >70%
- **Average Call Duration:** <3 minutes
- **Staff Utilization:** >80% of work hours on productive calls

### **Technical Metrics**
- **Sync Latency:** <5 seconds Shopify → App
- **Call Connection Success:** >98%
- **Dashboard Load Time:** <2 seconds
- **Uptime:** 99.5%

### **User Adoption**
- **Daily Active Users (DAU):** 80% of team
- **Feature Adoption:** 90% of orders verified via in-app calling (vs external tools)
- **Training Completion:** 100% of new hires complete onboarding in <3 days

---

## **Risks & Mitigations**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shopify API rate limits | High | Implement caching, batch requests, exponential backoff |
| Call quality issues | High | Use tier-1 telephony provider, test across networks |
| Agent resistance to new tool | Medium | Comprehensive training, gradual rollout, gather feedback |
| Webhook delivery failures | Medium | Retry mechanism, queue system, manual sync fallback |
| Data privacy breach | High | Encryption, access controls, regular security audits |
| Sentiment analysis inaccuracy | Low | Human review of flagged calls, model fine-tuning |

---

## **Future Enhancements (Post-MVP)**

### **Phase 2**
- Multi-language support (Hindi, Tamil, Bengali)
- AI-powered smart replies (suggested responses during calls)
- Predictive RTO risk scoring per order
- WhatsApp integration for customer follow-ups
- Mobile apps (iOS/Android)

### **Phase 3**
- Multi-store dashboard (manage 10+ brands)
- Advanced analytics (cohort analysis, LTV prediction)
- Automated fraud detection
- Integration with inventory management systems
- API for third-party integrations

---