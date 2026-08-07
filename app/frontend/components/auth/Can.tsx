import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

interface CanProps {
  module: string;
  action?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Conditionally renders children when the current user is permitted to perform
// `action` on `module`. Server-side enforcement (BRGY-38) remains authoritative.
const Can: React.FC<CanProps> = ({ module, action = 'read', children, fallback = null }) => {
  const { can } = usePermissions();
  return <>{can(module, action) ? children : fallback}</>;
};

export default Can;
