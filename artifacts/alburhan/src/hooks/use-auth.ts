import { useLocation } from "wouter";
import { useGetMe, useSendOtp, useVerifyOtp, useLogout, User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    }
  });

  const sendOtpMutation = useSendOtp();
  const verifyOtpMutation = useVerifyOtp({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(['/api/auth/me'], data.user);
        toast({
          title: "Welcome back!",
          description: "You have successfully logged in.",
        });
        if (data.user.role === 'admin') {
          setLocation("/admin/dashboard");
        } else {
          setLocation("/customer/dashboard");
        }
      },
      onError: (error: any) => {
        toast({
          title: "Login failed",
          description: error?.message || "Invalid OTP. Please try again.",
          variant: "destructive"
        });
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(['/api/auth/me'], null);
        queryClient.clear();
        setLocation("/");
        toast({
          title: "Logged out",
          description: "You have been securely logged out.",
        });
      }
    }
  });

  return {
    user: user as User | undefined,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    sendOtp: sendOtpMutation.mutateAsync,
    isSendingOtp: sendOtpMutation.isPending,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isVerifyingOtp: verifyOtpMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending
  };
}
