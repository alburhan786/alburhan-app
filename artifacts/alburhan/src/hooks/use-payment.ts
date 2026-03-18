import { useState, useEffect, useRef } from "react";
import { useCreatePaymentOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const BASE_API = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export function usePayment() {
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createOrder = useCreatePaymentOrder();

  useEffect(() => {
    if (window.Razorpay) {
      setIsSdkLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setIsSdkLoaded(true);
    script.onerror = () => toast({ title: "Error", description: "Failed to load payment gateway", variant: "destructive" });
    document.body.appendChild(script);
  }, [toast]);

  function startPolling(bookingId: string, onSuccess: (booking: any) => void) {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    const maxAttempts = 40;

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        return;
      }
      try {
        // Every 5th poll (~15s) call sync-payment to check Razorpay directly
        if (attempts % 5 === 0) {
          const syncRes = await fetch(`${BASE_API}/api/payments/sync-payment`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            if (syncData.status === "confirmed" || syncData.status === "partially_paid") {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
              queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
              onSuccess(syncData.booking);
              return;
            }
          }
        }

        // Regular booking status check
        const res = await fetch(`${BASE_API}/api/bookings/${bookingId}`, { credentials: "include" });
        if (!res.ok) return;
        const booking = await res.json();
        if (booking.status === "confirmed" || booking.status === "partially_paid") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
          queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
          onSuccess(booking);
        }
      } catch {}
    }, 3000);
  }

  const initiatePayment = async (
    bookingId: string,
    customerName: string,
    customerEmail: string,
    customerMobile: string,
    payAmount?: number,
    onSuccess?: (booking: any) => void
  ) => {
    if (!isSdkLoaded) {
      toast({ title: "Please wait", description: "Payment gateway is still loading..." });
      return;
    }

    try {
      const order = await createOrder.mutateAsync({ data: { bookingId, payAmount } });

      const handlePaymentSuccess = async (response: any) => {
        console.log("Payment Success:", response);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        try {
          const res = await fetch(`${BASE_API}/api/payments/verify`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              bookingId,
              payAmount,
            }),
          });

          const data = await res.json();

          if (data.success) {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
            queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
            if (onSuccess) onSuccess(data.booking);
          } else {
            console.error("[Payment] Verify returned failure:", data.message);
            toast({ title: "Verification issue", description: data.message || "Payment received but verification failed. Our team will confirm shortly.", variant: "destructive" });
            startPolling(bookingId, (booking) => {
              if (onSuccess) onSuccess(booking);
            });
          }
        } catch (err: any) {
          console.error("[Payment] Verify failed:", err?.message);
          startPolling(bookingId, (booking) => {
            if (onSuccess) onSuccess(booking);
          });
        }
      };

      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "Al Burhan Tours & Travels",
        description: payAmount ? `Partial Payment — ₹${payAmount.toLocaleString("en-IN")}` : "Booking Payment",
        image: `${import.meta.env.BASE_URL}images/logo.png`,
        order_id: order.orderId,
        handler: handlePaymentSuccess,
        prefill: {
          name: customerName,
          email: customerEmail || "info@alburhan.com",
          contact: customerMobile,
        },
        theme: {
          color: "#013220",
        },
        modal: {
          ondismiss: () => {
            startPolling(bookingId, (booking) => {
              if (onSuccess) onSuccess(booking);
            });
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        toast({
          title: "Payment Failed",
          description: response.error.description,
          variant: "destructive"
        });
      });
      rzp.open();

    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err.message || "Failed to initialize payment.",
        variant: "destructive"
      });
    }
  };

  return { initiatePayment, isInitializing: createOrder.isPending };
}
