/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WECHAT_DEFAULT_APPID?: string
  readonly VITE_BUILD_SANDBOX_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
