import { useState, useEffect, useRef } from "react";
import { useCreatePaymentOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const BASE_API = import.meta.env.VITE_API_URL || "";

export function usePayment() {
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentHandledRef = useRef(false);

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
    script.onerror = () =>
      toast({
        title: "Error",
        description: "Failed to load payment gateway",
        variant: "destructive",
      });
    document.body.appendChild(script);
  }, [toast]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(
    bookingId: string,
    onSuccess: (booking: any) => void
  ) {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 40;

    console.log("[Payment] Starting polling for bookingId:", bookingId);

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        stopPolling();
        return;
      }

      try {
        // Call sync-payment on attempts 1, 2, 4, 7, 10, 15, 20 ...
        // (aggressively at first, then every 5th)
        const shouldSync =
          attempts <= 3 || attempts % 5 === 0;

        if (shouldSync) {
          console.log(
            `[Payment] Polling attempt ${attempts}: calling sync-payment`
          );
          const syncRes = await fetch(
            `${BASE_API}/api/payments/sync-payment`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bookingId }),
            }
          );
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            console.log("[Payment] sync-payment response:", syncData.status);
            if (
              syncData.status === "confirmed" ||
              syncData.status === "partially_paid"
            ) {
              stopPolling();
              queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
              queryClient.invalidateQueries({
                queryKey: [`/api/bookings/${bookingId}`],
              });
              onSuccess(syncData.booking);
              return;
            }
          } else {
            console.warn(
              "[Payment] sync-payment returned",
              syncRes.status
            );
          }
        } else {
          // Regular booking status check
          const res = await fetch(
            `${BASE_API}/api/bookings/${bookingId}`,
            { credentials: "include" }
          );
          if (!res.ok) return;
          const booking = await res.json();
          console.log(
            `[Payment] Poll ${attempts}: booking status =`,
            booking.status
          );
          if (
            booking.status === "confirmed" ||
            booking.status === "partially_paid"
          ) {
            stopPolling();
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
            queryClient.invalidateQueries({
              queryKey: [`/api/bookings/${bookingId}`],
            });
            onSuccess(booking);
          }
        }
      } catch (err: any) {
        console.error("[Payment] Poll error:", err?.message);
      }
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
      toast({
        title: "Please wait",
        description: "Payment gateway is still loading...",
      });
      return;
    }

    paymentHandledRef.current = false;

    try {
      const order = await createOrder.mutateAsync({
        data: { bookingId, payAmount },
      });

      console.log("[Payment] Order created:", order.orderId);

      const handlePaymentSuccess = async (response: any) => {
        console.log("[Payment] handler fired with response:", response);
        paymentHandledRef.current = true;
        stopPolling();

        const verifyUrl = `${BASE_API}/api/payments/verify`;
        console.log("[Payment] Calling verify at:", verifyUrl);

        try {
          const res = await fetch(verifyUrl, {
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

          console.log("[Payment] Verify HTTP status:", res.status);
          const data = await res.json();
          console.log("[Payment] Verify response:", data);

          if (data.success) {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
            queryClient.invalidateQueries({
              queryKey: [`/api/bookings/${bookingId}`],
            });
            if (onSuccess) onSuccess(data.booking);
          } else {
            console.error(
              "[Payment] Verify returned failure:",
              data.message
            );
            toast({
              title: "Verification issue",
              description:
                data.message ||
                "Payment received but verification failed. Checking status...",
              variant: "destructive",
            });
            startPolling(bookingId, (booking) => {
              if (onSuccess) onSuccess(booking);
            });
          }
        } catch (err: any) {
          console.error("[Payment] Verify fetch error:", err?.message);
          toast({
            title: "Checking payment status...",
            description: "Payment received. Confirming with server.",
          });
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
        description: payAmount
          ? `Partial Payment — ₹${payAmount.toLocaleString("en-IN")}`
          : "Booking Payment",
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
            console.log(
              "[Payment] Modal dismissed. paymentHandled =",
              paymentHandledRef.current
            );
            // Only start polling if handler hasn't already handled it
            if (!paymentHandledRef.current) {
              console.log("[Payment] Starting fallback polling after dismiss");
              startPolling(bookingId, (booking) => {
                if (onSuccess) onSuccess(booking);
              });
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        console.error("[Payment] payment.failed:", response.error);
        stopPolling();
        paymentHandledRef.current = true;
        toast({
          title: "Payment Failed",
          description: response.error.description,
          variant: "destructive",
        });
      });
      rzp.open();
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err.message || "Failed to initialize payment.",
        variant: "destructive",
      });
    }
  };

  return { initiatePayment, isInitializing: createOrder.isPending };
}
