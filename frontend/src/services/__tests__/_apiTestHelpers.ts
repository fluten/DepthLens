/**
 * _apiTestHelpers.ts — api.test 系列共享的 fetch mock 助手
 *
 * 下划线前缀表示这不是一个独立的测试文件 (vitest include 模式只匹配
 * `*.test.ts`, 这里 .ts 不带 .test 不会被作为测试入口运行).
 */

/** 构造一个 200 OK 的 fetch 响应 */
export function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 构造一个错误响应 (后端 ErrorResponse 形态) */
export function errorResponse(
  status: number,
  errorClass: string,
  message: string
): Response {
  return new Response(JSON.stringify({ error: errorClass, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 构造一个非 JSON 响应 (例如 nginx 默认 HTML 错误页) */
export function htmlErrorResponse(status: number): Response {
  return new Response('<html>500 Internal</html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  })
}
