export type Action =
    | { type: "SET_ZONE"; payload: string }
    | { type: "ADD_ITEM"; payload: string }
    | { type: "RESET" }

export const setZone = (zone: string): Action => ({
    type: "SET_ZONE",
    payload: zone
})

export const addItem = (item: string): Action => ({
    type: "ADD_ITEM",
    payload: item
})

export const reset = (): Action => ({
    type: "RESET"
})
