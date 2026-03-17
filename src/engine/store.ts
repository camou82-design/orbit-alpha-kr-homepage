import React from "react"
import { reducer } from "./reducer"
import { initialState, AppState } from "./types"
import { loadState, saveState } from "./persist"
import { Action } from "./actions"

export class AppStore {
    private state: AppState
    private listeners: (() => void)[] = []

    constructor() {
        this.state = initialState
    }

    hydrate() {
        const loaded = loadState()
        if (loaded) {
            this.state = loaded
            this.listeners.forEach(l => l())
        }
    }

    getState() {
        return this.state
    }

    dispatch(action: Action) {
        this.state = reducer(this.state, action)
        saveState(this.state)
        this.listeners.forEach(l => l())
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener)
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener)
        }
    }
}

export const store = new AppStore()

export const StoreContext = React.createContext<AppStore | null>(null)

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
    const [storeInstance] = React.useState(() => store)

    React.useEffect(() => {
        storeInstance.hydrate()
    }, [storeInstance])

    return React.createElement(StoreContext.Provider, { value: storeInstance }, children)
}
