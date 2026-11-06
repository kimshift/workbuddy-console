/**
 * PM2 部署配置
 *
 * 用法：
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs workbuddy-console
 *   pm2 restart workbuddy-console
 *   pm2 save
 *
 * 为什么是 .cjs：package.json 里是 "type": "module"，.js 会被当成 ESM 加载，
 * 而 pm2 只认识 CommonJS 的 module.exports。
 */
const path = require('node:path');

const ROOT = __dirname;

/**
 * Node 解释器：必须 >= 22.5（node:sqlite）。
 *
 * pm2 启动子进程时用的是守护进程自己继承的 PATH，不一定是 mise/nvm 解析出来的
 * 那个版本 —— 实测这台机器上默认拿到的是 v14.18.1，服务会直接崩。
 * 所以这里给绝对路径；换机器/换版本时改这一行，或用 PM2_NODE_BIN 覆盖。
 *
 * 也可以设成 'node'，但那样就等于把 node 版本押在 PATH 上，不建议。
 */
function resolveNodeBin() {
  if (process.env.PM2_NODE_BIN) return process.env.PM2_NODE_BIN;
  // 优先跟随项目 mise.toml 里钉住的版本，避免和仓库约定的版本漂移
  try {
    const found = require('node:child_process')
      .execSync('mise which node', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
    if (found) return found;
  } catch {
    /* 没装 mise：回落到 PATH 上的 node */
  }
  return 'node';
}

const NODE_BIN = resolveNodeBin();

module.exports = {
  apps: [
    {
      name: 'workbuddy-console',
      script: path.join(ROOT, 'server', 'index.mjs'),
      cwd: ROOT,
      interpreter: NODE_BIN,
      // --use-system-ca：企业代理环境出站 HTTPS 需要（同 启动控制台（通用）.cmd）
      // --max-old-space-size：冷启动要遍历全部会话日志算统计，堆给足
      node_args: '--max-old-space-size=4096 --use-system-ca',
      env: {
        PORT: 57911,
        // 服务默认会自己开浏览器；pm2 下是后台常驻，不需要
        NO_OPEN: '1',
      },
      autorestart: true,
      // 端口被占时 server/index.mjs 会主动 process.exit(0)（见其 EADDRINUSE 处理），
      // 不认这个码的话 pm2 会把它当成异常崩溃无限重启
      stop_exit_codes: [0],
      max_restarts: 10,
      // 冷启动扫描会话日志 + 模型探测会短时吃内存，给宽一点
      max_memory_restart: '1G',
      time: true,
      merge_logs: true,
    },
  ],
};
