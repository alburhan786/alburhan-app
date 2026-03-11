import { useLocation } from "wouter";
import { useGetMe, useSendOtp, useVerifyOtp, useLogout, User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
      staleTime: 1000 * 60 * 5,
    }
  });

  const sendOtpMutation = useSendOtp();

  const verifyOtpMutation = useVerifyOtp({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.setQueryData(['/api/auth/me'], data.user);
        if (data.isNewUser) {
          // handled in Login.tsx (step 3)
          return;
        }
        toast({
          title: "Welcome back!",
          description: `Assalamu Alaikum${data.user?.name ? `, ${data.user.name}` : ""}! You have logged in.`,
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

  const updateProfile = async (data: { name?: string; email?: string }) => {
    const apiBase = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
    const resp = await fetch(`${apiBase}/api/auth/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error("Failed to update profile");
    const updated = await resp.json();
    queryClient.setQueryData(['/api/auth/me'], updated);
    toast({
      title: "Welcome to Al Burhan Tours!",
      description: `Assalamu Alaikum, ${updated.name}! Your profile is set up.`,
    });
    return updated;
  };

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
    isLoggingOut: logoutMutation.isPending,
    updateProfile,
  };
}
