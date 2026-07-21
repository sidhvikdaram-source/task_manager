import React from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function MomentumIcon({ className }: { className?: string }) {
  return <Activity aria-hidden="true" className={cn("shrink-0", className)} />;
}
