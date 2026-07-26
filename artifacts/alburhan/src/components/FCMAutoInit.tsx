/**
 * FCMAutoInit — mount inside any authenticated layout.
 * Auto-requests push permission for staff/admin roles after 3s.
 * Customers see a manual prompt banner in their Dashboard instead.
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFCM } from "@/hooks/useFCM";

const AUTO_REQUEST_ROLES = ["admin", "super_admin", "branch_manager", "agent", "staff"];

interface Props {
  userType?: string;
}

export function FCMAutoInit({ userType }: Props) {
  const { user } = useAuth();
  const resolvedType = userType || user?.role || "customer";
  const { permission, requestPermission } = useFCM(resolvedType);

  useEffect(() => {
    if (!user) return;
    const role = user.role || "customer";
    // Auto-prompt admin/staff/agent roles (they expect it; it's their work tool)
    if (AUTO_REQUEST_ROLES.includes(role) && permission === "default") {
      const t = setTimeout(() => { requestPermission(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [user?.id, permission]);

  return null;
}
