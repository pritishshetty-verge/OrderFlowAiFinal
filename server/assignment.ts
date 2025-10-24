import type { IStorage } from "./storage";
import type { User, Order } from "@shared/schema";

/**
 * Round-robin assignment algorithm for distributing COD orders
 * to agents with "present" status
 */
export class OrderAssignmentEngine {
  constructor(private storage: IStorage) {}

  /**
   * Find the best agent to assign an order to using round-robin logic
   * 
   * Algorithm:
   * 1. Get all eligible agents (role: agent/manager, presenceStatus: present, isActive: true)
   * 2. Count current assigned orders for each agent (status: assigned, confirmed, pending)
   * 3. Select agent with fewest assigned orders
   * 4. Break ties by last assignment time (least recently assigned)
   * 
   * @returns User ID of selected agent, or null if no eligible agents
   */
  async findBestAgent(): Promise<string | null> {
    // Get all eligible agents
    const allUsers = await this.storage.listUsers();
    const eligibleAgents = allUsers.filter(
      (user) =>
        (user.role === "agent" || user.role === "manager") &&
        user.presenceStatus === "present" &&
        user.isActive === true
    );

    if (eligibleAgents.length === 0) {
      console.log("⚠️  No eligible agents available for assignment");
      return null;
    }

    // Count assigned orders for each agent
    const agentWorkloads = await Promise.all(
      eligibleAgents.map(async (agent) => {
        const assignedOrders = await this.storage.listOrders({
          assignedTo: agent.id,
          // Count orders that are still active (not completed/cancelled/delivered)
          status: undefined, // We'll filter in memory
        });

        // Count only active orders (assigned, confirmed, pending, shipped, ndr)
        const activeOrders = assignedOrders.orders.filter(
          (order) =>
            order.status === "assigned" ||
            order.status === "confirmed" ||
            order.status === "pending" ||
            order.status === "shipped" ||
            order.status === "ndr"
        );

        // Find most recent assignment time
        const lastAssignmentTime = assignedOrders.orders.length > 0
          ? Math.max(...assignedOrders.orders.map((o) => new Date(o.assignedAt || 0).getTime()))
          : 0;

        return {
          agentId: agent.id,
          agentName: agent.fullName,
          workload: activeOrders.length,
          lastAssignmentTime,
        };
      })
    );

    // Sort by workload (ascending), then by last assignment time (ascending)
    // This gives us round-robin: agent with least orders gets next one
    // If tied, agent who hasn't been assigned recently gets priority
    agentWorkloads.sort((a, b) => {
      if (a.workload !== b.workload) {
        return a.workload - b.workload; // Fewer orders first
      }
      return a.lastAssignmentTime - b.lastAssignmentTime; // Least recently assigned first
    });

    const selectedAgent = agentWorkloads[0];
    console.log(`📋 Assignment decision:`, {
      selected: selectedAgent.agentName,
      workload: selectedAgent.workload,
      allAgentWorkloads: agentWorkloads.map((a) => ({
        name: a.agentName,
        workload: a.workload,
      })),
    });

    return selectedAgent.agentId;
  }

  /**
   * Automatically assign a COD order to an agent
   * 
   * @param orderId - Order ID to assign
   * @returns true if assigned successfully, false if no eligible agents
   */
  async autoAssignOrder(orderId: string): Promise<boolean> {
    // Get order details
    const order = await this.storage.getOrder(orderId);
    if (!order) {
      console.error(`❌ Order ${orderId} not found`);
      return false;
    }

    // Only auto-assign COD orders
    if (order.paymentMethod !== "cod") {
      console.log(`⏭️  Skipping auto-assignment for prepaid order ${orderId}`);
      return false;
    }

    // Skip if already assigned
    if (order.assignedTo) {
      console.log(`⏭️  Order ${orderId} already assigned to ${order.assignedTo}`);
      return false;
    }

    // Find best agent
    const agentId = await this.findBestAgent();
    if (!agentId) {
      console.warn(`⚠️  No eligible agents for order ${orderId}, leaving unassigned`);
      return false;
    }

    // Assign the order
    await this.storage.updateOrder(orderId, {
      assignedTo: agentId,
      assignedAt: new Date(),
      status: "assigned",
    });

    // Log the assignment
    await this.storage.createOrderAssignment({
      orderId,
      userId: agentId,
      assignedBy: null, // System auto-assignment
      note: "Auto-assigned via round-robin algorithm",
    });

    console.log(`✅ Order ${order.shopifyOrderNumber} assigned to agent ${agentId}`);
    return true;
  }

  /**
   * Manually assign an order to a specific agent (admin override)
   * 
   * @param orderId - Order ID to assign
   * @param agentId - Agent user ID
   * @param assignedBy - Admin user ID who made the assignment
   * @param note - Optional note about the assignment
   */
  async manualAssignOrder(
    orderId: string,
    agentId: string,
    assignedBy: string,
    note?: string
  ): Promise<void> {
    // Verify agent exists and is eligible
    const agent = await this.storage.getUser(agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    if (agent.role !== "agent" && agent.role !== "manager") {
      throw new Error("User is not an agent or manager");
    }

    // Update order
    await this.storage.updateOrder(orderId, {
      assignedTo: agentId,
      assignedAt: new Date(),
      status: "assigned",
    });

    // Log the assignment
    await this.storage.createOrderAssignment({
      orderId,
      userId: agentId,
      assignedBy,
      note: note || "Manually assigned by admin",
    });

    console.log(`✅ Order ${orderId} manually assigned to ${agent.fullName} by ${assignedBy}`);
  }

  /**
   * Get workload statistics for all agents
   */
  async getAgentWorkloads(): Promise<
    Array<{
      agentId: string;
      agentName: string;
      role: string;
      presenceStatus: string;
      assignedOrders: number;
      activeOrders: number;
    }>
  > {
    const allUsers = await this.storage.listUsers();
    const agents = allUsers.filter(
      (user) => (user.role === "agent" || user.role === "manager") && user.isActive
    );

    const workloads = await Promise.all(
      agents.map(async (agent) => {
        const assignedOrders = await this.storage.listOrders({
          assignedTo: agent.id,
        });

        const activeOrders = assignedOrders.orders.filter(
          (order) =>
            order.status === "assigned" ||
            order.status === "confirmed" ||
            order.status === "pending" ||
            order.status === "shipped" ||
            order.status === "ndr"
        );

        return {
          agentId: agent.id,
          agentName: agent.fullName,
          role: agent.role,
          presenceStatus: agent.presenceStatus || "present",
          assignedOrders: assignedOrders.total,
          activeOrders: activeOrders.length,
        };
      })
    );

    return workloads;
  }
}
