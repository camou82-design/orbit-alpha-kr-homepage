export const CURRENT_SCHEMA_VERSION = 1

export type AttachmentMeta = {
    id: string
    kind: "photo" | "audio"
    createdAt: number
    mime: string
    durationMs?: number
    note?: string
    storage: { driver: "indexeddb"; key: string }
}

export interface AppState {
    schemaVersion: number
    zone: string
    items: string[]
    attachments?: AttachmentMeta[]
}

export const initialState: AppState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    zone: "A",
    items: [],
    attachments: []
}
