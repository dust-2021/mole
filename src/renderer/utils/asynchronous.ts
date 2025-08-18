import { Mutex, Semaphore } from 'async-mutex';

export class RWLock {
    private readMutex = new Mutex(); // 保护 readerCount
    private globalMutex = new Mutex(); // 写锁
    private readerCount = 0;
    private readSemaphore: Semaphore; // 控制读并发

    public constructor(maxReaderCount: number = 100) {
        this.readSemaphore = new Semaphore(maxReaderCount);
    }

    async acquireRead() {
        await this.readSemaphore.acquire();
        const releaseReadMutex = await this.readMutex.acquire();
        try {
            this.readerCount++;
            if (this.readerCount === 1) {
                // 第一个读者获取全局锁（阻塞写入）
                await this.globalMutex.acquire();
            }
        } finally {
            releaseReadMutex();
        }
        return () => this.releaseRead();
    }

    async acquireWrite() {
        await this.globalMutex.acquire(); // 直接获取全局锁（独占）
        return () => this.releaseWrite();
    }

    private async releaseRead() {
        const releaseReadMutex = await this.readMutex.acquire();
        try {
            this.readerCount--;
            if (this.readerCount === 0) {
                this.globalMutex.release(); // 最后一个读者释放全局锁
            }
        } finally {
            releaseReadMutex();
            this.readSemaphore.release();
        }
    }

    private releaseWrite() {
        this.globalMutex.release(); // 释放全局锁
    }
}

// 异步安全哈希表
export class AsyncMap<T> {
    private map: Map<string, T> = new Map();
    private readonly lock: RWLock;

    public constructor(lock?:RWLock ) {
        if (lock) {
            this.lock = lock;
        } else {
            this.lock = new RWLock();
        }
    }

    public async get(key: string): Promise<T | undefined> {
        const release = await this.lock.acquireRead();
        try {
            return this.map.get(key);
        } catch (e) {
            return undefined;
        } finally {
            await release();
        }
    }
    public async has(key: string): Promise<boolean> {
        const release = await this.lock.acquireRead();
        try {
            return this.map.has(key);
        } catch (e) {
            return false;
        } finally {
            await release();
        }
    }

    public async set(key: string, value: T): Promise<void> {
        const release = await this.lock.acquireWrite();
        try {
            this.map.set(key, value);
        } catch (e) {} finally {
            release();
        }
    }

    public async delete(key: string): Promise<void> {
        const release = await this.lock.acquireWrite();
        try {
            this.map.delete(key);
        }catch (e) {} finally {
            release();
        }
    }
}