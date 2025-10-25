import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PermissionChecklist } from "@/components/permission-checklist";
import { DEFAULT_MANAGER_PERMISSIONS } from "@shared/schema";
import type { AdminPermissions } from "@shared/schema";

const permissionsSchema = z.object({
  adminType: z.enum(["full_control", "partial_control"]).default("full_control"),
  permissions: z.record(z.any()).optional(),
});

type PermissionsFormData = z.infer<typeof permissionsSchema>;

interface ConfigurePermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteId: string | null;
  inviteEmail: string | null;
}

export function ConfigurePermissionsModal({
  open,
  onOpenChange,
  inviteId,
  inviteEmail,
}: ConfigurePermissionsModalProps) {
  const [selectedAdminType, setSelectedAdminType] = useState<"full_control" | "partial_control">("full_control");
  const { toast } = useToast();

  const form = useForm<PermissionsFormData>({
    resolver: zodResolver(permissionsSchema),
    defaultValues: {
      adminType: "full_control",
      permissions: DEFAULT_MANAGER_PERMISSIONS,
    },
  });

  // Mutation for updating invite permissions
  const updatePermissionsMutation = useMutation({
    mutationFn: async (data: PermissionsFormData) => {
      if (!inviteId) throw new Error("No invite ID");
      const res = await apiRequest("PATCH", `/api/invites/${inviteId}/permissions`, data);
      return await res.json();
    },
    onSuccess: () => {
      // Close modal and reset
      form.reset();
      setSelectedAdminType("full_control");
      onOpenChange(false);
      
      // Invalidate invites cache
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      
      // Show success toast
      toast({
        title: "Success",
        description: `Invite sent to ${inviteEmail} with configured permissions`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to configure permissions",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PermissionsFormData) => {
    updatePermissionsMutation.mutate(data);
  };

  const handleSkip = () => {
    // Skip means full control - submit with default
    updatePermissionsMutation.mutate({
      adminType: "full_control",
      permissions: undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-configure-permissions">
        <DialogHeader>
          <DialogTitle>Configure Admin Permissions</DialogTitle>
          <DialogDescription>
            Set permissions for <span className="font-medium">{inviteEmail}</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <FormField
                control={form.control}
                name="adminType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Admin Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedAdminType(value as "full_control" | "partial_control");
                          
                          // Set default permissions for partial control
                          if (value === "partial_control") {
                            form.setValue("permissions", DEFAULT_MANAGER_PERMISSIONS);
                          } else {
                            form.setValue("permissions", undefined);
                          }
                        }}
                        value={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="full_control" id="full_control_modal" data-testid="radio-full-control-modal" />
                          <label htmlFor="full_control_modal" className="text-sm font-normal cursor-pointer">
                            <div>Full Control</div>
                            <div className="text-xs text-muted-foreground">Unrestricted access to all features</div>
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="partial_control" id="partial_control_modal" data-testid="radio-partial-control-modal" />
                          <label htmlFor="partial_control_modal" className="text-sm font-normal cursor-pointer">
                            <div>Partial Control</div>
                            <div className="text-xs text-muted-foreground">Customizable permissions</div>
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Permission Checklist - only show when admin type is partial_control */}
              {selectedAdminType === "partial_control" && (
                <FormField
                  control={form.control}
                  name="permissions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permissions</FormLabel>
                      <FormControl>
                        <div className="max-h-96 overflow-y-auto border rounded-md p-4">
                          <PermissionChecklist
                            value={field.value as AdminPermissions || DEFAULT_MANAGER_PERMISSIONS}
                            onChange={field.onChange}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkip}
                disabled={updatePermissionsMutation.isPending}
                data-testid="button-skip-permissions"
              >
                Skip (Full Control)
              </Button>
              <Button
                type="submit"
                disabled={updatePermissionsMutation.isPending}
                data-testid="button-save-permissions"
              >
                {updatePermissionsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Permissions"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
