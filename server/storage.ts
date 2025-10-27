import {  eq, and, desc, asc, or, count, gte, lte } from "drizzle-orm";
import { db } from "./db";
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
  calls,
  notifications,
  shopifySyncLogs,
  shipments,
  ndrEvents,
} from "@shared/schema";

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
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByShopifyId(shopifyId: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  listOrders(filters?: {
    status?: string;
    callStatus?: string;
    paymentMethod?: string;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }>;
  assignOrder(orderId: string, userId: string): Promise<Order | undefined>;
  
  // Call Status Actions
  confirmOrder(orderId: string, userId: string, notes?: string): Promise<Order | undefined>;
  cancelOrder(orderId: string, userId: string, reason: string, notes?: string): Promise<Order | undefined>;
  scheduleFollowup(orderId: string, userId: string, followupAt: Date, notes?: string): Promise<Order | undefined>;

  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;

  // Order Assignments
  getOrderAssignments(orderId: string): Promise<OrderAssignment[]>;
  createOrderAssignment(assignment: InsertOrderAssignment): Promise<OrderAssignment>;
  getCurrentAssignment(orderId: string): Promise<OrderAssignment | undefined>;

  // Order Status History
  getOrderHistory(orderId: string): Promise<OrderStatusHistory[]>;
  createOrderStatus(status: InsertOrderStatusHistory): Promise<OrderStatusHistory>;

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
  getTodayAttendance(userId: string): Promise<Attendance | undefined>;
  clockIn(userId: string, time: Date): Promise<Attendance>;
  clockOut(userId: string, time: Date, totalHours: number): Promise<Attendance | undefined>;
  getAttendanceRecords(filters?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Attendance[]>;

  // Calls
  createCall(call: InsertCall): Promise<Call>;
  getCallsByOrderId(orderId: string): Promise<Call[]>;
  getCallsByAgentId(agentId: string): Promise<Call[]>;

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
  listUnresolvedNDREvents(filters?: { limit?: number; offset?: number }): Promise<{ events: NdrEvent[]; total: number }>;
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
    const [user] = await db.insert(users).values(insertUser).returning();
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

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
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
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(orders.status, filters.status));
    if (filters?.callStatus) conditions.push(eq(orders.callStatus, filters.callStatus));
    if (filters?.paymentMethod)
      conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
    if (filters?.assignedTo)
      conditions.push(eq(orders.assignedTo, filters.assignedTo));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    let countQuery = db.select({ value: count() }).from(orders);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as any;
    }
    const [{ value: total }] = await countQuery;

    // Get paginated orders
    let query = db.select().from(orders).orderBy(desc(orders.createdAt));

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const ordersList = await query;

    return { orders: ordersList, total };
  }

  async assignOrder(orderId: string, userId: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({
        assignedTo: userId,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
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
    await db
      .update(shopifyCredentials)
      .set({ isActive: false, updatedAt: new Date() })
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
  // CALLS
  // ============================================================================

  async createCall(call: InsertCall): Promise<Call> {
    const [createdCall] = await db
      .insert(calls)
      .values(call)
      .returning();
    return createdCall;
  }

  async getCallsByOrderId(orderId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.orderId, orderId))
      .orderBy(desc(calls.calledAt));
  }

  async getCallsByAgentId(agentId: string): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.agentId, agentId))
      .orderBy(desc(calls.calledAt));
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

  async listUnresolvedNDREvents(filters?: { limit?: number; offset?: number }): Promise<{ events: NdrEvent[]; total: number }> {
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
}

export const storage = new DbStorage();
