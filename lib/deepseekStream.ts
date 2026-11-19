export function deepseekStream(
    source: ReadableStream<Uint8Array>,
    onCancel?: () => void
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            reader = source.getReader();
            heartbeat = setInterval(() => {
                if (cancelled) return;
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch {
                    // ignore enqueue errors on already-closed controller
                }
            }, 10000);

            try {
                while (!cancelled) {
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    const { done, value } = await Promise.race([
                        reader.read(),
                        new Promise<never>((_, reject) => {
                            timer = setTimeout(() => reject(new Error('百炼模型响应等待超时')), 90000);
                        }),
                    ]).finally(() => clearTimeout(timer));

                    if (done || cancelled) break;
                    if (value && value.byteLength > 0) {
                        controller.enqueue(value);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    const msg = String(err?.message || '').includes('超时')
                        ? '百炼模型响应等待超时，草稿已保留'
                        : '百炼模型连接中断，草稿已保留';
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `\n\ndata: ${JSON.stringify({ error: { message: msg, recoverable: true } })}\n\n`
                            )
                        );
                    } catch {
                        // ignore secondary enqueue failure
                    }
                }
            } finally {
                if (heartbeat) clearInterval(heartbeat);
                try {
                    await reader?.cancel().catch(() => {});
                } catch {
                    // ignore reader cancel failure
                }
                if (!cancelled) {
                    try {
                        controller.close();
                    } catch {
                        // ignore close failure
                    }
                }
            }
        },
        cancel() {
            cancelled = true;
            if (heartbeat) clearInterval(heartbeat);
            void reader?.cancel().catch(() => {});
            try {
                onCancel?.();
            } catch {
                // ignore abort callback error
            }
        },
    });
}
