import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Loader2, RotateCcw } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface Props {
  bookingId: string;
  trigger: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
  iconOnly?: boolean;
  onSent?: () => void;
}

export function WhatsAppSendButton({
  bookingId, trigger, label, variant = "outline", size = "sm", iconOnly = false, onSent,
}: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/resend-booking-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, trigger }),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "WhatsApp Sent", description: label ? `${label} sent successfully` : "Template sent to customer" });
        onSent?.();
      } else {
        toast({ title: "Send Failed", description: data.message || "Failed to send WhatsApp", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSend}
      disabled={sending}
      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
      title={label || "Send WhatsApp"}
    >
      {sending
        ? <Loader2 size={14} className={iconOnly ? "" : "mr-1.5"} />
        : <MessageCircle size={14} className={iconOnly ? "" : "mr-1.5"} />
      }
      {!iconOnly && (label || "Send WhatsApp")}
    </Button>
  );
}

interface ResendProps {
  logId: string;
  label?: string;
  onSent?: () => void;
}

export function WhatsAppResendButton({ logId, label, onSent }: ResendProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry/${logId}`, { method: "POST" });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "Resent", description: "Message resent to customer" });
        onSent?.();
      } else {
        toast({ title: "Resend Failed", description: data.errorMessage || "Failed", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleResend}
      disabled={sending}
      className="text-indigo-600 hover:bg-indigo-50 h-7 text-xs"
    >
      {sending ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RotateCcw size={12} className="mr-1" />}
      {label || "Resend"}
    </Button>
  );
}
