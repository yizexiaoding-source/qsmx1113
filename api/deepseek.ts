export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const body = await request.json();
    const apiKey = process.env.DASHSCOPE_API_KEY;

    const baseURL = process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/$/, "");
    if (!apiKey || !baseURL) {
      return new Response(JSON.stringify({ error: "请配置 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const endpoint = new URL(baseURL);
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".aliyuncs.com") || !endpoint.pathname.endsWith("/compatible-mode/v1")) {
      return Response.json({ error: "百炼接口地址配置不正确" }, { status: 503 });
    }

    const safeBody = {
      ...body,
      model: body.model === "qwen3.8-flash" ? "qwen3.8-flash" : "deepseek-v4.1-flash-1017",
      enable_thinking: body.model === "deepseek-reasoner",
      max_tokens: typeof body.max_tokens === "number" ? Math.max(1, Math.min(Math.floor(body.max_tokens), 65536)) : body.max_tokens,
    };

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      body: JSON.stringify(safeBody),
      signal: AbortSignal.timeout(50000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      return new Response(JSON.stringify({ error: `百炼调用失败（${response.status}），请核对密钥、模型权限和额度` }), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "百炼请求失败，请检查配置或稍后重试" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
