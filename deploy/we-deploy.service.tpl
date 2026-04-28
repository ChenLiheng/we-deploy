# systemd 单元模板，由 deploy/install.sh 替换占位符后生成 /etc/systemd/system/we-deploy.service
# 占位符：
#   @INSTALL_DIR@  —— 项目安装目录（例如 /opt/we-deploy）
#   @DATA_DIR@     —— 数据持久化目录（数据库 / 沙盒 / 二维码）
#   @SERVICE_USER@ —— 运行进程的 Linux 用户
#   @PORT@         —— 后端监听端口

[Unit]
Description=WeDeploy 后端 API 服务
Documentation=https://github.com/your-org/we-deploy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=@SERVICE_USER@
Group=@SERVICE_USER@
WorkingDirectory=@INSTALL_DIR@/server

Environment=NODE_ENV=production
Environment=PORT=@PORT@
Environment=HOST=0.0.0.0
Environment=DB_PATH=@DATA_DIR@/we-deploy.db
Environment=SANDBOX_BASE=@DATA_DIR@/sandbox
Environment=QRCODE_BASE=@DATA_DIR@/qrcodes

ExecStart=/usr/bin/node @INSTALL_DIR@/server/dist/index.js

# 异常退出后 5 秒自动重启
Restart=on-failure
RestartSec=5

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=@DATA_DIR@

# 限制资源（按需调整）
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
