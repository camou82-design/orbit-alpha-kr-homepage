"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Storage } from "@/lib/storage";

export function useAdminGuard() {
    const router = useRouter();
    useEffect(() => {
        const auth = Storage.semi.loadAuth?.();
        if (!auth?.loggedIn || auth.role !== "admin") {
            router.replace("/admin/login");
        }
    }, [router]);
}

export function useWorkerGuard() {
    const router = useRouter();
    useEffect(() => {
        const auth = Storage.semi.loadAuth?.();
        if (!auth?.loggedIn || auth.role !== "worker") {
            router.replace("/admin/login");
        }
    }, [router]);
}
