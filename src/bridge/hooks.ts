"use client"

import { useContext, useEffect, useState } from "react"
import { StoreContext } from "@/engine"
import { AppState } from "@/engine";

export function useAppStore() {
    const store = useContext(StoreContext)
    if (!store) throw new Error("Store not found")

    const [state, setState] = useState<AppState>(store.getState())

    useEffect(() => {
        return store.subscribe(() => {
            setState(store.getState())
        })
    }, [store])

    return { state, dispatch: store.dispatch.bind(store) }
}
