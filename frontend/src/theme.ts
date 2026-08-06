// 主题工具：日间(light) / 夜间(dark) / 均衡(warm) / 跟随系统(system)
export type ThemePref = 'light' | 'dark' | 'warm' | 'system'

const KEY = 'coagent-theme'

export function getThemePref(): ThemePref {
  return (localStorage.getItem(KEY) as ThemePref) || 'warm'
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' | 'warm' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}

// 启动时调用一次：应用保存的主题，并在 system 模式下监听系统亮暗变化
export function initTheme() {
  applyTheme(getThemePref())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}
