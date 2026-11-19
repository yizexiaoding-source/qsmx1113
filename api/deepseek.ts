import { deepseekStream } from '../lib/deepseekStream';

export const config = {
  runtime: "edge",
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sanitizeUpstreamError(status: number, rawBody: string): string {
  let detail = '';
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message || parsed?.message || (typeof parsed?.error === 'string' ? parsed.error : '');
    if (typeof msg === 'string') {
      detail = msg.replace(/https?:\/\/\S+/gi, '').trim().slice(0, 140);
    }
  } catch {
    // ignore non-JSON body
  }
  return detail
    ? `百炼调用失败（${status}）：${detail}`
    : `百炼调用失败（${status}），请核对密钥、模型权限和额度`;
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const apiKey = process.env.DASHSCOPE_API_KEY;

    const baseURL = process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/$/, "");
    if (!apiKey || !baseURL) {
      return new Response(JSON.stringify({ error: "请配置 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const endpoint = new URL(baseURL);
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".aliyuncs.com") || !endpoint.pathname.endsWith("/compatible-mode/v1")) {
      return Response.json({ error: "百炼接口地址配置不正确" }, { status: 503 });
    }

    const isStream = Boolean(body.stream);
    const safeBody = {
      ...body,
      model: body.model === "qwen3.8-flash" ? "qwen3.8-flash" : "deepseek-v4.1-flash-1017",
      enable_thinking: body.model === "deepseek-reasoner",
      max_tokens: typeof body.max_tokens === "number" ? Math.max(1, Math.min(Math.floor(body.max_tokens), 65536)) : body.max_tokens,
    };

    let response: Response | null = null;
    let upstreamController = new AbortController();
    let lastFetchErr: any = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      upstreamController = new AbortController();
      const connectTimer = setTimeout(() => upstreamController.abort(), 45000);
      try {
        response = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "Accept": isStream ? "text/event-stream" : "application/json",
          },
          body: JSON.stringify(safeBody),
          signal: upstreamController.signal,
        });
        clearTimeout(connectTimer);
        if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 1) {
          break;
        }
        await response.body?.cancel();
      } catch (err: any) {
        clearTimeout(connectTimer);
        lastFetchErr = err;
        if (attempt === 1) throw err;
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    if (!response) {
      throw lastFetchErr || new Error("百炼上游连接失败");
    }

    if (!response.ok) {
      const errRaw = await response.text().catch(() => "");
      return new Response(JSON.stringify({ error: sanitizeUpstreamError(response.status, errRaw) }), {
        status: response.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (isStream && response.body) {
      const readable = deepseekStream(response.body, () => upstreamController.abort());
      return new Response(readable, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Model-Used": safeBody.model,
        },
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error: any) {
    const msg = error?.name === "AbortError"
      ? "百炼连接超时，请检查网络或稍后重试"
      : "百炼请求失败，请检查配置或稍后重试";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
