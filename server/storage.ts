import {  eq, and, desc, asc, or, count, gte, lte, lt, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { db } from "./db";

const AVATAR_OPTIONS = ["avatar_1.png", "avatar_2.png", "avatar_3.png", "avatar_4.png", "avatar_5.png", "avatar_6.png"];

function getRandomAvatar(): string {
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}

import {
  type User,
  type InsertUser,
  type UpdateUser,
  type Invite,
  type InsertInvite,
  type Customer,
  type InsertCustomer,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type OrderAssignment,
  type InsertOrderAssignment,
  type OrderStatusHistory,
  type InsertOrderStatusHistory,
  type LeaveRequest,
  type InsertLeaveRequest,
  type TeamMessage,
  type InsertTeamMessage,
  type WebhookLog,
  type InsertWebhookLog,
  type ShopifyCredentials,
  type InsertShopifyCredentials,
  type Attendance,
  type InsertAttendance,
  type AttendanceBreak,
  type InsertAttendanceBreak,
  type Call,
  type InsertCall,
  type Notification,
  type InsertNotification,
  type ShopifySyncLog,
  type InsertShopifySyncLog,
  type Shipment,
  type InsertShipment,
  type NdrEvent,
  type InsertNdrEvent,
  type Course,
  type InsertCourse,
  type Lesson,
  type InsertLesson,
  type UserLessonProgress,
  type InsertUserLessonProgress,
  type LessonAnalytics,
  type InsertLessonAnalytics,
  type Resource,
  type InsertResource,
  type OnboardingChecklist,
  type InsertOnboardingChecklist,
  type UserOnboardingProgress,
  type InsertUserOnboardingProgress,
  type Product,
  type InsertProduct,
  type AbandonedCheckout,
  type InsertAbandonedCheckout,
  users,
  invites,
  customers,
  orders,
  orderItems,
  orderAssignments,
  orderStatusHistory,
  leaveRequests,
  teamMessages,
  webhookLogs,
  shopifyCredentials,
  attendance,
  attendanceBreaks,
  calls,
  notifications,
  shopifySyncLogs,
  shipments,
  ndrEvents,
  courses,
  lessons,
  userLessonProgress,
  lessonAnalytics,
  resources,
  onboardingChecklists,
  userOnboardingProgress,
  products,
  appSettings,
  abandonedCheckouts,
  type AppSetting,
  inboundWebhookLogs,
  type InboundWebhookLog,
  type InsertInboundWebhookLog,
  holidays,
  type Holiday,
  payrollLedger,
  type PayrollLedger,
  type InsertPayrollLedger,
} from "@shared/schema";

/**
 * Parses PostgreSQL text array format into JavaScript array.
 * PostgreSQL returns text[] as strings like: {tag1,"tag with spaces",tag3}
 * Handles: null, undefined, already-parsed arrays, raw strings, escaped quotes (""), empty elements.
 */
function parsePostgresArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  
  const str = value.trim();
  if (!str.startsWith('{') || !str.endsWith('}')) return [];
  
  const inner = str.slice(1, -1);
  if (inner === '') return [];
  
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < inner.length) {
    const char = inner[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (inner[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else if (char === '\\' && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 2;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        result.push(current);
        current = '';
        i++;
        continue;
      }
    }
    
    current += char;
    i++;
  }
  
  result.push(current);
  return result;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByAgentExtension(agentExtension: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: UpdateUser): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  listUsers(filters?: { role?: string; isActive?: boolean }): Promise<User[]>;

  // Invites
  createInvite(invite: InsertInvite & { token: string; expiresAt: Date; invitedBy?: string }): Promise<Invite>;
  getInvite(id: string): Promise<Invite | undefined>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInviteByEmail(email: string): Promise<Invite | undefined>;
  updateInviteStatus(id: string, status: 'accepted' | 'expired'): Promise<void>;
  updateInvitePermissions(id: string, adminType: string, permissions: any): Promise<Invite | undefined>;
  listPendingInvites(): Promise<Invite[]>;

  // Customers
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByShopifyId(shopifyId: string): Promise<Customer | undefined>;
  getCustomersByShopifyIds(shopifyIds: string[]): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  createCustomersBatch(customers: InsertCustomer[]): Promise<Customer[]>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByShopifyId(shopifyId: string): Promise<Order | undefined>;
  getOrderByShopifyOrderNumber(orderNumber: string): Promise<Order | undefined>;
  getExistingShopifyOrderIds(shopifyIds: string[]): Promise<Set<string>>;
  getMaxShopifyOrderId(): Promise<string | null>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrdersBatch(orders: InsertOrder[]): Promise<Order[]>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  listOrders(filters?: {
    status?: string;
    callStatus?: string;
    paymentMethod?: string;
    assignedTo?: string;
    agentId?: string; // 'unassigned' for NULL, or agent UUID
    search?: string; // Server-side search across orderId, customerName, phone
    sortOrder?: 'asc' | 'desc'; // Sort by date: 'asc' = Oldest First, 'desc' = Newest First (default)
    tag?: string; // Filter by tag (exact match in tags array)
    limit?: number;
    offset?: number;
  }): Promise<{ 
    orders: Order[]; 
    total: number;
    stats: {
      total: number;
      pending: number;
      confirmed: number;
      followUp: number;
      cancelled: number;
    };
  }>;
  exportOrders(filters?: {
    status?: string;
    callStatus?: string;
    paymentMethod?: string;
    assignedTo?: string;
    agentId?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    tag?: string;
  }): Promise<Array<{
    shopifyOrderNumber: string | null;
    shopifyCreatedAt: Date | null;
    status: string | null;
    paymentMethod: string | null;
    totalPrice: number | null;
    customerName: string | null;
    customerPhone: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingPincode: string | null;
    agentName: string | null;
    assignedAt: Date | null;
    confirmedAt: Date | null;
    callStatus: string | null;
    followUpAttempts: number | null;
    tags: string[] | null;
    lineItems: string | null;
  }>>;
  assignOrder(orderId: string, userId: string): Promise<Order | undefined>;
  
  // Call Status Actions
  confirmOrder(orderId: string, userId: string, notes?: string): Promise<Order | undefined>;
  cancelOrder(orderId: string, userId: string, reason: string, notes?: string): Promise<Order | undefined>;
  scheduleFollowup(orderId: string, userId: string, followupAt: Date, notes?: string): Promise<Order | undefined>;

  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  updateOrderItemImage(itemId: string, imageUrl: string): Promise<OrderItem | undefined>;

  // Order Assignments
  getOrderAssignments(orderId: string): Promise<OrderAssignment[]>;
  createOrderAssignment(assignment: InsertOrderAssignment): Promise<OrderAssignment>;
  getCurrentAssignment(orderId: string): Promise<OrderAssignment | undefined>;

  // Order Status History
  getOrderHistory(orderId: string): Promise<OrderStatusHistory[]>;
  createOrderStatus(status: InsertOrderStatusHistory): Promise<OrderStatusHistory>;
  createOrderStatusBatch(statuses: InsertOrderStatusHistory[]): Promise<OrderStatusHistory[]>;

  // Leave Requests
  getLeaveRequest(id: string): Promise<LeaveRequest | undefined>;
  createLeaveRequest(request: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined>;
  listLeaveRequests(filters?: { userId?: string; status?: string }): Promise<LeaveRequest[]>;

  // Team Messages
  getConversation(user1Id: string, user2Id: string): Promise<TeamMessage[]>;
  createMessage(message: InsertTeamMessage): Promise<TeamMessage>;
  markMessageAsRead(messageId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;

  // Webhook Logs
  createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog>;
  markWebhookProcessed(id: string, error?: string): Promise<void>;

  // Shopify Credentials
  getShopifyCredentials(): Promise<ShopifyCredentials | undefined>;
  saveShopifyCredentials(credentials: InsertShopifyCredentials): Promise<ShopifyCredentials>;
  updateShopifyCredentials(id: string, data: Partial<InsertShopifyCredentials>): Promise<ShopifyCredentials | undefined>;
  deleteShopifyCredentials(id: string): Promise<void>;
  updateCredentialTestStatus(id: string, status: 'success' | 'failed', message?: string): Promise<void>;

  // Attendance
  autoCloseGhostSessions(userId: string, currentDateStr: string): Promise<void>;
  getAttendanceByDate(userId: string, dateStr: string): Promise<Attendance | undefined>;
  getTodayAttendance(userId: string): Promise<Attendance | undefined>;
  getTeamTodayAttendance(): Promise<Attendance[]>;
  clockIn(userId: string, time: Date): Promise<Attendance>;
  clockInWithDate(userId: string, time: Date, dateForRecord: Date): Promise<Attendance>;
  clockOutById(attendanceId: string, time: Date, totalHours: number): Promise<Attendance | undefined>;
  clockOut(userId: string, time: Date, totalHours: number): Promise<Attendance | undefined>;
  getAttendanceRecords(filters?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Attendance[]>;

  // Holidays (Payroll: per-state holiday calendar — see seed-holidays.ts)
  listHolidaysByState(state: string, year?: number): Promise<Holiday[]>;

  // Payroll Ledger (Monthly payroll runs)
  upsertPayrollLedger(entry: InsertPayrollLedger): Promise<PayrollLedger>;
  getPayrollLedgerByPeriod(userId: string, year: number, month: number): Promise<PayrollLedger | undefined>;
  getPayrollLedgerById(id: string): Promise<PayrollLedger | undefined>;
  listPayrollLedger(year: number, month: number): Promise<PayrollLedger[]>;
  updatePayrollLedgerDispatch(id: string, data: { status: string; pdfFilename?: string; sentAt?: Date | null; emailError?: string | null }): Promise<void>;

  // Attendance Breaks
  startBreak(attendanceId: string): Promise<AttendanceBreak>;
  endBreak(breakId: string, endTime: Date): Promise<AttendanceBreak | undefined>;
  getActiveBreak(attendanceId: string): Promise<AttendanceBreak | undefined>;
  getBreaksByAttendanceId(attendanceId: string): Promise<AttendanceBreak[]>;
  closeOpenBreaksForAttendance(attendanceId: string, endTime: Date): Promise<void>;

  // Calls
  createCall(call: InsertCall): Promise<Call>;
  getCallById(id: string): Promise<Call | undefined>;
  getCallsByOrderId(orderId: string): Promise<Call[]>;
  getCallsWithAgentByOrderId(orderId: string): Promise<(Call & { agent: { fullName: string; email: string } | null })[]>;
  getCallsByAgentId(agentId: string): Promise<Call[]>;
  getCallByReference(callReference: string): Promise<Call | undefined>;
  getRecentCallByPhone(customerPhone: string, minutesAgo?: number): Promise<Call | undefined>;
  updateCallFromWebhook(id: string, data: Partial<InsertCall>): Promise<Call | undefined>;
  getAllCallsWithDetails(options?: { page?: number; limit?: number; agentId?: string }): Promise<{
    calls: (Call & { 
      agent: { fullName: string; email: string } | null;
      order: { shopifyOrderNumber: string; customerName: string } | null;
    })[];
    total: number;
    page: number;
    totalPages: number;
  }>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string, unreadOnly?: boolean): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  getDueFollowups(): Promise<Order[]>; // Get orders with followup_at <= now and not notified yet

  // Shipments
  createShipment(shipment: InsertShipment): Promise<Shipment>;
  getShipment(id: string): Promise<Shipment | undefined>;
  getShipmentByAWB(awb: string): Promise<Shipment | undefined>;
  getShipmentByOrderId(orderId: string): Promise<Shipment | undefined>;
  updateShipment(id: string, data: Partial<InsertShipment>): Promise<Shipment | undefined>;
  listShipments(filters?: { status?: string; limit?: number }): Promise<Shipment[]>;

  // NDR Events
  createNDREvent(ndrEvent: InsertNdrEvent): Promise<NdrEvent>;
  getNDREvent(id: string): Promise<NdrEvent | undefined>;
  getNDREventsByShipmentId(shipmentId: string): Promise<NdrEvent[]>;
  getNDREventsByOrderId(orderId: string): Promise<NdrEvent[]>;
  updateNDREvent(id: string, data: Partial<InsertNdrEvent>): Promise<NdrEvent | undefined>;
  listUnresolvedNDREvents(filters?: { limit?: number; offset?: number; assignedTo?: string }): Promise<{ events: NdrEvent[]; total: number }>;

  // Learning Center - Courses
  getCourse(id: string): Promise<Course | undefined>;
  getCourseBySlug(slug: string): Promise<Course | undefined>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course | undefined>;
  deleteCourse(id: string): Promise<void>;
  listCourses(filters?: { category?: string; isPublished?: boolean }): Promise<Course[]>;
  
  // Learning Center - Lessons
  getLesson(id: string): Promise<Lesson | undefined>;
  getLessonBySlug(slug: string): Promise<Lesson | undefined>;
  createLesson(lesson: InsertLesson): Promise<Lesson>;
  updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | undefined>;
  deleteLesson(id: string): Promise<void>;
  getLessonsByCourse(courseId: string, isPublished?: boolean): Promise<Lesson[]>;
  
  // Learning Center - User Progress
  getUserLessonProgress(userId: string, lessonId: string): Promise<UserLessonProgress | undefined>;
  createOrUpdateLessonProgress(progress: InsertUserLessonProgress): Promise<UserLessonProgress>;
  getUserCourseProgress(userId: string, courseId: string): Promise<{ completedLessons: number; totalLessons: number; percentage: number }>;
  getUserCompletedCourses(userId: string): Promise<string[]>; // Returns array of course IDs
  toggleBookmark(userId: string, lessonId: string): Promise<UserLessonProgress | undefined>;
  
  // Learning Center - Analytics
  getLessonAnalytics(lessonId: string): Promise<LessonAnalytics | undefined>;
  updateLessonAnalytics(lessonId: string, data: Partial<InsertLessonAnalytics>): Promise<LessonAnalytics>;
  incrementLessonView(lessonId: string, userId: string): Promise<void>;
  
  // Learning Center - Resources
  getResource(id: string): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: string, data: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: string): Promise<void>;
  listResources(filters?: { type?: string; category?: string }): Promise<Resource[]>;
  incrementResourceDownload(id: string): Promise<void>;
  
  // Learning Center - Onboarding
  getOnboardingChecklist(id: string): Promise<OnboardingChecklist | undefined>;
  getOnboardingChecklistByRole(role: string): Promise<OnboardingChecklist | undefined>;
  createOnboardingChecklist(checklist: InsertOnboardingChecklist): Promise<OnboardingChecklist>;
  updateOnboardingChecklist(id: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist | undefined>;
  
  getUserOnboardingProgress(userId: string): Promise<UserOnboardingProgress | undefined>;
  createUserOnboardingProgress(progress: InsertUserOnboardingProgress): Promise<UserOnboardingProgress>;
  updateUserOnboardingProgress(id: string, data: Partial<InsertUserOnboardingProgress>): Promise<UserOnboardingProgress | undefined>;
  
  // Products (Shopify Product Cache)
  upsertProduct(product: InsertProduct): Promise<Product>;
  upsertProducts(products: InsertProduct[]): Promise<Product[]>;
  getProductByVariantId(shopifyVariantId: string): Promise<Product | undefined>;
  getProductByProductId(shopifyProductId: string): Promise<Product | undefined>;
  listProducts(): Promise<Product[]>;
  getProductCount(): Promise<number>;
  getLastProductSync(): Promise<Date | null>;

  // Tags
  getDistinctTags(): Promise<string[]>;
  
  // Payment Methods
  getDistinctPaymentMethods(): Promise<string[]>;

  // Dashboard Metrics
  getDashboardMetrics(userId?: string, startDate?: Date, endDate?: Date): Promise<{
    assignedOrders: number;
    confirmedOrders: number;
    cancelledOrders: number;
    followUpOrders: number;
    fulfilledOrders: number;
    deliveredOrders: number;
    rtoOrders: number;
    aiConfirmedOrders: number;
  }>;

  // Hourly Activity for Dashboard Chart
  getHourlyActivity(userId?: string, startDate?: Date, endDate?: Date, timezone?: string): Promise<Array<{
    hour: string;
    confirmed: number;
    cancelled: number;
    followUp: number;
  }>>;

  // Abandoned Checkouts
  createAbandonedCheckout(data: InsertAbandonedCheckout): Promise<AbandonedCheckout>;
  getAbandonedCheckouts(): Promise<AbandonedCheckout[]>;

  // Inbound Webhook Logs
  createInboundWebhookLog(data: InsertInboundWebhookLog): Promise<InboundWebhookLog>;
  getInboundWebhookLogs(limit?: number): Promise<InboundWebhookLog[]>;
}

export class DbStorage implements IStorage {
  // ============================================================================
  // USERS
  // ============================================================================

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByAgentExtension(agentExtension: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.agentExtension, agentExtension));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const userWithAvatar = {
      ...insertUser,
      avatarImage: getRandomAvatar(),
    };
    const [user] = await db.insert(users).values(userWithAvatar).returning();
    return user;
  }

  async updateUser(
    id: string,
    data: UpdateUser,
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async listUsers(filters?: {
    role?: string;
    isActive?: boolean;
  }): Promise<User[]> {
    const conditions = [];
    if (filters?.role) conditions.push(eq(users.role, filters.role));
    if (filters?.isActive !== undefined)
      conditions.push(eq(users.isActive, filters.isActive));

    if (conditions.length > 0) {
      return await db.select().from(users).where(and(...conditions));
    }
    return await db.select().from(users);
  }

  // ============================================================================
  // INVITES
  // ============================================================================

  async createInvite(inviteData: InsertInvite & { token: string; expiresAt: Date; invitedBy?: string }): Promise<Invite> {
    const [invite] = await db.insert(invites).values(inviteData).returning();
    return invite;
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    return invite;
  }

  async getInviteByEmail(email: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.email, email));
    return invite;
  }

  async getInvite(id: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.id, id));
    return invite;
  }

  async updateInviteStatus(id: string, status: 'accepted' | 'expired'): Promise<void> {
    await db
      .update(invites)
      .set({ 
        status,
        acceptedAt: status === 'accepted' ? new Date() : undefined 
      })
      .where(eq(invites.id, id));
  }

  async resetInviteForResend(email: string, data: { token: string; expiresAt: Date; role: string; invitedBy: string; firstName?: string; lastName?: string }): Promise<Invite> {
    const [invite] = await db
      .update(invites)
      .set({
        token: data.token,
        expiresAt: data.expiresAt,
        status: 'pending',
        role: data.role,
        invitedBy: data.invitedBy,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        acceptedAt: null,
      })
      .where(eq(invites.email, email))
      .returning();
    return invite;
  }

  async reactivateUser(id: string, updates: { role?: string; adminType?: string | null; permissions?: any }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        isActive: true,
        role: updates.role,
        adminType: updates.adminType,
        permissions: updates.permissions,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateInvitePermissions(id: string, adminType: string, permissions: any): Promise<Invite | undefined> {
    const [invite] = await db
      .update(invites)
      .set({ 
        adminType,
        permissions 
      })
      .where(eq(invites.id, id))
      .returning();
    return invite;
  }

  async listPendingInvites(): Promise<Invite[]> {
    return await db.select().from(invites).where(eq(invites.status, 'pending'));
  }

  // ============================================================================
  // CUSTOMERS
  // ============================================================================

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return customer;
  }

  async getCustomerByShopifyId(
    shopifyId: string,
  ): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.shopifyCustomerId, shopifyId));
    return customer;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async getCustomersByShopifyIds(shopifyIds: string[]): Promise<Customer[]> {
    if (shopifyIds.length === 0) return [];
    return await db
      .select()
      .from(customers)
      .where(inArray(customers.shopifyCustomerId, shopifyIds));
  }

  async createCustomersBatch(
    insertCustomers: InsertCustomer[],
  ): Promise<Customer[]> {
    if (insertCustomers.length === 0) return [];
    return await db.insert(customers).values(insertCustomers).returning();
  }

  async updateCustomer(
    id: string,
    data: Partial<InsertCustomer>,
  ): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  // ============================================================================
  // ORDERS
  // ============================================================================

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderByShopifyId(shopifyId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, shopifyId));
    return order;
  }

  async getOrderByShopifyOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderNumber, orderNumber))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    return order;
  }

  async getOrderByTrackingNumber(trackingNumber: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.trackingNumber, trackingNumber));
    return order;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
  }

  async createOrdersBatch(insertOrders: InsertOrder[]): Promise<Order[]> {
    if (insertOrders.length === 0) return [];
    return await db.insert(orders).values(insertOrders).returning();
  }

  async getExistingShopifyOrderIds(
    shopifyIds: string[],
  ): Promise<Set<string>> {
    if (shopifyIds.length === 0) return new Set();
    const rows = await db
      .select({ shopifyOrderId: orders.shopifyOrderId })
      .from(orders)
      .where(inArray(orders.shopifyOrderId, shopifyIds));
    return new Set(
      rows
        .map((r) => r.shopifyOrderId)
        .filter((v): v is string => v !== null && v !== undefined),
    );
  }

  async getMaxShopifyOrderId(): Promise<string | null> {
    // Shopify order IDs are numeric but stored as text. Cast to BIGINT for
    // proper ordering (otherwise lexicographic comparison picks "999…" over
    // "1000…").
    const rows = await db.execute<{ max_id: string | null }>(
      sql`SELECT MAX(CAST(${orders.shopifyOrderId} AS BIGINT))::text AS max_id FROM ${orders}`,
    );
    const first = (rows as any).rows?.[0] ?? (rows as any)[0];
    return first?.max_id ?? null;
  }

  async updateOrder(
    id: string,
    data: Partial<InsertOrder>,
  ): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async listOrders(filters?: {
    status?: string;
    callStatus?: string;
    paymentMethod?: string;
    assignedTo?: string;
    agentId?: string; // 'unassigned' for NULL, or agent UUID
    search?: string; // Server-side search across orderId, customerName, phone, email, city
    sortOrder?: 'asc' | 'desc'; // Sort by date: 'asc' = Oldest First, 'desc' = Newest First (default)
    startDate?: Date; // Filter orders created on or after this date
    endDate?: Date; // Filter orders created on or before this date
    tag?: string; // Filter by tag (exact match in tags array using @> operator)
    limit?: number;
    offset?: number;
  }): Promise<{ 
    orders: Order[]; 
    total: number;
    stats: {
      total: number;
      pending: number;
      confirmed: number;
      followUp: number;
      cancelled: number;
    };
  }> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(orders.status, filters.status));
    if (filters?.callStatus) {
      // Handle 'Pending' specially - includes NULL/undefined callStatus
      if (filters.callStatus === 'Pending') {
        conditions.push(sql`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
      } else {
        conditions.push(eq(orders.callStatus, filters.callStatus));
      }
    }
    if (filters?.paymentMethod)
      conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
    if (filters?.assignedTo)
      conditions.push(eq(orders.assignedTo, filters.assignedTo));
    
    // Handle agentId filter: 'unassigned' for orders with no agent, or specific agent UUID
    if (filters?.agentId) {
      if (filters.agentId === 'unassigned') {
        conditions.push(sql`${orders.assignedTo} IS NULL`);
      } else {
        conditions.push(eq(orders.assignedTo, filters.agentId));
      }
    }
    
    // Server-side search: ILIKE matching across 5 fields (grouped in parentheses)
    // Fields: shopifyOrderNumber (visual order #), customerName, customerPhone, customerEmail, shippingCity
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      conditions.push(sql`(
        ${orders.shopifyOrderNumber} ILIKE ${searchPattern} OR
        ${orders.customerName} ILIKE ${searchPattern} OR
        ${orders.customerPhone} ILIKE ${searchPattern} OR
        ${orders.customerEmail} ILIKE ${searchPattern} OR
        ${orders.shippingCity} ILIKE ${searchPattern}
      )`);
    }
    
    // Server-side date filtering on shopifyCreatedAt
    if (filters?.startDate) {
      conditions.push(gte(orders.shopifyCreatedAt, filters.startDate));
    }
    if (filters?.endDate) {
      // Add 1 day to endDate to include the entire day
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.shopifyCreatedAt, endOfDay));
    }
    
    // Filter by tag (exact match using PostgreSQL @> array contains operator)
    if (filters?.tag && filters.tag.trim()) {
      conditions.push(sql`${orders.tags} @> ARRAY[${filters.tag.trim()}]::text[]`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for current filter
    let countQuery = db.select({ value: count() }).from(orders);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as any;
    }
    const [{ value: total }] = await countQuery;

    // Get global stats (respects assignedTo filter for role-based access, but ignores callStatus filter)
    // This ensures agents see their own stats, admins see all stats
    const statsConditions = [];
    if (filters?.assignedTo) statsConditions.push(eq(orders.assignedTo, filters.assignedTo));
    const statsWhereClause = statsConditions.length > 0 ? and(...statsConditions) : undefined;

    // Count all orders for this user/global scope
    let totalCountQuery = db.select({ value: count() }).from(orders);
    if (statsWhereClause) {
      totalCountQuery = totalCountQuery.where(statsWhereClause) as any;
    }
    const [{ value: statsTotal }] = await totalCountQuery;

    // Count pending orders (callStatus is NULL or 'Pending')
    let pendingQuery = db.select({ value: count() }).from(orders);
    const pendingConditions = [...statsConditions];
    pendingConditions.push(sql`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
    pendingQuery = pendingQuery.where(and(...pendingConditions)) as any;
    const [{ value: pendingCount }] = await pendingQuery;

    // Count confirmed orders
    let confirmedQuery = db.select({ value: count() }).from(orders);
    const confirmedConditions = [...statsConditions, eq(orders.callStatus, 'Confirmed')];
    confirmedQuery = confirmedQuery.where(and(...confirmedConditions)) as any;
    const [{ value: confirmedCount }] = await confirmedQuery;

    // Count follow-up orders
    let followUpQuery = db.select({ value: count() }).from(orders);
    const followUpConditions = [...statsConditions, eq(orders.callStatus, 'Follow Up')];
    followUpQuery = followUpQuery.where(and(...followUpConditions)) as any;
    const [{ value: followUpCount }] = await followUpQuery;

    // Count cancelled orders
    let cancelledQuery = db.select({ value: count() }).from(orders);
    const cancelledConditions = [...statsConditions, eq(orders.callStatus, 'Cancelled')];
    cancelledQuery = cancelledQuery.where(and(...cancelledConditions)) as any;
    const [{ value: cancelledCount }] = await cancelledQuery;

    // Get paginated orders with assigned user info - LEFT JOIN users table
    const ordersWithAgent = await db
      .select({
        order: orders,
        assignedToUser: {
          id: users.id,
          username: users.username,
          fullName: users.fullName,
        },
      })
      .from(orders)
      .leftJoin(users, eq(orders.assignedTo, users.id))
      .where(whereClause)
      .orderBy(filters?.sortOrder === 'asc' ? asc(orders.shopifyCreatedAt) : desc(orders.shopifyCreatedAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);

    // Transform results to include assignedToUser and ensure tags is always an array
    // Explicitly include shipmentStatus to ensure it's not dropped during serialization
    const ordersList = ordersWithAgent.map(row => ({
      ...row.order,
      shipmentStatus: row.order.shipmentStatus || null, // Explicitly include for frontend
      tags: parsePostgresArray(row.order.tags),
      assignedToUser: row.assignedToUser?.id ? row.assignedToUser : null,
    }));

    return { 
      orders: ordersList, 
      total,
      stats: {
        total: statsTotal,
        pending: pendingCount,
        confirmed: confirmedCount,
        followUp: followUpCount,
        cancelled: cancelledCount,
      }
    };
  }

  async exportOrders(filters?: {
    status?: string;
    callStatus?: string;
    paymentMethod?: string;
    assignedTo?: string;
    agentId?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    tag?: string;
  }): Promise<Array<{
    shopifyOrderNumber: string | null;
    shopifyCreatedAt: Date | null;
    status: string | null;
    paymentMethod: string | null;
    totalPrice: number | null;
    customerName: string | null;
    customerPhone: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingPincode: string | null;
    agentName: string | null;
    assignedAt: Date | null;
    confirmedAt: Date | null;
    callStatus: string | null;
    followUpAttempts: number | null;
    tags: string[] | null;
    lineItems: string | null;
  }>> {
    // Build filter conditions (same as listOrders)
    const conditions = [];
    if (filters?.status) conditions.push(eq(orders.status, filters.status));
    if (filters?.callStatus) {
      if (filters.callStatus === 'Pending') {
        conditions.push(sql`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
      } else {
        conditions.push(eq(orders.callStatus, filters.callStatus));
      }
    }
    if (filters?.paymentMethod) conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
    if (filters?.assignedTo) conditions.push(eq(orders.assignedTo, filters.assignedTo));
    
    if (filters?.agentId) {
      if (filters.agentId === 'unassigned') {
        conditions.push(sql`${orders.assignedTo} IS NULL`);
      } else {
        conditions.push(eq(orders.assignedTo, filters.agentId));
      }
    }
    
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      conditions.push(sql`(
        ${orders.shopifyOrderNumber} ILIKE ${searchPattern} OR
        ${orders.customerName} ILIKE ${searchPattern} OR
        ${orders.customerPhone} ILIKE ${searchPattern} OR
        ${orders.customerEmail} ILIKE ${searchPattern} OR
        ${orders.shippingCity} ILIKE ${searchPattern}
      )`);
    }
    
    if (filters?.startDate) {
      conditions.push(gte(orders.shopifyCreatedAt, filters.startDate));
    }
    if (filters?.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.shopifyCreatedAt, endOfDay));
    }
    
    if (filters?.tag && filters.tag.trim()) {
      conditions.push(sql`${orders.tags} @> ARRAY[${filters.tag.trim()}]::text[]`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch orders with agent names (LEFT JOIN to users table)
    let query = db.select({
      id: orders.id,
      shopifyOrderNumber: orders.shopifyOrderNumber,
      shopifyCreatedAt: orders.shopifyCreatedAt,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      totalPrice: orders.totalPrice,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      shippingCity: orders.shippingCity,
      shippingState: orders.shippingState,
      shippingPincode: orders.shippingPincode,
      assignedTo: orders.assignedTo,
      assignedAt: orders.assignedAt,
      confirmedAt: orders.confirmedAt,
      callStatus: orders.callStatus,
      followUpAttempts: orders.followUpAttempts,
      tags: orders.tags,
      agentName: users.fullName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.assignedTo, users.id))
    .orderBy(desc(orders.shopifyCreatedAt));

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const ordersData = await query;

    // Fetch all order items for these orders to build line items strings
    const orderIds = ordersData.map(o => o.id);
    
    let itemsMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const allItems = await db.select({
        orderId: orderItems.orderId,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(sql`${orderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

      // Group items by orderId and format as "Product x Qty, ..."
      const itemsByOrder: Record<string, string[]> = {};
      for (const item of allItems) {
        if (!itemsByOrder[item.orderId]) {
          itemsByOrder[item.orderId] = [];
        }
        itemsByOrder[item.orderId].push(`${item.productName || 'Unknown'} x${item.quantity || 1}`);
      }
      
      for (const orderId of Object.keys(itemsByOrder)) {
        itemsMap[orderId] = itemsByOrder[orderId].join(', ');
      }
    }

    // Transform and return export data
    return ordersData.map(order => ({
      shopifyOrderNumber: order.shopifyOrderNumber,
      shopifyCreatedAt: order.shopifyCreatedAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      totalPrice: order.totalPrice ? Number(order.totalPrice) : null,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPincode: order.shippingPincode,
      agentName: order.agentName,
      assignedAt: order.assignedAt,
      confirmedAt: order.confirmedAt,
      callStatus: order.callStatus,
      followUpAttempts: order.followUpAttempts,
      tags: parsePostgresArray(order.tags),
      lineItems: itemsMap[order.id] || null,
    }));
  }

  async assignOrder(orderId: string, userId: string): Promise<Order | undefined> {
    // Get current order to check status
    const currentOrder = await this.getOrder(orderId);
    if (!currentOrder) return undefined;

    // Only update status to 'assigned' if currently 'pending'
    // This prevents regression for confirmed/shipped orders
    const updateData: any = {
      assignedTo: userId,
      assignedAt: new Date(),
      updatedAt: new Date(),
    };
    
    if (currentOrder.status === 'pending') {
      updateData.status = 'assigned';
    }

    const [order] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  // Call Status Actions
  async confirmOrder(orderId: string, userId: string, notes?: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({
        callStatus: 'Confirmed',
        confirmedAt: new Date(),
        confirmedBy: userId,
        confirmedNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  async cancelOrder(orderId: string, userId: string, reason: string, notes?: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({
        callStatus: 'Cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelledReason: reason,
        cancelledNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  async scheduleFollowup(orderId: string, userId: string, followupAt: Date, notes?: string): Promise<Order | undefined> {
    // Get current order to increment follow up attempts
    const currentOrder = await this.getOrder(orderId);
    const currentAttempts = currentOrder?.followUpAttempts || 0;

    const [order] = await db
      .update(orders)
      .set({
        callStatus: 'Follow Up',
        followupAt,
        followupNotes: notes,
        followUpAttempts: currentAttempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  // ============================================================================
  // ORDER ITEMS
  // ============================================================================

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [orderItem] = await db.insert(orderItems).values(item).returning();
    return orderItem;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return [];
    return await db.insert(orderItems).values(items).returning();
  }

  async updateOrderItemImage(itemId: string, imageUrl: string): Promise<OrderItem | undefined> {
    const [item] = await db
      .update(orderItems)
      .set({ imageUrl })
      .where(eq(orderItems.id, itemId))
      .returning();
    return item;
  }

  // ============================================================================
  // ORDER ASSIGNMENTS
  // ============================================================================

  async getOrderAssignments(orderId: string): Promise<OrderAssignment[]> {
    return await db
      .select()
      .from(orderAssignments)
      .where(eq(orderAssignments.orderId, orderId))
      .orderBy(desc(orderAssignments.createdAt));
  }

  async createOrderAssignment(
    assignment: InsertOrderAssignment,
  ): Promise<OrderAssignment> {
    const [newAssignment] = await db
      .insert(orderAssignments)
      .values(assignment)
      .returning();
    return newAssignment;
  }

  async getCurrentAssignment(
    orderId: string,
  ): Promise<OrderAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(orderAssignments)
      .where(eq(orderAssignments.orderId, orderId))
      .orderBy(desc(orderAssignments.createdAt))
      .limit(1);
    return assignment;
  }

  // ============================================================================
  // ORDER STATUS HISTORY
  // ============================================================================

  async getOrderHistory(orderId: string): Promise<OrderStatusHistory[]> {
    return await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.createdAt));
  }

  async createOrderStatus(
    status: InsertOrderStatusHistory,
  ): Promise<OrderStatusHistory> {
    const [history] = await db
      .insert(orderStatusHistory)
      .values(status)
      .returning();
    return history;
  }

  async createOrderStatusBatch(
    statuses: InsertOrderStatusHistory[],
  ): Promise<OrderStatusHistory[]> {
    if (statuses.length === 0) return [];
    return await db.insert(orderStatusHistory).values(statuses).returning();
  }

  // ============================================================================
  // LEAVE REQUESTS
  // ============================================================================

  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    const [request] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id));
    return request;
  }

  async createLeaveRequest(
    insertRequest: InsertLeaveRequest,
  ): Promise<LeaveRequest> {
    const [request] = await db
      .insert(leaveRequests)
      .values(insertRequest)
      .returning();
    return request;
  }

  async updateLeaveRequest(
    id: string,
    data: Partial<InsertLeaveRequest>,
  ): Promise<LeaveRequest | undefined> {
    const [request] = await db
      .update(leaveRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(leaveRequests.id, id))
      .returning();
    return request;
  }

  async listLeaveRequests(filters?: {
    userId?: string;
    status?: string;
  }): Promise<LeaveRequest[]> {
    const conditions = [];
    if (filters?.userId)
      conditions.push(eq(leaveRequests.userId, filters.userId));
    if (filters?.status)
      conditions.push(eq(leaveRequests.status, filters.status));

    if (conditions.length > 0) {
      return await db
        .select()
        .from(leaveRequests)
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt));
    }
    return await db
      .select()
      .from(leaveRequests)
      .orderBy(desc(leaveRequests.createdAt));
  }

  // ============================================================================
  // TEAM MESSAGES
  // ============================================================================

  async getConversation(user1Id: string, user2Id: string): Promise<TeamMessage[]> {
    return await db
      .select()
      .from(teamMessages)
      .where(
        or(
          and(
            eq(teamMessages.fromUserId, user1Id),
            eq(teamMessages.toUserId, user2Id),
          ),
          and(
            eq(teamMessages.fromUserId, user2Id),
            eq(teamMessages.toUserId, user1Id),
          ),
        ),
      )
      .orderBy(asc(teamMessages.createdAt));
  }

  async createMessage(message: InsertTeamMessage): Promise<TeamMessage> {
    const [newMessage] = await db
      .insert(teamMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await db
      .update(teamMessages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(teamMessages.id, messageId));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(teamMessages)
      .where(
        and(
          eq(teamMessages.toUserId, userId),
          eq(teamMessages.isRead, false),
        ),
      );
    return value;
  }

  // ============================================================================
  // WEBHOOK LOGS
  // ============================================================================

  async createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog> {
    const [webhookLog] = await db.insert(webhookLogs).values(log).returning();
    return webhookLog;
  }

  async markWebhookProcessed(id: string, error?: string): Promise<void> {
    await db
      .update(webhookLogs)
      .set({
        processed: true,
        processedAt: new Date(),
        error: error || null,
      })
      .where(eq(webhookLogs.id, id));
  }

  // ============================================================================
  // SHOPIFY CREDENTIALS
  // ============================================================================

  async getShopifyCredentials(): Promise<ShopifyCredentials | undefined> {
    const [credentials] = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.createdAt))
      .limit(1);
    return credentials;
  }

  async saveShopifyCredentials(credentials: InsertShopifyCredentials): Promise<ShopifyCredentials> {
    // Deactivate any existing credentials
    await db
      .update(shopifyCredentials)
      .set({ isActive: false, updatedAt: new Date() });

    // Insert new credentials
    const [newCredentials] = await db
      .insert(shopifyCredentials)
      .values(credentials)
      .returning();
    return newCredentials;
  }

  async updateShopifyCredentials(
    id: string,
    data: Partial<InsertShopifyCredentials>,
  ): Promise<ShopifyCredentials | undefined> {
    const [updated] = await db
      .update(shopifyCredentials)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shopifyCredentials.id, id))
      .returning();
    return updated;
  }

  async deleteShopifyCredentials(id: string): Promise<void> {
    // Hard delete to allow fresh OAuth connection
    await db
      .delete(shopifyCredentials)
      .where(eq(shopifyCredentials.id, id));
  }

  async updateCredentialTestStatus(
    id: string,
    status: 'success' | 'failed',
    message?: string,
  ): Promise<void> {
    await db
      .update(shopifyCredentials)
      .set({
        testStatus: status,
        testMessage: message || null,
        lastTestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shopifyCredentials.id, id));
  }

  // ============================================================================
  // ATTENDANCE
  // ============================================================================

  // Auto-close any ghost sessions (unclosed sessions from previous days)
  // Uses SQL DATE comparison to avoid timezone issues
  async autoCloseGhostSessions(userId: string, currentDateStr: string): Promise<void> {
    // Find all unclosed sessions for this user where the DATE part is before currentDateStr
    // Using SQL DATE cast to compare just the date portion, avoiding timezone issues
    const ghostSessions = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, userId),
          isNull(attendance.clockOutTime),
          isNotNull(attendance.clockInTime),
          sql`DATE(${attendance.date}) < DATE(${currentDateStr})`
        )
      );

    // Close each ghost session at 23:59:59 of its original date
    for (const session of ghostSessions) {
      if (session.clockInTime && session.date) {
        // Get the session's date as a simple date string for end-of-day calculation
        const sessionDate = new Date(session.date);
        // Create 23:59:59 on the session's original date in a timezone-neutral way
        const year = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        const day = sessionDate.getDate();
        const endOfDay = new Date(year, month, day, 23, 59, 59, 0);
        
        // SAFETY: Close any open breaks at 23:59:59 to prevent NaN in payroll calculation
        await this.closeOpenBreaksForAttendance(session.id, endOfDay);
        
        // Get all breaks and calculate total break duration
        const breaks = await this.getBreaksByAttendanceId(session.id);
        let totalBreakMs = 0;
        for (const brk of breaks) {
          if (brk.breakStart && brk.breakEnd) {
            totalBreakMs += new Date(brk.breakEnd).getTime() - new Date(brk.breakStart).getTime();
          }
        }
        const totalBreakHours = totalBreakMs / (1000 * 60 * 60);
        
        // Calculate total hours: (ClockOut - ClockIn) - BreakDuration
        const clockInTime = new Date(session.clockInTime);
        const rawMs = endOfDay.getTime() - clockInTime.getTime();
        const totalHours = Math.max(0, (rawMs / (1000 * 60 * 60)) - totalBreakHours);
        
        // Update the record
        await db
          .update(attendance)
          .set({
            clockOutTime: endOfDay,
            totalHours: totalHours.toFixed(2),
            status: 'present', // Reset status from 'break' if applicable
            updatedAt: new Date(),
          })
          .where(eq(attendance.id, session.id));
      }
    }
  }

  // Get attendance for a specific date (client-driven, timezone-safe)
  // Uses SQL DATE comparison to match just the date portion
  async getAttendanceByDate(userId: string, dateStr: string): Promise<Attendance | undefined> {
    // Use SQL DATE cast to compare just the date portion, avoiding timezone issues
    const [record] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, userId),
          sql`DATE(${attendance.date}) = DATE(${dateStr})`
        )
      );
    return record;
  }

  // Legacy method - uses server time (kept for backward compatibility)
  async getTodayAttendance(userId: string): Promise<Attendance | undefined> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [record] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, userId),
          gte(attendance.date, today),
          lte(attendance.date, tomorrow)
        )
      );
    return record;
  }

  async getTeamTodayAttendance(): Promise<Attendance[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await db
      .select()
      .from(attendance)
      .where(
        and(
          gte(attendance.date, today),
          lte(attendance.date, tomorrow)
        )
      );
    return records;
  }

  async clockIn(userId: string, time: Date): Promise<Attendance> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if record exists for today
    const existing = await this.getTodayAttendance(userId);

    if (existing) {
      // Update existing record
      const [updated] = await db
        .update(attendance)
        .set({
          clockInTime: time,
          updatedAt: new Date(),
        })
        .where(eq(attendance.id, existing.id))
        .returning();
      return updated;
    }

    // Create new record
    const [record] = await db
      .insert(attendance)
      .values({
        userId,
        date: today,
        clockInTime: time,
      })
      .returning();
    return record;
  }

  // Clock in with explicit date (timezone-safe)
  async clockInWithDate(userId: string, time: Date, dateForRecord: Date): Promise<Attendance> {
    // Create new attendance record with the specified date
    const [record] = await db
      .insert(attendance)
      .values({
        userId,
        date: dateForRecord,
        clockInTime: time,
        status: 'present',
      })
      .returning();
    return record;
  }

  async clockOut(userId: string, time: Date, totalHours: number): Promise<Attendance | undefined> {
    const existing = await this.getTodayAttendance(userId);

    if (!existing) {
      return undefined;
    }

    const [updated] = await db
      .update(attendance)
      .set({
        clockOutTime: time,
        totalHours: totalHours.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, existing.id))
      .returning();
    return updated;
  }

  // Clock out by attendance ID (timezone-safe)
  async clockOutById(attendanceId: string, time: Date, totalHours: number): Promise<Attendance | undefined> {
    const [updated] = await db
      .update(attendance)
      .set({
        clockOutTime: time,
        totalHours: totalHours.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, attendanceId))
      .returning();
    return updated;
  }

  async getAttendanceRecords(filters?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Attendance[]> {
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(attendance.userId, filters.userId));
    }
    if (filters?.startDate) {
      conditions.push(gte(attendance.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(attendance.date, filters.endDate));
    }

    const query = db
      .select()
      .from(attendance)
      .orderBy(desc(attendance.date));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }

    return await query;
  }

  // ============================================================================
  // HOLIDAYS
  // ============================================================================

  async listHolidaysByState(state: string, year?: number): Promise<Holiday[]> {
    // Year filter is optional — when present we restrict to that
    // calendar year so the calendar view only loads what it needs.
    // Default behaviour returns the full table for the state.
    const conditions = [eq(holidays.state, state)];
    if (year !== undefined) {
      conditions.push(gte(holidays.date, `${year}-01-01`));
      conditions.push(lte(holidays.date, `${year}-12-31`));
    }
    return await db
      .select()
      .from(holidays)
      .where(and(...conditions))
      .orderBy(asc(holidays.date));
  }

  // ============================================================================
  // PAYROLL LEDGER
  // ============================================================================

  async upsertPayrollLedger(entry: InsertPayrollLedger): Promise<PayrollLedger> {
    // (userId, year, month) uniquely identifies a payroll run. Re-running
    // the same month overwrites the prior row (admin tweak after preview)
    // — the dispatch fields (pdf, sent_at) are reset on every Run by the
    // route handler so a re-run produces a fresh PDF.
    const existing = await this.getPayrollLedgerByPeriod(entry.userId, entry.year, entry.month);
    if (existing) {
      const [updated] = await db
        .update(payrollLedger)
        .set({ ...entry, updatedAt: new Date() })
        .where(eq(payrollLedger.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(payrollLedger).values(entry).returning();
    return created;
  }

  async getPayrollLedgerByPeriod(
    userId: string,
    year: number,
    month: number,
  ): Promise<PayrollLedger | undefined> {
    const [row] = await db
      .select()
      .from(payrollLedger)
      .where(
        and(
          eq(payrollLedger.userId, userId),
          eq(payrollLedger.year, year),
          eq(payrollLedger.month, month),
        ),
      )
      .limit(1);
    return row;
  }

  async getPayrollLedgerById(id: string): Promise<PayrollLedger | undefined> {
    const [row] = await db.select().from(payrollLedger).where(eq(payrollLedger.id, id)).limit(1);
    return row;
  }

  async listPayrollLedger(year: number, month: number): Promise<PayrollLedger[]> {
    return await db
      .select()
      .from(payrollLedger)
      .where(and(eq(payrollLedger.year, year), eq(payrollLedger.month, month)))
      .orderBy(desc(payrollLedger.createdAt));
  }

  async updatePayrollLedgerDispatch(
    id: string,
    data: { status: string; pdfFilename?: string; sentAt?: Date | null; emailError?: string | null },
  ): Promise<void> {
    await db
      .update(payrollLedger)
      .set({
        status: data.status,
        ...(data.pdfFilename !== undefined ? { pdfFilename: data.pdfFilename } : {}),
        ...(data.sentAt !== undefined ? { sentAt: data.sentAt } : {}),
        ...(data.emailError !== undefined ? { emailError: data.emailError } : {}),
        updatedAt: new Date(),
      })
      .where(eq(payrollLedger.id, id));
  }

  // ============================================================================
  // ATTENDANCE BREAKS
  // ============================================================================

  async startBreak(attendanceId: string): Promise<AttendanceBreak> {
    const [breakRecord] = await db
      .insert(attendanceBreaks)
      .values({
        attendanceId,
        breakStart: new Date(),
      })
      .returning();
    return breakRecord;
  }

  async endBreak(breakId: string, endTime: Date): Promise<AttendanceBreak | undefined> {
    const [updated] = await db
      .update(attendanceBreaks)
      .set({ breakEnd: endTime })
      .where(eq(attendanceBreaks.id, breakId))
      .returning();
    return updated;
  }

  async getActiveBreak(attendanceId: string): Promise<AttendanceBreak | undefined> {
    const [activeBreak] = await db
      .select()
      .from(attendanceBreaks)
      .where(
        and(
          eq(attendanceBreaks.attendanceId, attendanceId),
          isNull(attendanceBreaks.breakEnd)
        )
      )
      .limit(1);
    return activeBreak;
  }

  async getBreaksByAttendanceId(attendanceId: string): Promise<AttendanceBreak[]> {
    return await db
      .select()
      .from(attendanceBreaks)
      .where(eq(attendanceBreaks.attendanceId, attendanceId))
      .orderBy(asc(attendanceBreaks.breakStart));
  }

  async closeOpenBreaksForAttendance(attendanceId: string, endTime: Date): Promise<void> {
    await db
      .update(attendanceBreaks)
      .set({ breakEnd: endTime })
      .where(
        and(
          eq(attendanceBreaks.attendanceId, attendanceId),
          isNull(attendanceBreaks.breakEnd)
        )
      );
  }

  // ============================================================================
  // CALLS
  // ============================================================================

  async createCall(call: InsertCall): Promise<Call> {
    const [createdCall] = await db
      .insert(calls)
      .values(call)
      .returning();
    return createdCall;
  }

  async getCallById(id: string): Promise<Call | undefined> {
    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, id))
      .limit(1);
    return call;
  }

  async getCallsByOrderId(orderId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.orderId, orderId))
      .orderBy(desc(calls.calledAt));
  }

  async getCallsWithAgentByOrderId(orderId: string): Promise<(Call & { agent: { fullName: string; email: string } | null })[]> {
    const result = await db
      .select({
        call: calls,
        agent: {
          fullName: users.fullName,
          email: users.email,
        }
      })
      .from(calls)
      .leftJoin(users, eq(calls.agentId, users.id))
      .where(eq(calls.orderId, orderId))
      .orderBy(desc(calls.calledAt));

    return result.map(row => ({
      ...row.call,
      agent: row.agent || null
    }));
  }

  async getCallsByAgentId(agentId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.agentId, agentId))
      .orderBy(desc(calls.calledAt));
  }

  async getCallByReference(callReference: string): Promise<Call | undefined> {
    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.callReference, callReference))
      .limit(1);
    return call;
  }

  async getRecentCallByPhone(customerPhone: string, minutesAgo: number = 10): Promise<Call | undefined> {
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    
    const [call] = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.customerPhone, customerPhone),
          gte(calls.calledAt, cutoffTime)
        )
      )
      .orderBy(desc(calls.calledAt))
      .limit(1);
    
    return call;
  }

  async updateCallFromWebhook(id: string, data: Partial<InsertCall>): Promise<Call | undefined> {
    const [updated] = await db
      .update(calls)
      .set(data)
      .where(eq(calls.id, id))
      .returning();
    return updated;
  }

  async getAllCallsWithDetails(options?: { page?: number; limit?: number; agentId?: string }): Promise<{
    calls: (Call & { 
      agent: { fullName: string; email: string } | null;
      order: { shopifyOrderNumber: string; customerName: string } | null;
    })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 25;
    const offset = (page - 1) * limit;
    const agentId = options?.agentId;

    // Build where condition for agent filtering
    const whereCondition = agentId ? eq(calls.agentId, agentId) : undefined;

    // Get total count (filtered if agentId provided)
    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(calls);
    const [countResult] = agentId 
      ? await countQuery.where(whereCondition!)
      : await countQuery;
    const total = countResult.count;

    // Get paginated results (filtered if agentId provided)
    const baseQuery = db
      .select({
        call: calls,
        agent: {
          fullName: users.fullName,
          email: users.email,
        },
        order: {
          shopifyOrderNumber: orders.shopifyOrderNumber,
          customerName: orders.customerName,
        }
      })
      .from(calls)
      .leftJoin(users, eq(calls.agentId, users.id))
      .leftJoin(orders, eq(calls.orderId, orders.id));

    const result = agentId
      ? await baseQuery.where(whereCondition!).orderBy(desc(calls.calledAt)).limit(limit).offset(offset)
      : await baseQuery.orderBy(desc(calls.calledAt)).limit(limit).offset(offset);

    const callsData = result.map(row => ({
      ...row.call,
      agent: (row.agent && row.agent.fullName) ? row.agent : null,
      order: (row.order && row.order.shopifyOrderNumber) ? row.order : null
    }));

    return {
      calls: callsData,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return created;
  }

  async getUserNotifications(userId: string, unreadOnly: boolean = false): Promise<Notification[]> {
    const conditions = [eq(notifications.userId, userId)];
    
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    return await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async getDueFollowups(): Promise<Order[]> {
    // Get orders that have a follow-up scheduled and it's due now
    const now = new Date();
    return await db
      .select()
      .from(orders)
      .where(and(
        lte(orders.followupAt, now),
        eq(orders.callStatus, "Follow Up")
      ));
  }

  // ============================================================================
  // SHOPIFY SYNC LOGS
  // ============================================================================

  async createSyncLog(log: InsertShopifySyncLog): Promise<ShopifySyncLog> {
    const [syncLog] = await db.insert(shopifySyncLogs).values(log).returning();
    return syncLog;
  }

  async updateSyncLog(id: string, updates: Partial<InsertShopifySyncLog>): Promise<ShopifySyncLog | undefined> {
    const [updated] = await db
      .update(shopifySyncLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shopifySyncLogs.id, id))
      .returning();
    return updated;
  }

  async getSyncLog(id: string): Promise<ShopifySyncLog | undefined> {
    const [log] = await db
      .select()
      .from(shopifySyncLogs)
      .where(eq(shopifySyncLogs.id, id));
    return log;
  }

  async getSyncLogsByOrder(orderId: string): Promise<ShopifySyncLog[]> {
    return await db
      .select()
      .from(shopifySyncLogs)
      .where(eq(shopifySyncLogs.orderId, orderId))
      .orderBy(desc(shopifySyncLogs.createdAt));
  }

  async getFailedSyncs(): Promise<ShopifySyncLog[]> {
    return await db
      .select()
      .from(shopifySyncLogs)
      .where(eq(shopifySyncLogs.syncStatus, "failed"))
      .orderBy(desc(shopifySyncLogs.createdAt));
  }

  async updateOrderSyncStatus(orderId: string, syncStatus: string, lastSyncedAt?: Date): Promise<Order | undefined> {
    const updateData: any = { syncStatus };
    if (lastSyncedAt) {
      updateData.lastSyncedAt = lastSyncedAt;
    }
    
    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  // ============================================================================
  // SHIPMENTS
  // ============================================================================

  async createShipment(insertShipment: InsertShipment): Promise<Shipment> {
    const [shipment] = await db.insert(shipments).values(insertShipment).returning();
    return shipment;
  }

  async getShipment(id: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
    return shipment;
  }

  async getShipmentByAWB(awb: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.awb, awb));
    return shipment;
  }

  async getShipmentByOrderId(orderId: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, orderId));
    return shipment;
  }

  async getShipmentByShiprocketShipmentId(shiprocketShipmentId: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.shiprocketShipmentId, shiprocketShipmentId));
    return shipment;
  }

  async updateShipment(id: string, data: Partial<InsertShipment>): Promise<Shipment | undefined> {
    const [updated] = await db
      .update(shipments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shipments.id, id))
      .returning();
    return updated;
  }

  async listShipments(filters?: { status?: string; limit?: number }): Promise<Shipment[]> {
    let query = db.select().from(shipments).orderBy(desc(shipments.createdAt));

    if (filters?.status) {
      query = query.where(eq(shipments.status, filters.status)) as any;
    }

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  }

  // ============================================================================
  // NDR EVENTS
  // ============================================================================

  async createNDREvent(insertNdrEvent: InsertNdrEvent): Promise<NdrEvent> {
    const [ndrEvent] = await db.insert(ndrEvents).values(insertNdrEvent).returning();
    return ndrEvent;
  }

  async getNDREvent(id: string): Promise<NdrEvent | undefined> {
    const [ndrEvent] = await db.select().from(ndrEvents).where(eq(ndrEvents.id, id));
    return ndrEvent;
  }

  async getNDREventsByShipmentId(shipmentId: string): Promise<NdrEvent[]> {
    return await db
      .select()
      .from(ndrEvents)
      .where(eq(ndrEvents.shipmentId, shipmentId))
      .orderBy(desc(ndrEvents.createdAt));
  }

  async getNDREventsByOrderId(orderId: string): Promise<NdrEvent[]> {
    return await db
      .select()
      .from(ndrEvents)
      .where(eq(ndrEvents.orderId, orderId))
      .orderBy(desc(ndrEvents.createdAt));
  }

  async updateNDREvent(id: string, data: Partial<InsertNdrEvent>): Promise<NdrEvent | undefined> {
    const [updated] = await db
      .update(ndrEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ndrEvents.id, id))
      .returning();
    return updated;
  }

  async listUnresolvedNDREvents(filters?: { limit?: number; offset?: number; assignedTo?: string }): Promise<{ events: NdrEvent[]; total: number }> {
    // Build conditions array
    const conditions = [eq(ndrEvents.resolved, false)];
    
    // If assignedTo is specified (agent filter), join with orders to filter by assignment
    if (filters?.assignedTo) {
      // Get NDR events joined with orders to filter by agent assignment
      let query = db.select({ ndrEvent: ndrEvents })
        .from(ndrEvents)
        .innerJoin(orders, eq(ndrEvents.orderId, orders.id))
        .where(
          and(
            eq(ndrEvents.resolved, false),
            eq(orders.assignedTo, filters.assignedTo)
          )
        )
        .orderBy(desc(ndrEvents.createdAt));
      
      if (filters?.limit) {
        query = query.limit(filters.limit) as any;
      }
      if (filters?.offset) {
        query = query.offset(filters.offset) as any;
      }
      
      const results = await query;
      const events = results.map(r => r.ndrEvent);
      
      // Count for pagination
      const countResult = await db
        .select({ count: count() })
        .from(ndrEvents)
        .innerJoin(orders, eq(ndrEvents.orderId, orders.id))
        .where(
          and(
            eq(ndrEvents.resolved, false),
            eq(orders.assignedTo, filters.assignedTo)
          )
        );
      
      return {
        events,
        total: countResult[0]?.count || 0,
      };
    }
    
    // Admin path: no assignedTo filter, return all unresolved NDR events
    const baseQuery = db.select().from(ndrEvents).where(eq(ndrEvents.resolved, false));

    let query = baseQuery.orderBy(desc(ndrEvents.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const events = await query;

    const countResult = await db
      .select({ count: count() })
      .from(ndrEvents)
      .where(eq(ndrEvents.resolved, false));

    return {
      events,
      total: countResult[0]?.count || 0,
    };
  }

  // ============================================================================
  // LEARNING CENTER - COURSES
  // ============================================================================

  async getCourse(id: string): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }

  async getCourseBySlug(slug: string): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.slug, slug));
    return course;
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const [newCourse] = await db.insert(courses).values(course).returning();
    return newCourse;
  }

  async updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course | undefined> {
    const [updated] = await db
      .update(courses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(courses.id, id))
      .returning();
    return updated;
  }

  async deleteCourse(id: string): Promise<void> {
    await db.delete(courses).where(eq(courses.id, id));
  }

  async listCourses(filters?: { category?: string; isPublished?: boolean }): Promise<Course[]> {
    let query = db.select().from(courses).orderBy(asc(courses.order), asc(courses.createdAt));

    const conditions = [];
    if (filters?.category) {
      conditions.push(eq(courses.category, filters.category));
    }
    if (filters?.isPublished !== undefined) {
      conditions.push(eq(courses.isPublished, filters.isPublished));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query;
  }

  // ============================================================================
  // LEARNING CENTER - LESSONS
  // ============================================================================

  async getLesson(id: string): Promise<Lesson | undefined> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
    return lesson;
  }

  async getLessonBySlug(slug: string): Promise<Lesson | undefined> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.slug, slug));
    return lesson;
  }

  async createLesson(lesson: InsertLesson): Promise<Lesson> {
    // Handle duplicate slug by appending suffix
    let finalSlug = lesson.slug;
    let suffix = 1;
    
    while (true) {
      const existing = await this.getLessonBySlug(finalSlug);
      if (!existing) break;
      suffix++;
      finalSlug = `${lesson.slug}-${suffix}`;
    }
    
    const [newLesson] = await db.insert(lessons).values({ ...lesson, slug: finalSlug }).returning();
    
    // Initialize analytics for new lesson
    await db.insert(lessonAnalytics).values({
      lessonId: newLesson.id,
      totalViews: 0,
      uniqueViews: 0,
      totalCompletions: 0,
    }).onConflictDoNothing();
    
    return newLesson;
  }

  async updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const [updated] = await db
      .update(lessons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(lessons.id, id))
      .returning();
    return updated;
  }

  async deleteLesson(id: string): Promise<void> {
    await db.delete(lessons).where(eq(lessons.id, id));
  }

  async getLessonsByCourse(courseId: string, isPublished?: boolean): Promise<Lesson[]> {
    const conditions = [eq(lessons.courseId, courseId)];
    
    if (isPublished !== undefined) {
      conditions.push(eq(lessons.isPublished, isPublished));
    }
    
    return await db
      .select()
      .from(lessons)
      .where(and(...conditions))
      .orderBy(asc(lessons.order));
  }

  // ============================================================================
  // LEARNING CENTER - USER PROGRESS
  // ============================================================================

  async getUserLessonProgress(userId: string, lessonId: string): Promise<UserLessonProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userLessonProgress)
      .where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.lessonId, lessonId)));
    return progress;
  }

  async createOrUpdateLessonProgress(progress: InsertUserLessonProgress): Promise<UserLessonProgress> {
    const existing = await this.getUserLessonProgress(progress.userId, progress.lessonId);
    
    if (existing) {
      const [updated] = await db
        .update(userLessonProgress)
        .set({ ...progress, updatedAt: new Date() })
        .where(eq(userLessonProgress.id, existing.id))
        .returning();
      return updated;
    } else {
      const [newProgress] = await db.insert(userLessonProgress).values(progress).returning();
      return newProgress;
    }
  }

  async getUserCourseProgress(userId: string, courseId: string): Promise<{ completedLessons: number; totalLessons: number; percentage: number }> {
    // Get all published lessons in the course
    const courseLessons = await this.getLessonsByCourse(courseId, true);
    const totalLessons = courseLessons.length;
    
    if (totalLessons === 0) {
      return { completedLessons: 0, totalLessons: 0, percentage: 0 };
    }

    // Get user's progress on these lessons
    const lessonIds = courseLessons.map(l => l.id);
    const progressRecords = await db
      .select()
      .from(userLessonProgress)
      .where(
        and(
          eq(userLessonProgress.userId, userId),
          eq(userLessonProgress.isCompleted, true)
        )
      );

    const completedLessons = progressRecords.filter(p => lessonIds.includes(p.lessonId)).length;
    const percentage = Math.round((completedLessons / totalLessons) * 100);

    return { completedLessons, totalLessons, percentage };
  }

  async getUserCompletedCourses(userId: string): Promise<string[]> {
    // Get all user's completed lessons
    const completedLessons = await db
      .select()
      .from(userLessonProgress)
      .where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.isCompleted, true)));

    // Get all courses
    const allCourses = await this.listCourses({ isPublished: true });
    
    const completedCourseIds: string[] = [];

    // Check each course to see if all lessons are completed
    for (const course of allCourses) {
      const courseLessons = await this.getLessonsByCourse(course.id);
      const courseLessonIds = courseLessons.map(l => l.id);
      
      const allCompleted = courseLessonIds.every(lessonId =>
        completedLessons.some(cl => cl.lessonId === lessonId)
      );

      if (allCompleted && courseLessonIds.length > 0) {
        completedCourseIds.push(course.id);
      }
    }

    return completedCourseIds;
  }

  async toggleBookmark(userId: string, lessonId: string): Promise<UserLessonProgress | undefined> {
    const existing = await this.getUserLessonProgress(userId, lessonId);
    
    if (existing) {
      const [updated] = await db
        .update(userLessonProgress)
        .set({ isBookmarked: !existing.isBookmarked, updatedAt: new Date() })
        .where(eq(userLessonProgress.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new progress record with bookmark
      const [newProgress] = await db
        .insert(userLessonProgress)
        .values({ userId, lessonId, isBookmarked: true, completionPercentage: 0 })
        .returning();
      return newProgress;
    }
  }

  // ============================================================================
  // LEARNING CENTER - ANALYTICS
  // ============================================================================

  async getLessonAnalytics(lessonId: string): Promise<LessonAnalytics | undefined> {
    const [analytics] = await db
      .select()
      .from(lessonAnalytics)
      .where(eq(lessonAnalytics.lessonId, lessonId));
    return analytics;
  }

  async updateLessonAnalytics(lessonId: string, data: Partial<InsertLessonAnalytics>): Promise<LessonAnalytics> {
    const existing = await this.getLessonAnalytics(lessonId);
    
    if (existing) {
      const [updated] = await db
        .update(lessonAnalytics)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(lessonAnalytics.lessonId, lessonId))
        .returning();
      return updated;
    } else {
      const [newAnalytics] = await db
        .insert(lessonAnalytics)
        .values({ lessonId, ...data })
        .returning();
      return newAnalytics;
    }
  }

  async incrementLessonView(lessonId: string, userId: string): Promise<void> {
    const analytics = await this.getLessonAnalytics(lessonId);
    
    if (analytics) {
      // Check if this is a unique view (first time this user viewed this lesson)
      const existingProgress = await this.getUserLessonProgress(userId, lessonId);
      const isUniqueView = !existingProgress;

      await db
        .update(lessonAnalytics)
        .set({
          totalViews: analytics.totalViews + 1,
          uniqueViews: isUniqueView ? analytics.uniqueViews + 1 : analytics.uniqueViews,
          updatedAt: new Date(),
        })
        .where(eq(lessonAnalytics.lessonId, lessonId));
    } else {
      // Create analytics record
      await db.insert(lessonAnalytics).values({
        lessonId,
        totalViews: 1,
        uniqueViews: 1,
      });
    }

    // Update user's last accessed time
    await this.createOrUpdateLessonProgress({
      userId,
      lessonId,
      lastAccessedAt: new Date(),
      completionPercentage: 0,
    });
  }

  // ============================================================================
  // LEARNING CENTER - RESOURCES
  // ============================================================================

  async getResource(id: string): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [newResource] = await db.insert(resources).values(resource).returning();
    return newResource;
  }

  async updateResource(id: string, data: Partial<InsertResource>): Promise<Resource | undefined> {
    const [updated] = await db
      .update(resources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resources.id, id))
      .returning();
    return updated;
  }

  async deleteResource(id: string): Promise<void> {
    await db.delete(resources).where(eq(resources.id, id));
  }

  async listResources(filters?: { type?: string; category?: string }): Promise<Resource[]> {
    const conditions = [eq(resources.isPublished, true)];
    if (filters?.type) {
      conditions.push(eq(resources.type, filters.type));
    }
    if (filters?.category) {
      conditions.push(eq(resources.category, filters.category));
    }

    return await db
      .select()
      .from(resources)
      .where(and(...conditions))
      .orderBy(desc(resources.createdAt));
  }

  async incrementResourceDownload(id: string): Promise<void> {
    const resource = await this.getResource(id);
    if (resource) {
      await db
        .update(resources)
        .set({ downloadCount: resource.downloadCount + 1 })
        .where(eq(resources.id, id));
    }
  }

  // ============================================================================
  // LEARNING CENTER - ONBOARDING
  // ============================================================================

  async getOnboardingChecklist(id: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db
      .select()
      .from(onboardingChecklists)
      .where(eq(onboardingChecklists.id, id));
    return checklist;
  }

  async getOnboardingChecklistByRole(role: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db
      .select()
      .from(onboardingChecklists)
      .where(and(eq(onboardingChecklists.role, role), eq(onboardingChecklists.isActive, true)))
      .orderBy(asc(onboardingChecklists.order))
      .limit(1);
    return checklist;
  }

  async createOnboardingChecklist(checklist: InsertOnboardingChecklist): Promise<OnboardingChecklist> {
    const [newChecklist] = await db.insert(onboardingChecklists).values(checklist).returning();
    return newChecklist;
  }

  async updateOnboardingChecklist(id: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist | undefined> {
    const [updated] = await db
      .update(onboardingChecklists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboardingChecklists.id, id))
      .returning();
    return updated;
  }

  async getUserOnboardingProgress(userId: string): Promise<UserOnboardingProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userOnboardingProgress)
      .where(eq(userOnboardingProgress.userId, userId));
    return progress;
  }

  async createUserOnboardingProgress(progress: InsertUserOnboardingProgress): Promise<UserOnboardingProgress> {
    const [newProgress] = await db.insert(userOnboardingProgress).values(progress).returning();
    return newProgress;
  }

  async updateUserOnboardingProgress(id: string, data: Partial<InsertUserOnboardingProgress>): Promise<UserOnboardingProgress | undefined> {
    const [updated] = await db
      .update(userOnboardingProgress)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userOnboardingProgress.id, id))
      .returning();
    return updated;
  }

  // ============================================================================
  // PRODUCTS (Shopify Product Cache)
  // ============================================================================

  async upsertProduct(product: InsertProduct): Promise<Product> {
    const [result] = await db
      .insert(products)
      .values(product)
      .onConflictDoUpdate({
        target: products.shopifyVariantId,
        set: {
          shopifyProductId: product.shopifyProductId,
          title: product.title,
          variantTitle: product.variantTitle,
          sku: product.sku,
          imageUrl: product.imageUrl,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async upsertProducts(productList: InsertProduct[]): Promise<Product[]> {
    if (productList.length === 0) return [];
    
    const results: Product[] = [];
    for (const product of productList) {
      const result = await this.upsertProduct(product);
      results.push(result);
    }
    return results;
  }

  async getProductByVariantId(shopifyVariantId: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.shopifyVariantId, shopifyVariantId));
    return product;
  }

  async getProductByProductId(shopifyProductId: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.shopifyProductId, shopifyProductId));
    return product;
  }

  async listProducts(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .orderBy(asc(products.title));
  }

  async getProductCount(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(products);
    return result?.count || 0;
  }

  async getLastProductSync(): Promise<Date | null> {
    const [product] = await db
      .select({ lastSyncedAt: products.lastSyncedAt })
      .from(products)
      .orderBy(desc(products.lastSyncedAt))
      .limit(1);
    return product?.lastSyncedAt || null;
  }

  // ============================================================================
  // DASHBOARD METRICS
  // ============================================================================

  async getDashboardMetrics(userId?: string, startDate?: Date, endDate?: Date): Promise<{
    assignedOrders: number;
    confirmedOrders: number;
    cancelledOrders: number;
    followUpOrders: number;
    fulfilledOrders: number;
    deliveredOrders: number;
    rtoOrders: number;
    aiConfirmedOrders: number;
  }> {
    // Helper function to build attribution condition for history-based queries
    // Uses fallback: (changed_by = userId) OR (changed_by IS NULL AND order assigned to userId)
    const buildAttributionCondition = (userIdParam: string) => or(
      eq(orderStatusHistory.changedBy, userIdParam),
      and(
        sql`${orderStatusHistory.changedBy} IS NULL`,
        eq(orderAssignments.userId, userIdParam)
      )
    )!;

    // =========================================================================
    // PERFORMANCE METRICS (Date-Filtered - What agent achieved in date range)
    // =========================================================================

    // Query 1: Assigned Orders in date range
    // UNION of: (1) Orders assigned in date range + (2) Orders confirmed in date range
    // This captures both "New Leads" AND "Backlog Hustle" for the Confirmation Rate denominator
    
    // Part A: Get order IDs assigned to agent within date range
    const assignmentConditions = [];
    if (userId) {
      assignmentConditions.push(eq(orderAssignments.userId, userId));
    }
    if (startDate) {
      assignmentConditions.push(gte(orderAssignments.createdAt, startDate));
    }
    if (endDate) {
      assignmentConditions.push(lte(orderAssignments.createdAt, endDate));
    }
    
    const assignedOrderIds = await db
      .selectDistinct({ orderId: orderAssignments.orderId })
      .from(orderAssignments)
      .where(assignmentConditions.length > 0 ? and(...assignmentConditions) : undefined);
    
    // Part B: Get order IDs confirmed by agent within date range (even if assigned earlier)
    const confirmedInRangeConditions = [sql`LOWER(${orderStatusHistory.status}) = 'confirmed'`];
    if (startDate) confirmedInRangeConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) confirmedInRangeConditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) confirmedInRangeConditions.push(buildAttributionCondition(userId));
    
    const confirmedOrderIds = await db
      .selectDistinct({ orderId: orderStatusHistory.orderId })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(and(...confirmedInRangeConditions));
    
    // Combine both sets (UNION in JS) and count unique order IDs
    const allAssignedIds = new Set([
      ...assignedOrderIds.map(r => r.orderId),
      ...confirmedOrderIds.map(r => r.orderId)
    ]);
    const assignedCount = allAssignedIds.size;

    // Query 2: Confirmed Orders (LOWER(status) = 'confirmed' in history within date range)
    const confirmedConditions = [sql`LOWER(${orderStatusHistory.status}) = 'confirmed'`];
    if (startDate) confirmedConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) confirmedConditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) confirmedConditions.push(buildAttributionCondition(userId));

    const [confirmedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orderStatusHistory.orderId})` })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(and(...confirmedConditions));

    // Query 3: Cancelled Orders (LOWER(status) = 'cancelled' in history within date range)
    const cancelledConditions = [sql`LOWER(${orderStatusHistory.status}) = 'cancelled'`];
    if (startDate) cancelledConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) cancelledConditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) cancelledConditions.push(buildAttributionCondition(userId));

    const [cancelledResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orderStatusHistory.orderId})` })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(and(...cancelledConditions));

    // Query 4: Fulfilled/Shipped Orders (HISTORY ONLY - fulfilled_at column is empty)
    // Uses LOWER(status) IN ('shipped', 'fulfilled') from order_status_history
    const shippedConditions = [sql`LOWER(${orderStatusHistory.status}) IN ('shipped', 'fulfilled')`];
    if (startDate) shippedConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) shippedConditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) shippedConditions.push(buildAttributionCondition(userId));

    const [shippedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orderStatusHistory.orderId})` })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(and(...shippedConditions));

    // Query 5: Delivered Orders (history-only, orders table doesn't have delivered_at)
    const deliveredConditions = [sql`LOWER(${orderStatusHistory.status}) = 'delivered'`];
    if (startDate) deliveredConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) deliveredConditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) deliveredConditions.push(buildAttributionCondition(userId));

    const [deliveredResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orderStatusHistory.orderId})` })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(and(...deliveredConditions));

    // =========================================================================
    // PIPELINE METRICS (Live State - NO date filter, shows current to-do list)
    // =========================================================================

    // Query 6: RTO Orders (backward compatible - checks both legacy and new normalized status)
    // Legacy: shipment_status = 'RTO' (case-insensitive)
    // New: status IN ('rto_initiated', 'rto_delivered')
    const rtoStatusCondition = sql`(LOWER(${orders.shipmentStatus}) = 'rto' OR ${orders.status} IN ('rto_initiated', 'rto_delivered'))`;
    const rtoConditions = [rtoStatusCondition];
    if (userId) rtoConditions.push(eq(orderAssignments.userId, userId));
    if (startDate) rtoConditions.push(gte(orders.updatedAt, startDate));
    if (endDate) rtoConditions.push(lte(orders.updatedAt, endDate));

    const [rtoResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orders.id})` })
      .from(orders)
      .leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId))
      .where(and(...rtoConditions));

    // Query 7: Follow-up Queue (current call_status = 'Follow Up', live state)
    const followUpConditions = [eq(orders.callStatus, 'Follow Up')];
    if (userId) followUpConditions.push(eq(orderAssignments.userId, userId));

    const [followUpResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orders.id})` })
      .from(orders)
      .leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId))
      .where(and(...followUpConditions));

    // Query 8: AI Confirmed Orders (auto-confirmed by Scalysis AI, identified via note in history)
    const aiConfirmedConditions = [
      sql`${orderStatusHistory.note} = 'Auto-confirmed by Scalysis AI'`,
      sql`${orderStatusHistory.changedBy} IS NULL`,
    ];
    if (startDate) aiConfirmedConditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) aiConfirmedConditions.push(lte(orderStatusHistory.createdAt, endDate));

    const [aiConfirmedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orderStatusHistory.orderId})` })
      .from(orderStatusHistory)
      .where(and(...aiConfirmedConditions));

    return {
      assignedOrders: assignedCount,
      confirmedOrders: Number(confirmedResult?.count) || 0,
      cancelledOrders: Number(cancelledResult?.count) || 0,
      followUpOrders: Number(followUpResult?.count) || 0,
      fulfilledOrders: Number(shippedResult?.count) || 0,
      deliveredOrders: Number(deliveredResult?.count) || 0,
      rtoOrders: Number(rtoResult?.count) || 0,
      aiConfirmedOrders: Number(aiConfirmedResult?.count) || 0,
    };
  }

  // ============================================================================
  // HOURLY ACTIVITY CHART
  // ============================================================================

  async getHourlyActivity(userId?: string, startDate?: Date, endDate?: Date, timezone?: string): Promise<Array<{
    hour: string;
    confirmed: number;
    cancelled: number;
    followUp: number;
  }>> {
    // Fallback to UTC if timezone is not provided
    const safeTimezone = timezone || 'UTC';
    
    // Build attribution condition for user filtering
    const buildAttributionCondition = (userIdParam: string) => or(
      eq(orderStatusHistory.changedBy, userIdParam),
      and(
        sql`${orderStatusHistory.changedBy} IS NULL`,
        eq(orderAssignments.userId, userIdParam)
      )
    )!;

    // Get individual records with timestamps for JavaScript timezone conversion
    // This avoids complex SQL timezone math that breaks with parameterized queries
    const conditions = [];
    if (startDate) conditions.push(gte(orderStatusHistory.createdAt, startDate));
    if (endDate) conditions.push(lte(orderStatusHistory.createdAt, endDate));
    if (userId) conditions.push(buildAttributionCondition(userId));
    
    // Only count confirmed, cancelled, and follow_up status changes
    conditions.push(sql`LOWER(${orderStatusHistory.status}) IN ('confirmed', 'cancelled', 'follow up', 'follow_up')`);

    // Fetch raw records with timestamps
    const results = await db
      .select({
        orderId: orderStatusHistory.orderId,
        status: sql<string>`LOWER(${orderStatusHistory.status})`,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Initialize all 24 hours (full day coverage)
    const hourlyData: Map<number, { confirmed: Set<string>; cancelled: Set<string>; followUp: Set<string> }> = new Map();
    for (let h = 0; h < 24; h++) {
      hourlyData.set(h, { confirmed: new Set(), cancelled: new Set(), followUp: new Set() });
    }

    // Convert each timestamp to user's local hour using JavaScript
    // Then count DISTINCT orders per hour per status
    for (const row of results) {
      if (!row.createdAt) continue;
      
      // Convert UTC timestamp to user's local hour
      const localHour = parseInt(
        new Date(row.createdAt).toLocaleString('en-US', { 
          timeZone: safeTimezone, 
          hour: 'numeric', 
          hour12: false 
        }),
        10
      );
      
      const hourData = hourlyData.get(localHour);
      if (hourData && row.orderId) {
        const status = row.status.toLowerCase().replace(' ', '_');
        if (status === 'confirmed') {
          hourData.confirmed.add(row.orderId);
        } else if (status === 'cancelled') {
          hourData.cancelled.add(row.orderId);
        } else if (status === 'follow_up' || status === 'follow up') {
          hourData.followUp.add(row.orderId);
        }
      }
    }

    // Helper to format hour as 12-hour AM/PM
    const formatHour = (h: number): string => {
      if (h === 0) return '12 AM';
      if (h === 12) return '12 PM';
      if (h < 12) return `${h} AM`;
      return `${h - 12} PM`;
    };

    // Convert to array format for all 24 hours (counting distinct orders via Set.size)
    const formattedData = [];
    for (let h = 0; h < 24; h++) {
      const data = hourlyData.get(h) || { confirmed: new Set(), cancelled: new Set(), followUp: new Set() };
      formattedData.push({
        hour: formatHour(h),
        confirmed: data.confirmed.size,
        cancelled: data.cancelled.size,
        followUp: data.followUp.size,
      });
    }

    return formattedData;
  }

  // ============================================================================
  // APP SETTINGS METHODS
  // ============================================================================

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    const [setting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return setting;
  }

  async setAppSetting(key: string, value: unknown): Promise<AppSetting> {
    const [setting] = await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  async getPrepaidPaymentMethods(): Promise<string[]> {
    const setting = await this.getAppSetting('prepaid_payment_methods');
    if (!setting || !Array.isArray(setting.value)) {
      return [];
    }
    return setting.value as string[];
  }

  async getDistinctPaymentMethods(): Promise<string[]> {
    const results = await db
      .selectDistinct({ paymentMethod: orders.paymentMethod })
      .from(orders)
      .where(isNotNull(orders.paymentMethod));
    return results
      .map(r => r.paymentMethod)
      .filter((m): m is string => m !== null && m !== '');
  }

  async getDistinctTags(): Promise<string[]> {
    const result = await db.execute(
      sql`SELECT DISTINCT UNNEST(tags) AS tag FROM orders WHERE tags IS NOT NULL ORDER BY tag`
    );
    return (result.rows as { tag: string }[])
      .map(r => r.tag)
      .filter((t): t is string => t !== null && t !== '');
  }

  async seedDefaultSettings(): Promise<void> {
    const existing = await this.getAppSetting('prepaid_payment_methods');
    if (!existing) {
      console.log('Seeding default prepaid_payment_methods setting...');
      await this.setAppSetting('prepaid_payment_methods', ['PayU', 'Cards, UPI, NB by PayU India']);
      console.log('Default prepaid_payment_methods seeded successfully');
    }
  }

  async createAbandonedCheckout(data: InsertAbandonedCheckout): Promise<AbandonedCheckout> {
    const [checkout] = await db.insert(abandonedCheckouts).values(data).returning();
    return checkout;
  }

  async getAbandonedCheckouts(): Promise<(AbandonedCheckout & { assignedAgentName: string | null })[]> {
    const results = await db
      .select({
        id: abandonedCheckouts.id,
        externalId: abandonedCheckouts.externalId,
        customerName: abandonedCheckouts.customerName,
        customerPhone: abandonedCheckouts.customerPhone,
        customerEmail: abandonedCheckouts.customerEmail,
        items: abandonedCheckouts.items,
        cartValue: abandonedCheckouts.cartValue,
        checkoutUrl: abandonedCheckouts.checkoutUrl,
        checkoutStage: abandonedCheckouts.checkoutStage,
        address: abandonedCheckouts.address,
        assignedTo: abandonedCheckouts.assignedTo,
        isRecovered: abandonedCheckouts.isRecovered,
        createdAt: abandonedCheckouts.createdAt,
        assignedAgentName: users.fullName,
      })
      .from(abandonedCheckouts)
      .leftJoin(users, eq(abandonedCheckouts.assignedTo, users.id))
      .orderBy(desc(abandonedCheckouts.createdAt));
    return results;
  }

  async createInboundWebhookLog(data: InsertInboundWebhookLog): Promise<InboundWebhookLog> {
    const [log] = await db.insert(inboundWebhookLogs).values(data).returning();
    return log;
  }

  async getInboundWebhookLogs(limit: number = 50): Promise<InboundWebhookLog[]> {
    return await db
      .select()
      .from(inboundWebhookLogs)
      .orderBy(desc(inboundWebhookLogs.createdAt))
      .limit(limit);
  }
}

export const storage = new DbStorage();
