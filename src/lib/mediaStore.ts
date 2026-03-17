export const DB_NAME = "safety-media-db-safe";
export const STORE_NAME = "records";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveMediaSafe(record: any) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error("SafeMedia 저장 실패:", err);
        return false;
    }
}

export async function getMediaBySessionSafe(sessionId: string) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);

        return new Promise<any[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const all = request.result;
                resolve(all.filter((r: any) => r.sessionId === sessionId));
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error("SafeMedia 불러오기 실패:", err);
        return [];
    }
}
