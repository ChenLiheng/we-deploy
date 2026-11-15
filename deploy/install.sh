#!/usr/bin/env bash
# ------------------------------------------------------------------
# WeDeploy 裸机一键部署脚本（适用于 Ubuntu / Debian / CentOS / RHEL）
# ------------------------------------------------------------------
# 该脚本会做以下事情：
#   1) 安装 Node.js 20（若未安装）
#   2) 安装 pnpm / git
#   3) 在 ${INSTALL_DIR} 下安装/更新 WeDeploy（默认 /opt/we-deploy）
#   4) 构建前端（dist/）和后端（server/dist/）
#   5) 注册 systemd 服务 we-deploy.service 并启动
#   6) 输出可直接拷贝到 /etc/nginx/conf.d/ 的反代示例配置
#
# 使用：
#   sudo bash deploy/install.sh
# 或自定义目录：
#   sudo INSTALL_DIR=/srv/we-deploy DATA_DIR=/srv/we-deploy/data bash deploy/install.sh
# ------------------------------------------------------------------

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/we-deploy}"
DATA_DIR="${DATA_DIR:-${INSTALL_DIR}/data}"
SERVICE_USER="${SERVICE_USER:-we-deploy}"
NODE_VERSION="${NODE_VERSION:-20}"
PORT="${PORT:-8080}"

log() { printf "\033[1;32m[install]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[install:err]\033[0m %s\n" "$*" >&2; }

# 必须 root 才能写 /opt 和注册 systemd
if [[ $EUID -ne 0 ]]; then
  err "请使用 root 权限运行：sudo bash $0"
  exit 1
fi

# ---------- 1. 安装系统依赖 ----------
install_deps() {
  log "检查系统依赖..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y --no-install-recommends curl git ca-certificates build-essential python3
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl git ca-certificates gcc-c++ make python3
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl git ca-certificates gcc-c++ make python3
  else
    err "未识别的包管理器，请手动安装 curl/git/build-essential 后重试"
    exit 1
  fi
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local current
    current=$(node -v | sed 's/^v//;s/\..*//')
    if [[ "${current}" -ge "${NODE_VERSION}" ]]; then
      log "检测到 node v$(node -v)，跳过安装"
      return
    fi
  fi
  log "安装 Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" -o /tmp/setup_node.sh \
    || { err "下载 NodeSource 安装脚本失败"; exit 1; }
  bash /tmp/setup_node.sh
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y nodejs
  else
    yum install -y nodejs || dnf install -y nodejs
  fi
}

install_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "通过 corepack 启用 pnpm..."
    corepack enable
    corepack prepare pnpm@latest --activate
  fi
}

# ---------- 2. 创建系统用户 ----------
ensure_user() {
  if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
    log "创建运行用户 ${SERVICE_USER}"
    useradd --system --create-home --shell /bin/bash "${SERVICE_USER}"
  fi
}

# ---------- 3. 同步源码到 INSTALL_DIR ----------
sync_source() {
  log "同步源码到 ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}"
  # 当前脚本所在目录的上级 = 项目根
  local repo_root
  repo_root="$(cd "$(dirname "$0")/.." && pwd)"
  # 用 rsync 排除 node_modules / dist / .git，保留源码 + lock
  rsync -a \
    --exclude='node_modules/' \
    --exclude='**/node_modules/' \
    --exclude='dist/' \
    --exclude='**/dist/' \
    --exclude='.git/' \
    --exclude='data/' \
    --exclude='*.log' \
    "${repo_root}/" "${INSTALL_DIR}/"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
}

# ---------- 4. 构建项目 ----------
build_project() {
  log "构建前端 + 后端"
  sudo -u "${SERVICE_USER}" bash -lc "
    set -e
    cd '${INSTALL_DIR}'
    pnpm install --frozen-lockfile
    pnpm run build
    cd server
    pnpm install --frozen-lockfile
    pnpm run build
  "
}

# ---------- 5. 安装 systemd 单元 ----------
install_service() {
  # 生产环境必需的密钥：首次安装时随机生成并保存到 ${DATA_DIR}/we-deploy.env（仅 root 可读写），
  # 重复执行脚本不会覆盖，避免已加密的 Token / 私钥无法解密
  local env_file="${DATA_DIR}/we-deploy.env"
  if [[ ! -f "${env_file}" ]]; then
    log "生成密钥文件 ${env_file}"
    mkdir -p "${DATA_DIR}"
    umask 077
    cat >"${env_file}" <<ENVEOF
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
APP_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENVEOF
    chmod 600 "${env_file}"
  fi

  log "注册 systemd 服务"
  sed \
    -e "s|@INSTALL_DIR@|${INSTALL_DIR}|g" \
    -e "s|@DATA_DIR@|${DATA_DIR}|g" \
    -e "s|@SERVICE_USER@|${SERVICE_USER}|g" \
    -e "s|@PORT@|${PORT}|g" \
    "${INSTALL_DIR}/deploy/we-deploy.service.tpl" >/etc/systemd/system/we-deploy.service

  systemctl daemon-reload
  systemctl enable we-deploy.service
  systemctl restart we-deploy.service
  sleep 2
  systemctl --no-pager status we-deploy.service || true
}

# ---------- 6. 输出 nginx 提示 ----------
print_nginx_hint() {
  cat <<EOF

\033[1;32m[install]\033[0m WeDeploy 已部署完成 ✓
- 安装目录:  ${INSTALL_DIR}
- 数据目录:  ${DATA_DIR}
- 后端端口:  ${PORT}
- 服务名:    we-deploy.service

下一步：在宿主机 nginx 上为 WeDeploy 配置反代，可参考：
  ${INSTALL_DIR}/deploy/nginx.conf.example

调试常用命令：
  systemctl status  we-deploy
  journalctl -u we-deploy -f
  systemctl restart we-deploy

初始管理员账号：admin，初始密码打印在首次启动日志中：
  journalctl -u we-deploy | grep "Initial admin password"
登录后请在右上角「修改密码」中立即修改。
密钥文件：${DATA_DIR}/we-deploy.env（请妥善备份，丢失后已保存的 Token / 私钥将无法解密）
EOF
}

main() {
  install_deps
  install_node
  install_pnpm
  ensure_user
  sync_source
  build_project
  install_service
  print_nginx_hint
}

main "$@"
