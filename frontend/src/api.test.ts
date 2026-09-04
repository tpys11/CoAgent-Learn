import { describe, it, expect, vi, afterEach } from 'vitest'
import { api } from './api'

/** RA5-S2：Zen key 专用保存通道（红先行）。
 *  E-40 教训：owner 反馈①「key 无法保存」真根因=dev 容器跑旧后端不认 zen_api_key——
 *  通用 saveSettings(body: unknown) 是黑盒入口，字段存活靠调用方约定，未来表单保存路径
 *  再丢字段时无守卫可红。专用通道把「该请求只发 zen_api_key」钉在类型签名+本守卫上。
 *  repo 无 jsdom（serviceSettingsZen.test.ts 头注先例）：组件侧用源级守卫。 */
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RA5-S2 api.saveZenKey 专用通道——PUT 体契约', () => {
  it('构造正确 PUT 体：只发 { zen_api_key } 到 /api/settings（fetch 桩实测）', async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', msg: '配置已保存并即时生效' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await api.saveZenKey('sk-zen-test-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    if (!init) throw new Error('fetch 未收到 RequestInit')
    expect(path).toBe('/api/settings')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ zen_api_key: 'sk-zen-test-123' })
  })
})

describe('RA5-S2 saveZenKey 处理器改调专用通道——源级守卫', () => {
  const rawModules = import.meta.glob('./components/settings/ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
  const SRC = String(Object.values(rawModules)[0] ?? '')

  it('saveZenKey 处理器消费 api.saveZenKey（专用通道被真实调用；C3 修正后 Key 输入框恢复）', () => {
    expect(SRC).toContain('api.saveZenKey(')
  })

  it('通用入口不再直发 zen_api_key（旧写法根因行禁复活）', () => {
    expect(SRC).not.toContain('saveSettings({ zen_api_key')
  })
})
