import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { CancelOrderModal } from "@/components/cancel-order-modal";
import { FollowupOrderModal } from "@/components/followup-order-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CallStatusActionsProps {
  orderId: string;
  orderNumber: string;
  currentStatus?: "Pending" | "Confirmed" | "Cancelled" | "Follow Up";
  onConfirm: (orderId: string, notes?: string) => Promise<void>;
  onCancel: (orderId: string, reason: string, notes?: string) => Promise<void>;
  onFollowup: (orderId: string, followupAt: Date, notes?: string) => Promise<void>;
  disabled?: boolean;
}

export function CallStatusActions({
  orderId,
  orderNumber,
  currentStatus,
  onConfirm,
  onCancel,
  onFollowup,
  disabled = false,
}: CallStatusActionsProps) {
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [followupModalOpen, setFollowupModalOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmClick = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmOrder = async () => {
    try {
      setIsConfirming(true);
      await onConfirm(orderId, confirmNotes);
      setConfirmDialogOpen(false);
      setConfirmNotes("");
    } catch (error) {
      console.error("Error confirming order:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelClick = () => {
    setCancelModalOpen(true);
  };

  const handleCancelOrder = async (reason: string, notes?: string) => {
    await onCancel(orderId, reason, notes);
  };

  const handleFollowupClick = () => {
    setFollowupModalOpen(true);
  };

  const handleScheduleFollowup = async (followupAt: Date, notes?: string) => {
    await onFollowup(orderId, followupAt, notes);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Confirmed":
        return "text-green-600 dark:text-green-400";
      case "Cancelled":
        return "text-red-600 dark:text-red-400";
      case "Follow Up":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-purple-600 dark:text-purple-400";
    }
  };

  if (currentStatus === "Confirmed" || currentStatus === "Cancelled") {
    // Show status badge for completed states
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={`${getStatusColor(currentStatus)} border-current`}
        data-testid={`button-status-${currentStatus.toLowerCase()}`}
      >
        {currentStatus === "Confirmed" ? (
          <CheckCircle2 className="h-4 w-4 mr-1" />
        ) : (
          <XCircle className="h-4 w-4 mr-1" />
        )}
        {currentStatus}
      </Button>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleConfirmClick}
          className="gap-1 text-green-600 dark:text-green-400 border-green-300 dark:border-green-800"
          data-testid="button-confirm"
        >
          <CheckCircle2 className="h-4 w-4" />
          Confirm
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleCancelClick}
          className="gap-1 text-red-600 dark:text-red-400 border-red-300 dark:border-red-800"
          data-testid="button-cancel"
        >
          <XCircle className="h-4 w-4" />
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleFollowupClick}
          className="gap-1 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800"
          data-testid="button-followup"
        >
          <Clock className="h-4 w-4" />
          Follow Up
        </Button>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent data-testid="dialog-confirm-order">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription>
              Order {orderNumber} - Mark this order as confirmed and move it to Fulfil section?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="confirm-notes">Notes (Optional)</Label>
            <Input
              id="confirm-notes"
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              placeholder="Add any notes..."
              className="mt-1.5"
              data-testid="input-confirm-notes"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isConfirming}
              data-testid="button-cancel-dialog"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOrder}
              disabled={isConfirming}
              data-testid="button-confirm-order"
            >
              {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Modal */}
      <CancelOrderModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        onConfirm={handleCancelOrder}
        orderNumber={orderNumber}
      />

      {/* Follow-up Modal */}
      <FollowupOrderModal
        open={followupModalOpen}
        onOpenChange={setFollowupModalOpen}
        onConfirm={handleScheduleFollowup}
        orderNumber={orderNumber}
      />
    </>
  );
}
