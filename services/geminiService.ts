interface GenerationOptions {
    model: string;
    temperature: number;
    topP: number;
    maxOutputTokens?: number;
    signal?: AbortSignal;
    taskPrompt?: string;
}

// Old saved Gemini choices migrate to Gemini 4 Hydrogen.
export function normalizeClientModel(rawModel?: string): string {
    const model = typeof rawModel === 'string' ? rawModel.trim().toLowerCase() : '';
    if (['gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon', 'qwen3.8-flash', 'deepseek-chat', 'deepseek-reasoner'].includes(model)) return model;
    if (model.startsWith('deepseek') || model.startsWith('doubao')) return model.includes('reasoner') ? 'deepseek-reasoner' : 'deepseek-chat';
    return 'gemini-4-hydrogen';
}

function createAttemptSignal(userSignal?: AbortSignal, timeoutMs = 75000): {
    signal: AbortSignal;
    cleanup: () => void;
    didTimeout: () => boolean;
} {
    const controller = new AbortController();
    let timedOut = false;

    const onUserAbort = () => {
        controller.abort();
    };

    if (userSignal) {
        if (userSignal.aborted) {
            controller.abort();
        } else {
            userSignal.addEventListener('abort', onUserAbort, { once: true });
        }
    }

    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    const cleanup = () => {
        clearTimeout(timer);
        if (userSignal) {
            userSignal.removeEventListener('abort', onUserAbort);
        }
    };

    return {
        signal: controller.signal,
        cleanup,
        didTimeout: () => timedOut
    };
}

// Helper: Enhanced fetch with bounded timeout & fast retry logic
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 1,
    baseDelay = 1200,
    timeoutMs = 75000
): Promise<Response> {
    let lastError: any;
    const userSignal = options.signal ?? undefined;

    for (let i = 0; i <= maxRetries; i++) {
        if (userSignal?.aborted) {
            throw new Error('Aborted');
        }

        const attempt = createAttemptSignal(userSignal, timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: attempt.signal
            });
            attempt.cleanup();

            if (response.ok) {
                return response;
            }

            const errorText = await response.clone().text();
            const lowerErr = errorText.toLowerCase();
            const isDailyQuota =
                lowerErr.includes('perday') ||
                lowerErr.includes('requestsperday') ||
                lowerErr.includes('exceeded your current quota') ||
                lowerErr.includes('resource_exhausted');
            const isRetryableStatus = [500, 502, 503, 504, 429].includes(response.status);
            const isOverloaded =
                !isDailyQuota &&
                (lowerErr.includes('overloaded') ||
                    lowerErr.includes('503') ||
                    lowerErr.includes('504') ||
                    lowerErr.includes('timeout') ||
                    lowerErr.includes('rate limit'));

            if (isRetryableStatus && isOverloaded && i < maxRetries) {
                const delay = baseDelay * Math.pow(2, i);
                console.warn(`API busy (Attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            return response;
        } catch (err: any) {
            const timedOut = attempt.didTimeout();
            attempt.cleanup();

            if (userSignal?.aborted) {
                throw new Error('Aborted');
            }

            lastError = timedOut
                ? new Error('请求响应超时，请重试或切换其他模型')
                : err;

            if (i < maxRetries) {
                const delay = baseDelay * Math.pow(2, i);
                console.warn(`Network/timeout error (Attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, lastError);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
        }
    }

    throw lastError || new Error('Failed to fetch after retries');
}

// Helper: Format error messages for users
function formatGeminiError(errorMsg: string): string {
    if (!errorMsg) {
        return '⚠️ 模型未返回有效内容，请重试或切换其他模型。';
    }
    if (errorMsg.includes('超时') || errorMsg.toLowerCase().includes('timeout')) {
        return '⚠️ 模型响应超时，请稍后重试，或在模型菜单中切换其他模型继续创作。';
    }
    if (errorMsg.includes('overloaded') || errorMsg.includes('503')) {
        return '⚠️ 模型当前负载过高 (Server Overloaded)，请稍后再试或切换其他可用模型。';
    }
    if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        return '⚠️ 当前模型接口调用频率或免费额度已达上限 (429 Quota Exceeded)。建议在模型下拉菜单中切换为【Gemini 4 Hydrogen】、【奇思版 (DeepSeek)】或【千问 Qwen3.8-Flash】继续流畅创作！';
    }
    try {
        if (errorMsg.trim().startsWith('{')) {
            const parsed = JSON.parse(errorMsg);
            if (parsed.error && typeof parsed.error === 'string') {
                return formatGeminiError(parsed.error);
            }
            if (parsed.error?.message) {
                return formatGeminiError(parsed.error.message);
            }
        }
    } catch {
        // Ignore JSON parse errors
    }

    return `⚠️ 服务请求失败: ${errorMsg.length > 120 ? errorMsg.substring(0, 120) + '...' : errorMsg}`;
}

export function countContentChars(text: string): number {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, '').length;
}

// Only inspect the task, never infer a required story length from the token slider.
export function resolveStoryTarget(prompt: string): number | null {
    if (/【任务类型】：内容续写|上文输出因长度限制被中断|严格返回 JSON|JSON格式输出/.test(prompt)) return null;
    const task = prompt.split('【专业创作指令】')[0];
    const matches = [...task.matchAll(/([一二三四五六七八九十两\d.]+)\s*(万字|千字|字)/g)];
    const match = matches.at(-1);
    if (!match) return null;
    const digits: Record<string, number> = {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
    const n = Number(match[1]) || digits[match[1]];
    const target = n * (match[2] === '万字' ? 10000 : match[2] === '千字' ? 1000 : 1);
    return Number.isFinite(target) && target >= 5000 ? Math.round(target) : null;
}

function prepareStoryPrompt(prompt: string, options: GenerationOptions): { prompt: string; target: number | null } {
    const target = resolveStoryTarget(options.taskPrompt ?? prompt);
    if (!target) return { prompt, target };
    const min = Math.ceil(target * 0.95), max = Math.floor(target * 1.05);
    return { target, prompt: `${prompt}

【单篇正文与篇幅要求（优先执行）】
本次只创作一篇完整小说，目标 ${target} 字，允许 ${min}～${max} 字（按正文去除空白后的字符数，含标点）。
请先在内部规划同一故事的开端、发展、高潮、结局及篇幅，然后直接输出正文。
保持同一组人物、同一条主线和连续因果，只允许一个开篇与一个最终结局。
禁止输出第二篇、另一版、重新开篇、重复全文或通过附加故事凑字数。
若篇幅需要增加，应在同一故事的发展与高潮中展开场景、行动和对话；不要提前完结再接新故事。
只输出正文，不输出计划、字数说明或版本说明。` };
}

function validateStoryResult(text: string, target: number | null): void {
    if (!target) return;
    if (text.trimStart().startsWith('⚠️')) throw new Error('生成失败，未完成正文，请检查上方错误信息。');
    if (/(?:^|\n)\s*(?:#{1,6}\s*)?(?:第[二三234]篇|第二个故事|另一(?:篇|版)(?:小说|故事|正文)|(?:以下|下面)(?:是|为).{0,12}(?:第二篇|另一篇))/m.test(text)
        || /(?:全文完|全书完|【完】|\(完\)|（完）)[\s\S]{150,}$/.test(text)) {
        throw new Error('检测到完结后继续输出或多个故事标记，本次未通过单篇检查。请勿将其当作合格终稿。');
    }
    const actual = countContentChars(text);
    if (actual < Math.ceil(target * 0.95) || actual > Math.floor(target * 1.05)) {
        throw new Error(`正文实际 ${actual} 字，未达到 ${Math.ceil(target * 0.95)}～${Math.floor(target * 1.05)} 字的验收范围。已保留草稿，不会自动拼接另一篇；请调整任务或重新生成。`);
    }
}

async function generateSingleText(prompt: string, options: GenerationOptions): Promise<string> {
    const maxOutputTokens = options.maxOutputTokens || 8192;
    const normalizedModel = normalizeClientModel(options.model);

    if (normalizedModel.startsWith('gemini')) {
        try {
            const response = await fetchWithRetry('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: normalizedModel,
                    contents: prompt,
                    temperature: options.temperature,
                    top_p: options.topP,
                    max_tokens: maxOutputTokens,
                    stream: false
                }),
                signal: options.signal
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(errorData);
            }

            const data = await response.json();
            return data.text || '⚠️ 模型未返回有效内容，请重试或切换其他模型。';
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'Aborted' || options.signal?.aborted) {
                throw new Error('Aborted');
            }
            console.error('Error generating text with Gemini:', error);
            return formatGeminiError(error.message || String(error));
        }
    } else if (normalizedModel.startsWith('qwen') || normalizedModel.startsWith('deepseek')) {
        const endpoint = '/api/deepseek';
        const effectiveMaxTokens = Math.min(maxOutputTokens, 65536);

        try {
            const response = await fetchWithRetry(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: normalizedModel,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful creative writing assistant. Write detailed, expansive, and high-quality content. Do not summarize unless asked. If the user asks for a long text, generate as much as possible within the token limit. Use Markdown headers (# ## ###) for structure.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: options.temperature,
                    top_p: options.topP,
                    max_tokens: effectiveMaxTokens,
                    stream: false
                }),
                signal: options.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server Error: ${response.status}`);
            }

            const data = await response.json();
            let content = data.choices?.[0]?.message?.content || '';
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            if (!content) {
                throw new Error('Empty response from provider');
            }
            return content;
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'Aborted' || options.signal?.aborted) {
                throw new Error('Aborted');
            }
            console.warn(`Error generating text with ${normalizedModel}, falling back to Gemini 4 Hydrogen:`, error);
            return generateSingleText(prompt, {
                ...options,
                model: 'gemini-4-hydrogen'
            });
        }
    }

    return generateSingleText(prompt, {
        ...options,
        model: 'gemini-4-hydrogen'
    });
}

async function* generateSingleTextStream(prompt: string, options: GenerationOptions): AsyncGenerator<string, void, unknown> {
    const maxOutputTokens = options.maxOutputTokens || 8192;
    const normalizedModel = normalizeClientModel(options.model);

    if (normalizedModel.startsWith('gemini')) {
        try {
            const response = await fetchWithRetry('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: normalizedModel,
                    contents: prompt,
                    temperature: options.temperature,
                    top_p: options.topP,
                    max_tokens: maxOutputTokens,
                    stream: true
                }),
                signal: options.signal
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(errorText || `Server Error: ${response.status}`);
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let yieldedAny = false;

            while (true) {
                if (options.signal?.aborted) {
                    reader.cancel();
                    break;
                }
                const { done, value } = await reader.read();
                if (done) break;

                const textChunk = decoder.decode(value, { stream: true });
                if (textChunk) {
                    yieldedAny = true;
                    yield textChunk;
                }
            }

            const tail = decoder.decode();
            if (tail) {
                yieldedAny = true;
                yield tail;
            }

            if (!yieldedAny && !options.signal?.aborted) {
                yield '⚠️ 模型未返回有效内容，请重试或切换其他模型。';
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'Aborted' || options.signal?.aborted) {
                return;
            }
            console.error('Error generating text stream with Gemini:', error);
            yield formatGeminiError(error.message || String(error));
        }
    } else if (normalizedModel.startsWith('qwen') || normalizedModel.startsWith('deepseek')) {
        const endpoint = '/api/deepseek';
        const effectiveMaxTokens = Math.min(maxOutputTokens, 65536);

        try {
            const response = await fetchWithRetry(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: normalizedModel,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful creative writing assistant. Write detailed, expansive, and high-quality content. Do not summarize unless asked. If the user asks for a long text, generate as much as possible within the token limit. Use Markdown headers (# ## ###) for structure.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: options.temperature,
                    top_p: options.topP,
                    max_tokens: effectiveMaxTokens,
                    stream: true
                }),
                signal: options.signal
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Server Error: ${response.status} ${errorText}`);
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let inThinkingBlock = false;
            let yieldedAny = false;

            while (true) {
                if (options.signal?.aborted) {
                    reader.cancel();
                    break;
                }
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const jsonStr = trimmed.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const json = JSON.parse(jsonStr);
                        const delta = json.choices?.[0]?.delta;
                        if (!delta) continue;

                        const content = delta.content;
                        if (content) {
                            if (content.includes('<think>')) {
                                inThinkingBlock = true;
                                const afterThink = content.split('<think>')[1];
                                if (afterThink && afterThink.includes('</think>')) {
                                    inThinkingBlock = false;
                                    const out = afterThink.split('</think>')[1];
                                    if (out) {
                                        yieldedAny = true;
                                        yield out;
                                    }
                                }
                                continue;
                            }
                            if (content.includes('</think>')) {
                                inThinkingBlock = false;
                                const out = content.split('</think>')[1];
                                if (out) {
                                    yieldedAny = true;
                                    yield out;
                                }
                                continue;
                            }

                            if (!inThinkingBlock) {
                                yieldedAny = true;
                                yield content;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk', e);
                    }
                }
            }

            if (!yieldedAny && !options.signal?.aborted) {
                throw new Error('Empty stream from provider');
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'Aborted' || options.signal?.aborted) return;
            console.warn(`Error generating text stream with ${normalizedModel}, falling back to Gemini 4 Hydrogen:`, error);
            yield* generateSingleTextStream(prompt, {
                ...options,
                model: 'gemini-4-hydrogen'
            });
        }
    } else {
        yield* generateSingleTextStream(prompt, {
            ...options,
            model: 'gemini-4-hydrogen'
        });
    }
}

export const generateText = async (prompt: string, options: GenerationOptions): Promise<string> => {
    const task = prepareStoryPrompt(prompt, options);
    const text = await generateSingleText(task.prompt, options);
    validateStoryResult(text, task.target);
    return text;
};

export const generateTextStream = async function* (
    prompt: string, options: GenerationOptions
): AsyncGenerator<string, void, unknown> {
    const task = prepareStoryPrompt(prompt, options);
    let text = '';
    // One request, one story. Never silently append another generation to reach a count.
    for await (const chunk of generateSingleTextStream(task.prompt, options)) {
        text += chunk;
        yield chunk;
    }
    if (!options.signal?.aborted) validateStoryResult(text, task.target);
};
