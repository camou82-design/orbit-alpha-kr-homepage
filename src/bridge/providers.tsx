"use client";

import React from "react";
import { AppStoreProvider } from "@/engine";

export default function Providers({ children }: { children: React.ReactNode }) {
    return <AppStoreProvider>{children}</AppStoreProvider>;
}
