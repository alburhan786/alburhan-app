import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

async function getUserCredentialHeaders(): Promise<Record<string, string>> {
  try {
    const userStr = await AsyncStorage.getItem("user");
    if (!userStr) return {};
    const user = JSON.parse(userStr);
    if (user?.id && user?.userToken) {
      return {
        "X-User-Id": String(user.id),
        "X-User-Token": user.userToken,
      };
    }
  } catch (_) {}
  return {};
}

async function request(method: string, path: string, data?: any) {
  try {
    const baseUrl = getApiUrl();
    const url = new URL(path, baseUrl);
    const credHeaders = await getUserCredentialHeaders();
    const headers: Record<string, string> = { ...credHeaders };
    if (data) headers["Content-Type"] = "application/json";
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    const json = await res.json();
    return json;
  } catch (error) {
    console.error(`API request failed: ${method} ${path}`, error);
    return { success: false, error: "Network request failed" };
  }
}

export const authService = {
  async register(data: { name: string; email: string; phone: string; password: string }) {
    const response = await request("POST", "/api/auth/register", data);
    if (response.success) {
      await AsyncStorage.setItem("user", JSON.stringify(response.user));
    }
    return response;
  },

  async login(email: string, password: string) {
    const response = await request("POST", "/api/auth/login", { email, password });
    if (response.success) {
      await AsyncStorage.setItem("user", JSON.stringify(response.user));
    }
    return response;
  },

  async sendOtp(phone: string) {
    return request("POST", "/api/auth/send-otp", { phone });
  },

  async sendWhatsAppOtp(phone: string) {
    return request("POST", "/api/auth/send-whatsapp-otp", { phone });
  },

  async verifyOtp(phone: string, otp: string, userData: { name: string; email: string; password: string }) {
    const response = await request("POST", "/api/auth/verify-otp", {
      phone,
      otp,
      ...userData,
    });
    if (response.success) {
      await AsyncStorage.setItem("user", JSON.stringify(response.user));
    }
    return response;
  },

  async loginWithOtp(phone: string): Promise<{ success: boolean; message?: string; error?: string; errorCode?: string; fallbackOtp?: string; deliveryFailed?: boolean }> {
    return request("POST", "/api/auth/login-with-otp", { phone });
  },

  async verifyLoginOtp(phone: string, otp: string) {
    const response = await request("POST", "/api/auth/verify-login-otp", { phone, otp });
    if (response.success) {
      await AsyncStorage.setItem("user", JSON.stringify(response.user));
    }
    return response;
  },

  async logout() {
    await request("POST", "/api/auth/logout");
    await AsyncStorage.removeItem("user");
  },

  async getCurrentUser() {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/me", baseUrl);
      const res = await fetch(url.toString(), { method: "GET", credentials: "include" });
      const json = await res.json();
      if (json.success && json.user) {
        await AsyncStorage.setItem("user", JSON.stringify(json.user));
        return json.user;
      }
    } catch (_) {}
    const userStr = await AsyncStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  },
};

export const packageService = {
  async getPackages(filters?: { type?: string; minPrice?: number; maxPrice?: number }) {
    const params = new URLSearchParams();
    if (filters?.type) params.set("type", filters.type);
    if (filters?.minPrice) params.set("minPrice", filters.minPrice.toString());
    if (filters?.maxPrice) params.set("maxPrice", filters.maxPrice.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/api/packages${query}`);
  },

  async getPackageById(id: number) {
    return request("GET", `/api/packages/${id}`);
  },
};

export const bookingService = {
  async createBooking(bookingData: any) {
    return request("POST", "/api/bookings", bookingData);
  },

  async getUserBookings(userId: number) {
    return request("GET", `/api/bookings/user/${userId}`);
  },

  async getBookingById(id: number) {
    return request("GET", `/api/bookings/${id}`);
  },

  getInvoicePdfUrl(bookingId: number): string {
    const baseUrl = getApiUrl();
    return new URL(`/api/bookings/${bookingId}/invoice`, baseUrl).toString();
  },
};

export const paymentService = {
  async createOrder(bookingId: number, amount: number) {
    return request("POST", "/api/payments/create-order", { bookingId, amount });
  },

  async verifyPayment(data: {
    bookingId: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    amount: string;
  }) {
    return request("POST", "/api/payments/verify", data);
  },
};

export const documentService = {
  async uploadDocument(data: {
    userId: number;
    bookingId?: number;
    type: string;
    fileName: string;
    fileUri: string;
  }) {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/documents/upload", baseUrl);

      const formData = new FormData();
      formData.append("userId", data.userId.toString());
      formData.append("type", data.type);
      formData.append("fileName", data.fileName);
      if (data.bookingId) formData.append("bookingId", data.bookingId.toString());

      const ext = data.fileName.split(".").pop()?.toLowerCase() || "bin";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        pdf: "application/pdf", doc: "application/msword",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";

      formData.append("file", {
        uri: data.fileUri,
        name: data.fileName,
        type: mimeType,
      } as any);

      const credHeaders = await getUserCredentialHeaders();
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: credHeaders,
        body: formData,
        credentials: "include",
      });
      const json = await res.json();
      return json;
    } catch (error) {
      console.error("Document upload failed:", error);
      return { success: false, error: "Upload failed" };
    }
  },

  async getUserDocuments(userId: number) {
    return request("GET", `/api/documents/user/${userId}`);
  },
};

export const deviceTokenService = {
  async register(token: string, platform: string, expoPushToken?: string) {
    return request("POST", "/api/user/device-token", { token, platform, expoPushToken });
  },
  async unregister(token: string) {
    return request("DELETE", "/api/user/device-token", { token });
  },
};

export const notificationService = {
  async getUserNotifications() {
    return request("GET", "/api/notifications");
  },
};

export const kycService = {
  async getProfile() {
    return request("GET", "/api/profile/kyc");
  },
  async saveProfile(data: { aadharNumber?: string; panNumber?: string; bloodGroup?: string; whatsappNumber?: string }) {
    return request("POST", "/api/profile/kyc", data);
  },
  async uploadPhoto(photoUri: string, fileName: string): Promise<{ success: boolean; photoUrl?: string; error?: string }> {
    const { getApiUrl } = await import("../lib/query-client");
    const credHeaders = await getUserCredentialHeaders();
    const formData = new FormData();
    formData.append("photo", { uri: photoUri, name: fileName, type: "image/jpeg" } as any);
    const url = new URL("/api/profile/kyc/photo", getApiUrl()).toString();
    const response = await fetch(url, { method: "POST", headers: { ...credHeaders }, body: formData });
    return response.json();
  },
};

export const seedDatabase = async () => {
  return request("POST", "/api/seed");
};
