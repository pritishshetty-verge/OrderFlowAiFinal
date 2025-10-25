import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { AdminPermissions } from "@shared/schema";

interface PermissionChecklistProps {
  value: AdminPermissions;
  onChange: (permissions: AdminPermissions) => void;
}

export function PermissionChecklist({ value, onChange }: PermissionChecklistProps) {
  const [openSections, setOpenSections] = useState({
    teamManagement: true,
    orderManagement: true,
    analytics: true,
    settings: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handlePermissionChange = (
    category: keyof AdminPermissions,
    permission: string,
    checked: boolean
  ) => {
    const newPermissions = { ...value };
    if (!newPermissions[category]) {
      newPermissions[category] = {};
    }
    (newPermissions[category] as any)[permission] = checked;
    onChange(newPermissions);
  };

  return (
    <div className="space-y-4" data-testid="permission-checklist">
      {/* Team Management Section */}
      <Collapsible
        open={openSections.teamManagement}
        onOpenChange={() => toggleSection("teamManagement")}
      >
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover-elevate active-elevate-2 p-3 rounded-md" data-testid="section-team-management">
          {openSections.teamManagement ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-medium">Team Management</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 pt-3 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="viewDirectory"
              checked={value.teamManagement?.viewDirectory ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("teamManagement", "viewDirectory", checked as boolean)
              }
              data-testid="permission-team-view-directory"
            />
            <Label htmlFor="viewDirectory" className="text-sm font-normal cursor-pointer">
              View team directory
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="editProfiles"
              checked={value.teamManagement?.editProfiles ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("teamManagement", "editProfiles", checked as boolean)
              }
              data-testid="permission-team-edit-profiles"
            />
            <Label htmlFor="editProfiles" className="text-sm font-normal cursor-pointer">
              Edit agent profiles
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="assignExtensions"
              checked={value.teamManagement?.assignExtensions ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("teamManagement", "assignExtensions", checked as boolean)
              }
              data-testid="permission-team-assign-extensions"
            />
            <Label htmlFor="assignExtensions" className="text-sm font-normal cursor-pointer">
              Assign agent extensions
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="manageLeaveRequests"
              checked={value.teamManagement?.manageLeaveRequests ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("teamManagement", "manageLeaveRequests", checked as boolean)
              }
              data-testid="permission-team-manage-leave"
            />
            <Label htmlFor="manageLeaveRequests" className="text-sm font-normal cursor-pointer">
              Manage leave requests
            </Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Order Management Section */}
      <Collapsible
        open={openSections.orderManagement}
        onOpenChange={() => toggleSection("orderManagement")}
      >
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover-elevate active-elevate-2 p-3 rounded-md" data-testid="section-order-management">
          {openSections.orderManagement ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-medium">Order Management</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 pt-3 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="viewAllOrders"
              checked={value.orderManagement?.viewAllOrders ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("orderManagement", "viewAllOrders", checked as boolean)
              }
              data-testid="permission-orders-view-all"
            />
            <Label htmlFor="viewAllOrders" className="text-sm font-normal cursor-pointer">
              View all orders
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="assignOrders"
              checked={value.orderManagement?.assignOrders ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("orderManagement", "assignOrders", checked as boolean)
              }
              data-testid="permission-orders-assign"
            />
            <Label htmlFor="assignOrders" className="text-sm font-normal cursor-pointer">
              Assign orders to agents
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="bulkAssign"
              checked={value.orderManagement?.bulkAssign ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("orderManagement", "bulkAssign", checked as boolean)
              }
              data-testid="permission-orders-bulk-assign"
            />
            <Label htmlFor="bulkAssign" className="text-sm font-normal cursor-pointer">
              Bulk assign orders
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="triggerAutoAssignment"
              checked={value.orderManagement?.triggerAutoAssignment ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("orderManagement", "triggerAutoAssignment", checked as boolean)
              }
              data-testid="permission-orders-auto-assign"
            />
            <Label htmlFor="triggerAutoAssignment" className="text-sm font-normal cursor-pointer">
              Trigger auto-assignment
            </Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Analytics & Reports Section */}
      <Collapsible
        open={openSections.analytics}
        onOpenChange={() => toggleSection("analytics")}
      >
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover-elevate active-elevate-2 p-3 rounded-md" data-testid="section-analytics">
          {openSections.analytics ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-medium">Analytics & Reports</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 pt-3 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="viewTeamPerformance"
              checked={value.analytics?.viewTeamPerformance ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("analytics", "viewTeamPerformance", checked as boolean)
              }
              data-testid="permission-analytics-team-performance"
            />
            <Label htmlFor="viewTeamPerformance" className="text-sm font-normal cursor-pointer">
              View team performance
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="viewOrderAnalytics"
              checked={value.analytics?.viewOrderAnalytics ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("analytics", "viewOrderAnalytics", checked as boolean)
              }
              data-testid="permission-analytics-order-analytics"
            />
            <Label htmlFor="viewOrderAnalytics" className="text-sm font-normal cursor-pointer">
              View order analytics
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="exportReports"
              checked={value.analytics?.exportReports ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("analytics", "exportReports", checked as boolean)
              }
              data-testid="permission-analytics-export"
            />
            <Label htmlFor="exportReports" className="text-sm font-normal cursor-pointer">
              Export reports
            </Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* System Settings Section */}
      <Collapsible
        open={openSections.settings}
        onOpenChange={() => toggleSection("settings")}
      >
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover-elevate active-elevate-2 p-3 rounded-md" data-testid="section-settings">
          {openSections.settings ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-medium">System Settings</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 pt-3 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="manageShopify"
              checked={value.settings?.manageShopify ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("settings", "manageShopify", checked as boolean)
              }
              data-testid="permission-settings-shopify"
            />
            <Label htmlFor="manageShopify" className="text-sm font-normal cursor-pointer">
              Manage Shopify integration
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="manageIVR"
              checked={value.settings?.manageIVR ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("settings", "manageIVR", checked as boolean)
              }
              data-testid="permission-settings-ivr"
            />
            <Label htmlFor="manageIVR" className="text-sm font-normal cursor-pointer">
              Manage IVR settings
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="configureWebhooks"
              checked={value.settings?.configureWebhooks ?? false}
              onCheckedChange={(checked) =>
                handlePermissionChange("settings", "configureWebhooks", checked as boolean)
              }
              data-testid="permission-settings-webhooks"
            />
            <Label htmlFor="configureWebhooks" className="text-sm font-normal cursor-pointer">
              Configure webhooks
            </Label>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
