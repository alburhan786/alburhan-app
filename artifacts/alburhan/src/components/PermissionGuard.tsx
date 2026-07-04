import { usePermissions, type Module, type Action } from "@/hooks/use-permissions";

interface Props {
  module: Module;
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  asDisabled?: boolean;
}

export function PermissionGuard({ module, action, children, fallback = null, asDisabled = false }: Props) {
  const { can, loaded } = usePermissions();
  if (!loaded) return null;
  if (!can(module, action)) {
    if (asDisabled) {
      return (
        <span className="opacity-40 pointer-events-none select-none" title="Insufficient permissions">
          {children}
        </span>
      );
    }
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
