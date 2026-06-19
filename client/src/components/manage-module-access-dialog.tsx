import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ACCESS_MODULES } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// ManageModuleAccessDialog — per-user page access (additive grants).
//
// Lists the grantable page modules (ACCESS_MODULES) with a toggle each.
// The toggle set is the user's current `moduleAccess`; Save submits the
// full set via PATCH /api/users/:id { moduleAccess }. Grants are additive
// on top of the user's role, so an Inside Sales Executive can be given the
// Abandoned Carts page without changing their role.
// ─────────────────────────────────────────────────────────────────────

interface ManageModuleAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; fullName: string; moduleAccess?: string[] | null } | null;
}

export function ManageModuleAccessDialog({
  open,
  onOpenChange,
  user,
}: ManageModuleAccessDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Hydrate the toggle set from the target user every time the modal opens.
  useEffect(() => {
    if (open && user) {
      setSelected(new Set(Array.isArray(user.moduleAccess) ? user.moduleAccess : []));
      setError(null);
    } else if (!open) {
      setSelected(new Set());
      setError(null);
    }
  }, [open, user]);

  const mutation = useMutation({
    mutationFn: async (moduleAccess: string[]) => {
      if (!user) return null;
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, { moduleAccess });
      return res.json();
    },
    onSuccess: async () => {
      if (!user) return;
      // Refresh the team list (so the row reflects the new grants) and the
      // sidebar's current-user query (so a self-grant appears immediately).
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ predicate: (q) =>
        Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("/api/users/by-email"),
      });
      toast({
        title: "Page access updated",
        description: `${user.fullName}'s page access has been saved. It applies on their next page load / login.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const stripped = (err?.message ?? "Unknown error").replace(/^\d+:\s*/, "");
      try {
        setError(JSON.parse(stripped)?.error ?? stripped);
      } catch {
        setError(stripped);
      }
    },
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Manage page access
          </DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Choose which pages{" "}
                <span className="font-medium text-foreground">{user.fullName}</span>{" "}
                can access, in addition to their role's defaults.
              </>
            ) : (
              "Choose which pages this user can access."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {ACCESS_MODULES.map((mod) => {
            const checked = selected.has(mod.key);
            return (
              <label
                key={mod.key}
                htmlFor={`module-access-${mod.key}`}
                className={cn(
                  "flex items-center gap-3 rounded-md p-2 cursor-pointer hover:bg-accent transition-colors",
                )}
                data-testid={`module-access-row-${mod.key}`}
              >
                <Label
                  htmlFor={`module-access-${mod.key}`}
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  {mod.label}
                </Label>
                <Switch
                  id={`module-access-${mod.key}`}
                  checked={checked}
                  onCheckedChange={() => toggle(mod.key)}
                  disabled={mutation.isPending}
                  data-testid={`switch-module-access-${mod.key}`}
                />
              </label>
            );
          })}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription data-testid="manage-module-access-error">{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-manage-module-access-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              mutation.mutate(Array.from(selected));
            }}
            disabled={mutation.isPending}
            data-testid="button-manage-module-access-save"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
