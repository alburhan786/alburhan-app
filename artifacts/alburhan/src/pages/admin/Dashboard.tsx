import { AdminLayout } from "@/components/layout/AdminLayout";
import { useGetAdminStats } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { IndianRupee, Users, Package as PackageIcon, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading) return <AdminLayout><div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard...</div></AdminLayout>;
  if (!stats) return <AdminLayout><div>Error loading stats</div></AdminLayout>;

  const statCards = [
    { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Total Bookings", value: stats.totalBookings, icon: PackageIcon, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Pending Approvals", value: stats.pendingBookings, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
    { label: "Total Customers", value: stats.totalCustomers, icon: Users, color: "text-purple-600", bg: "bg-purple-100" },
  ];

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time statistics and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <Card key={i} className="p-6 border-none shadow-sm rounded-2xl flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-foreground">{stat.value}</h3>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-6 border-none shadow-sm rounded-2xl">
          <h3 className="text-lg font-bold mb-4 font-serif">Recent Bookings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.recentBookings?.map(booking => (
                  <tr key={booking.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{booking.bookingNumber}</td>
                    <td className="px-4 py-3 font-medium">{booking.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[150px]">{booking.packageName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`
                        ${booking.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}
                        ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : ''}
                        ${booking.status === 'approved' ? 'bg-blue-100 text-blue-800' : ''}
                      `}>
                        {booking.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(booking.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        
        <Card className="p-6 border-none shadow-sm rounded-2xl bg-primary text-primary-foreground">
          <h3 className="text-lg font-bold mb-4 font-serif text-white">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between">
              <span>Create Offline Booking</span>
              <ChevronRightIcon />
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between">
              <span>Send Broadcast Message</span>
              <ChevronRightIcon />
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-between">
              <span>Generate Reports</span>
              <ChevronRightIcon />
            </button>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function ChevronRightIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;
}
