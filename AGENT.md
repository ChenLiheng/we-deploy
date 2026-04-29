# AGENT.md

本文件用于指导 AI/自动化代理在 `we-deploy` 仓库内稳定、高质量地工作。

## 1. 项目定位

`WeDeploy` 是一个微信小程序自动化构建与发布平台，核心链路：

1. 读取项目/迭代配置
2. 克隆代码（支持 Token/SSH）
3. 安装依赖、执行可选编译命令
4. 调用 `miniprogram-ci` 上传或预览
5. 实时输出日志（SSE + DB 持久化）
6. 清理沙盒代码并归档构建记录

## 2. 技术栈与目录约定

- 前端：React + Vite + Antd + Zustand
- 后端：Express + TypeScript + better-sqlite3 + simple-git + miniprogram-ci
- 主要目录：
  - `src/`：前端页面/组件/store
  - `server/src/routes/`：后端路由层
  - `server/src/services/`：构建、事件、清理等核心业务
  - `server/src/db/`：数据库初始化与 schema
  - `deploy/`：systemd/nginx/安装脚本

## 3. 本地开发与验证命令

- 前后端联调：`pnpm dev:all`
- 前端类型检查：`pnpm type-check`
- 后端类型检查：`pnpm --dir server type-check`
- 前端构建：`pnpm build`
- 后端构建：`pnpm --dir server build`

改动后至少执行受影响端的 type-check；涉及构建链路时建议前后端都跑一遍。

## 4. 修改优先级与边界

1. **优先满足当前需求**，避免顺手改动无关功能。
2. **保持现有链路兼容**，尤其是：
   - 迭代分支优先于项目默认分支
   - 构建日志实时可见（SSE）且可回放（DB）
   - 构建结束后清理临时目录
3. 如必须调整公共行为，先保证现有 API 兼容，再做增量扩展。

## 5. 构建链路关键约束（高优先级）

### 5.1 分支与认证

- 构建时必须使用“调用方传入分支 > 项目默认分支 > main”的优先级。
- 所有对外日志中的仓库地址必须脱敏，禁止泄露 token。

### 5.2 miniprogram-ci 临时目录

- `miniprogram-ci` 会在 `process.cwd()` 写入临时/缓存目录。
- 统一通过 `runMiniProgramCiInScratch` 执行 CI 段，工作目录落在 `/tmp`（可由 `CI_PROC_CWD` 覆盖）。
- 不要直接在普通业务流程里随意 `process.chdir`。

### 5.3 日志链路

- 日志写入统一入口：先入库 `build_logs`，再事件推送。
- 前端优先 SSE，异常时可降级轮询。
- 日志接口支持增量（`since`）拉取，避免全量轮询造成超时。

### 5.4 清理与保留

- 构建/预览完成后清理沙盒代码目录（`SANDBOX_BASE`）。
- 构建记录与日志按保留策略清理（`LOG_RETENTION_DAYS`，默认 30 天，`0` 为关闭）。

## 6. 数据库与后端改动规则

1. 修改 schema 时，优先采用向后兼容方式（新增字段/索引优先）。
2. `builds` 与 `build_logs` 的关联清理要考虑外键级联与引用完整性（例如迭代 `build_id`）。
3. 运行状态字段（如 `pending/cloning/installing/building/uploading/success/failed`）变更要保持前后端一致。

## 7. 前端改动规则

1. 表格页面需考虑窄屏与长文本，避免内容挤压（必要时启用横向滚动与列宽策略）。
2. 构建日志类组件优先复用 `buildConsoleStore` 的连接与状态能力，不重复造轮子。
3. 与构建状态相关的 UI 文案/颜色需覆盖完整状态枚举，避免 `undefined` 映射报错。

## 8. 安全与配置

- 严禁提交密钥、token、私钥文件、真实生产凭证。
- `.env.example` 只放示例值，不放真实值。
- 新增环境变量时，同步更新：
  1. `.env.example`
  2. `README.md`（环境变量说明）
  3. 部署模板（如 `docker-compose.yml`、`deploy/we-deploy.service.tpl`，若适用）

## 9. 提交规范

- 提交信息建议使用 Conventional Commits（如 `feat:` / `fix:` / `refactor:` / `docs:`）。
- 一次提交聚焦一个主题，避免混入无关重构。
- 提交前确认：
  - 受影响端 type-check 通过
  - 无明显调试残留（临时日志、注释、无用文件）

## 10. 典型任务建议流程

1. 先定位链路入口（路由 -> service -> store/UI）。
2. 小步修改，优先保证现有行为不回归。
3. 跑类型检查与必要构建验证。
4. 更新文档与配置说明（如果有新增变量/行为）。
5. 最后给出变更摘要与验证结果。

---

如与用户明确要求冲突，以用户要求为最高优先级；其余按本文件执行。
