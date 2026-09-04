/** R-D S5：注册表镜像与两 resolver 守卫。
 *  双源同值三串：本文件与 backend tests/test_rd_s1_registry.py 各自钉住同值——语言不同无法
 *  共享文件，交接文档记录「双源同值」核对项（owner「换模型」演示=改后端 REGISTRY 一格+本镜像常量）。
 *  repo 无 jsdom（chatRouting.test 先例）：组件收敛用 ?raw 源级守卫钉住（无硬编码复活）。 */
import { describe, it, expect } from 'vitest'
import {
  MODEL_MAIN, MODEL_PRO, MODEL_ZEN_TEST, MODEL_ZEN_REVIEW, MODEL_REVIEW_SF,
  MODEL_GO_MAIN, MODEL_GO_REVIEW, MODEL_ZAI_MAIN, MODEL_ZAI_REVIEW,
  DEEPSEEK_BASE_URL, ZEN_BASE_URL, ZAI_BASE_URL, REGISTRY_MIRROR,
  resolveChatModel, resolveAuxCall,
} from './models'

const rawSelfCheck = import.meta.glob('./components/settings/selfCheck.ts', { query: '?raw', import: 'default', eager: true })
const rawCenter = import.meta.glob('./components/CenterPanel.tsx', { query: '?raw', import: 'default', eager: true })
const rawSpecial = import.meta.glob('./components/SpecialOutputPane.tsx', { query: '?raw', import: 'default', eager: true })
const SELF_CHECK_SRC = String(Object.values(rawSelfCheck)[0] ?? '')
const CENTER_SRC = String(Object.values(rawCenter)[0] ?? '')
const SPECIAL_SRC = String(Object.values(rawSpecial)[0] ?? '')

describe('REGISTRY_MIRROR 双源同值（与 backend tests/test_rd_s1_registry.py 镜像断言）', () => {
  it('四串实名同值：mimo-v2.5-free / big-pickle / deepseek-v4-flash-vision-exp / Qwen2.5-72B（RC4④）', () => {
    expect(MODEL_ZEN_TEST).toBe('mimo-v2.5-free')            // 双源同值①
    expect(MODEL_ZEN_REVIEW).toBe('big-pickle')              // 双源同值②
    expect(MODEL_MAIN).toBe('deepseek-v4-flash-vision-exp')  // 双源同值③
    expect(MODEL_REVIEW_SF).toBe('Qwen/Qwen2.5-72B-Instruct') // 双源同值④（RC4-S1 标准档判卷定值）
  })

  it('go 通道实名同值（S3/S6 实测校正）：glm-5.3-flash / qwen3.8-flash（zen go 计划小写 API ID）', () => {
    expect(MODEL_GO_MAIN).toBe('glm-5.3-flash')      // 双源同值⑤
    expect(MODEL_GO_REVIEW).toBe('qwen3.8-flash')    // 双源同值⑥
  })

  it('zai 通道实名同值（C1）：glm-4.7（官方文档 model 值，主审同模型=owner 拍板记忆机制专用）', () => {
    expect(MODEL_ZAI_MAIN).toBe('glm-4.7')           // 双源同值⑦
    expect(MODEL_ZAI_REVIEW).toBe('glm-4.7')         // 双源同值⑧（同模型自审）
  })

  it('矩阵语义（RC4-S1）：review 两档定值——standard=Qwen2.5-72B(SF 跨厂商)、test=big-pickle(zen)', () => {
    expect(REGISTRY_MIRROR.standard).toEqual({
      main: MODEL_MAIN, fast: MODEL_MAIN, vision: MODEL_MAIN, pro: MODEL_PRO,
      review: MODEL_REVIEW_SF, base_url: DEEPSEEK_BASE_URL,
    })
    expect(REGISTRY_MIRROR.test).toEqual({
      main: MODEL_ZEN_TEST, fast: MODEL_ZEN_TEST, vision: MODEL_ZEN_TEST,
      review: MODEL_ZEN_REVIEW, base_url: ZEN_BASE_URL,
    })
  })

  it('矩阵语义（S3）：go 档定值——main/fast/vision=GLM-5.3-Flash、review=Qwen3.8 Flash、base_url 动态留空', () => {
    expect(REGISTRY_MIRROR.go).toEqual({
      main: MODEL_GO_MAIN, fast: MODEL_GO_MAIN, vision: MODEL_GO_MAIN,
      review: MODEL_GO_REVIEW, base_url: '',
    })
  })

  it('矩阵语义（C1）：zai 档定值——全角色 glm-4.7（主审同模型）、base_url=bigmodel 官方端点', () => {
    expect(REGISTRY_MIRROR.zai).toEqual({
      main: MODEL_ZAI_MAIN, fast: MODEL_ZAI_MAIN, vision: MODEL_ZAI_MAIN,
      review: MODEL_ZAI_REVIEW, base_url: ZAI_BASE_URL,
    })
  })
})

describe('resolveChatModel（RA3-S1 签名保留，实现入镜像）', () => {
  it('chat 态：杂值/空钉死 MODEL_MAIN（镜像引用，非本地字面量）', () => {
    expect(resolveChatModel('deepseek', 'Qwen/Qwen2.5-72B-Instruct')).toBe(MODEL_MAIN)
    expect(resolveChatModel('deepseek', '')).toBe(MODEL_MAIN)
    expect(resolveChatModel('zhipu', 'glm-4-flash')).toBe(MODEL_MAIN)   // C2：存量杂值回落标准档钉死（zhipu 遗留已清除）
  })

  it('alias 迁移映射保留 + zen 态透传/显示名兜底（既有行为零变化）', () => {
    expect(resolveChatModel('deepseek', 'deepseek-chat')).toBe('deepseek-v4-pro')
    expect(resolveChatModel('deepseek', 'deepseek-flash')).toBe(MODEL_MAIN)
    expect(resolveChatModel('zen', 'Big Pickle')).toBe('Big Pickle')
    expect(resolveChatModel('zen', '')).toBe('mimo-V2.5 Free')
  })
})

describe('resolveAuxCall（R-D S5 新缝：资源生成/上传链辅助调用）', () => {
  it('standard 态：DeepSeek 端点+MODEL_MAIN——镜像同源（C2：zhipu 遗留清除，未知 provider 同款回落）', () => {
    expect(resolveAuxCall('deepseek', '', '', '')).toEqual({ base_url: DEEPSEEK_BASE_URL, model: MODEL_MAIN })
    expect(resolveAuxCall('zhipu', '', '', '')).toEqual({ base_url: DEEPSEEK_BASE_URL, model: MODEL_MAIN })
  })

  it('test(zen) 态：Zen 端点+mimo；zenBaseUrl 空回落 DeepSeek 端点（RA-S5 既有语义）', () => {
    expect(resolveAuxCall('zen', 'https://opencode.ai/zen/v1', '', ''))
      .toEqual({ base_url: 'https://opencode.ai/zen/v1', model: MODEL_ZEN_TEST })
    expect(resolveAuxCall('zen', '', '', '')).toEqual({ base_url: DEEPSEEK_BASE_URL, model: MODEL_ZEN_TEST })
  })

  it('go 态（S3）：go 网关端点+GLM-5.3-Flash；goBaseUrl 空同款回落 DeepSeek 端点', () => {
    expect(resolveAuxCall('go', '', 'https://gw.example.com/v1', ''))
      .toEqual({ base_url: 'https://gw.example.com/v1', model: MODEL_GO_MAIN })
    expect(resolveAuxCall('go', '', '', '')).toEqual({ base_url: DEEPSEEK_BASE_URL, model: MODEL_GO_MAIN })
  })

  it('zai 态（C1）：bigmodel 官方端点+glm-4.7；zaiBaseUrl 空同款回落 DeepSeek 端点', () => {
    expect(resolveAuxCall('zai', '', '', 'https://open.bigmodel.cn/api/paas/v4'))
      .toEqual({ base_url: 'https://open.bigmodel.cn/api/paas/v4', model: MODEL_ZAI_MAIN })
    expect(resolveAuxCall('zai', '', '', '')).toEqual({ base_url: DEEPSEEK_BASE_URL, model: MODEL_ZAI_MAIN })
  })
})

describe('源级收敛守卫（无 jsdom：消费端不得复活本地模型名/端点硬编码）', () => {
  it('selfCheck.ts 缺省主模型名改从 models.ts 导入（字面量删除）', () => {
    expect(SELF_CHECK_SRC).toContain("from '../../models'")
    expect(SELF_CHECK_SRC).not.toContain("'deepseek-v4-flash-vision-exp'")
  })

  it('CenterPanel/SpecialOutputPane 资源生成改走 resolveAuxCall（zhipu 二值硬编码删除）', () => {
    for (const src of [CENTER_SRC, SPECIAL_SRC]) {
      expect(src).toContain('resolveAuxCall(')
      expect(src).not.toContain("prov === 'zhipu' ?")
      expect(src).not.toContain("'deepseek-v4-flash-vision-exp'")
    }
  })
})
