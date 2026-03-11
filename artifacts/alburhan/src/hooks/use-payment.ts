import { useState, useEffect } from "react";
import { useCreatePaymentOrder, useVerifyPayment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function usePayment() {
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();

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

  const initiatePayment = async (bookingId: string, customerName: string, customerEmail: string, customerMobile: string) => {
    if (!isSdkLoaded) {
      toast({ title: "Please wait", description: "Payment gateway is still loading..." });
      return;
    }

    try {
      // 1. Create order on backend
      const order = await createOrder.mutateAsync({ data: { bookingId } });

      // 2. Open Razorpay Checkout
      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "Al Burhan Tours & Travels",
        description: "Booking Payment",
        image: `${import.meta.env.BASE_URL}images/logo.png`,
        order_id: order.orderId,
        handler: async function (response: any) {
          try {
            // 3. Verify payment on backend
            await verifyPayment.mutateAsync({
              data: {
                bookingId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }
            });
            
            toast({
              title: "Payment Successful",
              description: "Your booking is now confirmed. Alhamdulillah.",
            });
            queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
            queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
          } catch (err: any) {
            toast({
              title: "Payment Verification Failed",
              description: err.message || "Please contact support.",
              variant: "destructive"
            });
          }
        },
        prefill: {
          name: customerName,
          email: customerEmail || "info@alburhan.com",
          contact: customerMobile,
        },
        theme: {
          color: "#013220", // Deep emerald primary
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
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

  return { initiatePayment, isInitializing: createOrder.isPending || verifyPayment.isPending };
}
