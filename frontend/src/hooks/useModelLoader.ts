/**
 * hooks/useModelLoader.ts — 模型加载/卸载业务编排
 *
 * 职责 (hook 层 — 业务编排):
 * - 把"调 API + 更新 store + 弹 toast"封装成 loadModel / unloadModel 两个回调
 * - 给 UI 组件 (settings/ModelSelector) 一个无脑可用的接口
 *
 * 状态机 (与 stores/modelStore.ts ModelStatus 对齐):
 *   loadModel(id):
 *     idle/error/ready → setStatus('loading') → call api.loadModel
 *       成功 → setModel(id, device) + setVramUsage(vram) + status='ready'
 *              + toast.success('模型已加载 · X')
 *       失败 → setError(message) + status='error' + toast.error(message)
 *   unloadModel():
 *     ready → call api.unloadModel
 *       成功 → reset (回到 idle) + toast.info('模型已卸载')
 *       失败 → setError(message) + toast.error(message)
 *
 * 不做:
 * - 不 import 其他 store (CLAUDE.md: hook 可以读写多个 store, 但不要把多个
 *   store 的逻辑揉在一个 hook; 这里只动 modelStore)
 * - 不渲染 UI
 *
 * 设计:
 * - 主体抽成纯 async 函数 ``loadModelLogic`` / ``unloadModelLogic``, 可单测
 * - hook 本身 useCallback 包一层, 让组件 ref 稳定
 * - 失败路径**永远不抛**, 错误已经走 store + toast, 调用方不需要 try/catch
 */

import { useCallback } from 'react'
import {
  ApiError,
  apiClient as defaultApiClient,
  type ApiClient,
} from '../services/api'
import { toast as defaultToast } from '../services/toast'
import { useModelStore, type ModelStore } from '../stores/modelStore'

// ── 注入点类型 ──────────────────────────────────────────────────────────────
//
// 把 toast / store 抽成 interface 而不是直接 import 单例,
// 是为了让 logic 函数可以无 React 单测 — 测试里传 mock 即可.

/** modelStore 的 setter 子集 — 只取 logic 用到的, 不包含 getState */
type ModelStoreSetters = Pick<
  ModelStore,
  | 'setStatus'
  | 'setModel'
  | 'setVramUsage'
  | 'setError'
  | 'reset'
>

/** toast 服务的子集 — 只取 logic 用到的方法 */
interface ToastLike {
  success: (text: string) => void
  info: (text: string) => void
  error: (text: string) => void
}

// ── 纯 async 逻辑 ──────────────────────────────────────────────────────────

/**
 * 加载指定模型. 不抛异常 — 失败路径已写 store + toast.
 *
 * 注意: 这里不读 store 的"当前 status", 因为重复加载同一个模型也是合法的
 * (用户可能想强制 reload), 由调用方决定是否拦截.
 *
 * @param client    API 客户端
 * @param store     modelStore setter 子集
 * @param toast     toast 服务
 * @param modelId   要加载的模型 ID, 例如 "depth-anything-v2-small"
 * @returns         成功 true / 失败 false (主要给测试用)
 */
export async function loadModelLogic(
  client: ApiClient,
  store: ModelStoreSetters,
  toast: ToastLike,
  modelId: string
): Promise<boolean> {
  store.setStatus('loading')

  try {
    const resp = await client.loadModel(modelId)
    // 后端可能返回 status='error' 配合 200 — 防御性检查
    if (resp.status === 'error') {
      const msg = `模型加载失败 (${modelId})`
      store.setError(msg)
      toast.error(msg)
      return false
    }

    store.setModel(resp.model_id, resp.device)
    // CPU 模式后端返回 vram_used_mb: null, store 字段是 number, 用 0 占位
    store.setVramUsage(resp.vram_used_mb ?? 0)
    toast.success(`模型已加载 · ${resp.model_id}`)
    return true
  } catch (err) {
    const message =
      err instanceof ApiError ? err.userMessage : '模型加载失败 · 未知错误'
    store.setError(message)
    toast.error(message)
    return false
  }
}

/**
 * 卸载当前模型, 释放显存. 不抛异常.
 *
 * - 成功 → reset (回到 idle, currentModel=null, vramUsage=0)
 *   并 toast.info('模型已卸载')
 * - 失败 → setError + toast.error
 *
 * 注意: 即使后端报错, 前端 store 也保持原状态 — 不强制 reset, 因为后端可能
 * 还残留模型实例, 错误状态告诉用户"卸载失败, 模型可能还在".
 */
export async function unloadModelLogic(
  client: ApiClient,
  store: ModelStoreSetters,
  toast: ToastLike
): Promise<boolean> {
  try {
    await client.unloadModel()
    store.reset()
    toast.info('模型已卸载')
    return true
  } catch (err) {
    const message =
      err instanceof ApiError ? err.userMessage : '模型卸载失败 · 未知错误'
    store.setError(message)
    toast.error(message)
    return false
  }
}

// ── React Hook ──────────────────────────────────────────────────────────────

export interface UseModelLoaderApi {
  /** 加载模型, 永不抛, 调用方不需要 try/catch */
  loadModel: (modelId: string) => Promise<boolean>
  /** 卸载当前模型, 永不抛 */
  unloadModel: () => Promise<boolean>
}

/**
 * 模型加载器 hook. 通常用在 settings/ModelSelector 组件里:
 *
 * @example
 *   const { loadModel } = useModelLoader()
 *   <button onClick={() => loadModel('depth-anything-v2-small')}>Small</button>
 */
export function useModelLoader(options: {
  client?: ApiClient
  toast?: ToastLike
} = {}): UseModelLoaderApi {
  const client = options.client ?? defaultApiClient
  const toast = options.toast ?? defaultToast

  const loadModel = useCallback(
    (modelId: string) =>
      loadModelLogic(client, useModelStore.getState(), toast, modelId),
    [client, toast]
  )

  const unloadModel = useCallback(
    () => unloadModelLogic(client, useModelStore.getState(), toast),
    [client, toast]
  )

  return { loadModel, unloadModel }
}
