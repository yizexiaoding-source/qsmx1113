// Keep text and terminal status separate. Legacy callers can still receive plain text.
export function geminiStream(source: AsyncIterable<any>, structured: boolean, signal?: AbortSignal) {
    const encoder = new TextEncoder();
    let cancelled = false;
    let iterator: AsyncIterator<any>;
    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (event: any) => {
                if (cancelled) return;
                if (structured) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
                else if (event.type === 'text') controller.enqueue(encoder.encode(event.text));
                else if (event.type === 'error') controller.error(new Error(event.message));
            };
            const heartbeat = structured ? setInterval(() => send({ type: 'heartbeat' }), 10000) : undefined;
            let reason = '';
            iterator = source[Symbol.asyncIterator]();
            try {
                while (!cancelled && !signal?.aborted) {
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    const result = await Promise.race([
                        iterator.next(),
                        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('模型响应等待超时')), 90000); })
                    ]).finally(() => clearTimeout(timer));
                    if (result.done) break;
                    const chunk = result.value;
                    const candidateReason = chunk?.candidates?.[0]?.finishReason;
                    if (candidateReason && candidateReason !== 'FINISH_REASON_UNSPECIFIED') {
                        reason = candidateReason;
                    }
                    const parts = chunk?.candidates?.[0]?.content?.parts;
                    const text = Array.isArray(parts) ? parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('') : chunk?.text || '';
                    if (text) send({ type: 'text', text });
                }
                if (!cancelled && !signal?.aborted) send({ type: 'finish', reason: reason || 'UNKNOWN' });
            } catch {
                send({ type: 'error', message: '模型连接中断或响应超时', recoverable: true });
            } finally {
                clearInterval(heartbeat);
                if (!cancelled) { try { controller.close(); } catch {} }
                void Promise.resolve(iterator.return?.()).catch(() => {});
            }
        },
        cancel() { cancelled = true; void Promise.resolve(iterator?.return?.()).catch(() => {}); }
    });
}
