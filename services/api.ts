import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

async function request(method: string, path: string, data?: any) {
  try {
    const baseUrl = getApiUrl();
    const url = new URL(path, baseUrl);
    const res = await fetch(url.toString(), {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
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

  async logout() {
    await AsyncStorage.removeItem("user");
  },

  async getCurrentUser() {
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
    fileUrl: string;
  }) {
    return request("POST", "/api/documents/upload", data);
  },

  async getUserDocuments(userId: number) {
    return request("GET", `/api/documents/user/${userId}`);
  },
};

export const seedDatabase = async () => {
  return request("POST", "/api/seed");
};
