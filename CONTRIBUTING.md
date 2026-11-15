# 贡献指南

感谢你愿意为 **WeDeploy** 做出贡献！本文档帮助你快速上手开发流程与规范。

---

## 上手开发

```bash
# 1. fork 仓库后克隆到本地
git clone git@github.com:<your-fork>/we-deploy.git
cd we-deploy

# 2. 安装依赖（前端 + 后端）
pnpm install
pnpm --dir server install

# 3. 同时启动前后端
pnpm dev:all
# 或分开启动
pnpm dev          # 前端 vite
pnpm dev:server   # 后端 tsx watch
```

默认访问：

- 前端：http://localhost:5173
- 后端：http://localhost:8080
- 初始管理员：`admin`，密码打印在后端首次启动日志中（或用 `INITIAL_ADMIN_PASSWORD` 指定）

## 项目结构

```text
we-deploy/
├─ src/                      # 前端 React 源码
│  ├─ components/            # 业务组件（按页面/功能分组）
│  ├─ services/              # 与后端通信、业务封装
│  ├─ stores/                # zustand 状态管理
│  ├─ router/                # 路由配置
│  └─ types/                 # 全局 TypeScript 类型
├─ server/                   # 后端 Node.js + Express
│  └─ src/
│     ├─ db/                 # SQLite 初始化
│     ├─ middleware/         # 通用中间件
│     ├─ routes/             # REST API 路由
│     ├─ services/           # 业务服务（构建任务等）
│     └─ utils/              # 通用工具（git 凭证等）
├─ deploy/                   # 部署脚本与模板
├─ Dockerfile                # 多阶段构建
├─ docker-compose.yml        # 一键启动编排
└─ README.md
```

## 编码规范

- **TypeScript 优先**：新代码必须使用 TypeScript，避免 `any`。
- **格式化**：提交前请运行 `pnpm format`（Prettier）和 `pnpm lint`（ESLint --fix）。
- **类型检查**：`pnpm type-check` 必须通过。
- **注释语言**：注释统一使用中文 UTF-8。
- **命名约定**：
  - 组件 / 类：`PascalCase`
  - 普通函数 / 变量：`camelCase`
  - 常量 / 环境变量：`UPPER_SNAKE_CASE`
  - 文件：与默认导出保持一致
- **不引入下划线属性 / 全局污染**。
- **后端**：
  - 路由文件按业务领域拆分到 `routes/`，每个文件只导出一个 Router。
  - 副作用（数据库写入 / 子进程）只在 `services/` 中发生。
- **前端**：
  - 业务逻辑封装到自定义 hook / store，避免组件内大段副作用。
  - 共用 UI（Tag / Empty / Card）抽到独立组件。

## 提交规范

请使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <subject>
```

`type` 常用值：

- `feat`：新功能
- `fix`：bug 修复
- `docs`：仅文档
- `refactor`：重构（无功能变化）
- `perf`：性能优化
- `style`：代码格式调整
- `test`：测试相关
- `build`：构建脚本 / 依赖变更
- `ci`：CI 配置
- `chore`：其它杂项

示例：

```
feat(builds): 支持构建任务取消
fix(git): 修复 GitLab Token URL 拼装错误
docs(readme): 增加裸机部署章节
```

## Pull Request 流程

1. 从 `main` 分支拉出特性分支：`git checkout -b feat/xxx`。
2. 完成开发并自测，确保：
   - `pnpm type-check` 通过
   - `pnpm lint` 通过
   - 功能可用，不破坏现有页面
3. 提交时建议每个逻辑步骤一次提交，方便 review。
4. 在 PR 描述中说明：
   - **背景**：为什么做这个改动
   - **方案**：核心思路
   - **影响范围**：是否引入破坏性变更
   - **截图**（前端改动）

PR 标题同样建议使用 Conventional Commits 格式。

## 报告 Bug

请在 issue 中尽量包含：

- 操作步骤、期望与实际
- 浏览器 / Node 版本
- 是否可在 docker 默认镜像下复现
- 关键日志（脱敏后）

## 安全策略

涉及凭证、提权或代码执行类问题，请通过私下邮件而非公开 issue 反馈。
