-- Migration: Convert Manager role to Admin with Partial Control
-- This script migrates all users with role='manager' to role='admin' 
-- with adminType='partial_control' and default manager permissions
--
-- Run this migration once to complete the transition to the 2-role system
-- Date: 2025-10-25

-- Default manager permissions (matches DEFAULT_MANAGER_PERMISSIONS in shared/schema.ts)
-- These are the typical permissions for a former manager:
-- - Team Management: invite members, view team, edit assignments
-- - Order Management: view, assign, update status, call customers
-- - Analytics: view only (no export)
-- - System Settings: none

BEGIN;

-- Update all manager users to admin with partial control
UPDATE users 
SET 
  role = 'admin',
  admin_type = 'partial_control',
  permissions = '{
    "teamManagement": {
      "inviteTeamMembers": true,
      "viewTeamDirectory": true,
      "editUserProfiles": false,
      "manageRolesPermissions": false,
      "viewActivityLogs": false,
      "editTeamAssignments": true
    },
    "orderManagement": {
      "viewAllOrders": true,
      "assignOrders": true,
      "updateOrderStatus": true,
      "callCustomers": true,
      "editOrderDetails": false,
      "deleteOrders": false
    },
    "analytics": {
      "viewDashboard": true,
      "exportReports": false,
      "viewDetailedAnalytics": false,
      "configureDashboard": false
    },
    "systemSettings": {
      "manageShopifyIntegration": false,
      "manageIVRSettings": false,
      "configureWebhooks": false,
      "accessSystemLogs": false
    }
  }'::jsonb
WHERE role = 'manager';

-- Log the number of users migrated
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM users WHERE role = 'admin' AND admin_type = 'partial_control';
  RAISE NOTICE 'Migration complete. % users converted from Manager to Partial Control Admin', migrated_count;
END $$;

COMMIT;
