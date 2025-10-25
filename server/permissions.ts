import type { User, AdminPermissions } from "@shared/schema";

/**
 * Permission utility functions for role-based access control
 * Supports 2-role system: Admin (Full Control / Partial Control) and Agent
 */

/**
 * Check if a user has full control admin privileges
 */
export function isFullControlAdmin(user: User): boolean {
  return user.role === "admin" && user.adminType === "full_control";
}

/**
 * Check if a user is any type of admin (full or partial control)
 */
export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

/**
 * Check if a user is an agent
 */
export function isAgent(user: User): boolean {
  return user.role === "agent";
}

/**
 * Get user's permissions object (safely handles null/undefined)
 */
export function getUserPermissions(user: User): AdminPermissions {
  if (!user.permissions) {
    return {};
  }
  return user.permissions as AdminPermissions;
}

/**
 * Check if user has a specific permission
 * Full control admins always have all permissions
 * Partial control admins check their permission object
 * Agents have no admin permissions
 * 
 * @param user - The user to check
 * @param category - Permission category (e.g., 'teamManagement', 'orderManagement')
 * @param permission - Specific permission within category (e.g., 'viewDirectory', 'assignOrders')
 * @returns true if user has the permission, false otherwise
 */
export function hasPermission(
  user: User,
  category: keyof AdminPermissions,
  permission: string
): boolean {
  // Agents have no admin permissions
  if (isAgent(user)) {
    return false;
  }

  // Full control admins have all permissions
  if (isFullControlAdmin(user)) {
    return true;
  }

  // Partial control admins check their specific permissions
  const permissions = getUserPermissions(user);
  const categoryPerms = permissions[category];
  
  if (!categoryPerms || typeof categoryPerms !== 'object') {
    return false;
  }

  return categoryPerms[permission as keyof typeof categoryPerms] === true;
}

/**
 * Check if user can view all orders (not just their own)
 */
export function canViewAllOrders(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'orderManagement', 'viewAllOrders')
  );
}

/**
 * Check if user can assign orders to agents
 */
export function canAssignOrders(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'orderManagement', 'assignOrders')
  );
}

/**
 * Check if user can bulk assign orders
 */
export function canBulkAssignOrders(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'orderManagement', 'bulkAssign')
  );
}

/**
 * Check if user can trigger auto-assignment
 */
export function canTriggerAutoAssignment(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'orderManagement', 'triggerAutoAssignment')
  );
}

/**
 * Check if user can view team directory
 */
export function canViewTeamDirectory(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'teamManagement', 'viewDirectory')
  );
}

/**
 * Check if user can edit agent profiles
 */
export function canEditProfiles(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'teamManagement', 'editProfiles')
  );
}

/**
 * Check if user can assign agent extensions
 */
export function canAssignExtensions(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'teamManagement', 'assignExtensions')
  );
}

/**
 * Check if user can manage leave requests
 */
export function canManageLeaveRequests(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'teamManagement', 'manageLeaveRequests')
  );
}

/**
 * Check if user can view analytics
 */
export function canViewAnalytics(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'analytics', 'viewTeamPerformance') ||
    hasPermission(user, 'analytics', 'viewOrderAnalytics')
  );
}

/**
 * Check if user can export reports
 */
export function canExportReports(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'analytics', 'exportReports')
  );
}

/**
 * Check if user can manage Shopify settings
 */
export function canManageShopify(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'settings', 'manageShopify')
  );
}

/**
 * Check if user can manage IVR settings
 */
export function canManageIVR(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'settings', 'manageIVR')
  );
}

/**
 * Check if user can configure webhooks
 */
export function canConfigureWebhooks(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    hasPermission(user, 'settings', 'configureWebhooks')
  );
}

/**
 * Check if user can access settings page
 */
export function canAccessSettings(user: User): boolean {
  return isAdmin(user) && (
    isFullControlAdmin(user) || 
    canManageShopify(user) ||
    canManageIVR(user) ||
    canConfigureWebhooks(user)
  );
}

/**
 * Check if user can invite team members
 * Only full control admins can invite other admins
 * Partial control admins can only invite agents
 */
export function canInviteTeamMembers(user: User): boolean {
  return isAdmin(user);
}

/**
 * Check if user can invite admins (requires full control)
 */
export function canInviteAdmins(user: User): boolean {
  return isFullControlAdmin(user);
}

/**
 * Check if user can edit another admin's permissions
 * Only full control admins can edit permissions
 */
export function canEditAdminPermissions(user: User): boolean {
  return isFullControlAdmin(user);
}

/**
 * Get readable permission level string for display
 */
export function getPermissionLevelDisplay(user: User): string {
  if (user.role === "agent") {
    return "Agent";
  }
  
  if (user.adminType === "full_control") {
    return "Admin (Full Control)";
  }
  
  if (user.adminType === "partial_control") {
    return "Admin (Partial Control)";
  }
  
  // Fallback for admins without adminType set (legacy data)
  return "Admin";
}
