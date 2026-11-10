import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
let port = Number(process.env.PORT ?? 3000);
const withTunnel = !process.argv.includes("--no-tunnel");
const forceAi = process.argv.includes("--ai");
const authUser = process.env.DEMO_AUTH_USER ?? "demo";
const demoPassword = process.env.DEMO_PASSWORD ?? randomBytes(4).toString("hex");
const basicAuth = process.env.DEMO_BASIC_AUTH ?? `${authUser}:${demoPassword}`;
const children = [];
let startedServer = false;

function log(message) {
  console.log(`[SalesDeck] ${message}`);
}

function stop(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

async function probeHealth(target = port) {
  try {
    const response = await fetch(`http://127.0.0.1:${target}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function servesApp(target = port) {
  try {
    const response = await fetch(`http://127.0.0.1:${target}/`, { signal: AbortSignal.timeout(1500) });
    const type = response.headers.get("content-type") ?? "";
    return response.ok && type.includes("text/html");
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await probeHealth()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  const reuse = process.argv.includes("--reuse") && (await probeHealth()) && (await servesApp());
  if (!reuse && (await probeHealth())) {
    let candidate = 3200;
    while (await probeHealth(candidate)) candidate++;
    log(`端口 ${port} 已被占用，改用 ${candidate}（需要复用请加 --reuse）`);
    port = candidate;
  }

  if (!reuse) {
    if (!fs.existsSync(path.join(root, "apps/web/dist/index.html"))) {
      log("未找到生产构建，先执行 pnpm build…");
      execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit", shell: true });
    }
    log(`启动生产服务 http://127.0.0.1:${port}`);
    const server = spawn(process.execPath, [path.join(root, "apps/server/dist/index.js")], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        DEMO_MODE: process.env.DEMO_MODE ?? "true",
        DATABASE_URL: process.env.DATABASE_URL ?? "./data/app.db",
        // Public demo defaults to Mock so a tunnel cannot burn real API credits.
        // Opt in explicitly: pnpm demo:tunnel --ai
        LLM_PROVIDER: process.env.LLM_PROVIDER ?? (forceAi ? "deepseek" : "mock"),
        DEMO_BASIC_AUTH: basicAuth,
      },
      stdio: "inherit",
    });
    children.push(server);
    startedServer = true;
    server.on("exit", (code) => {
      if (code && code !== 0) {
        log(`服务进程退出：${code}`);
        stop(code);
      }
    });
    if (!(await waitForServer())) {
      log(`服务未在 ${port} 端口就绪，请检查上方日志`);
      stop(1);
    }
  } else {
    log(`复用已运行的服务 http://127.0.0.1:${port}`);
  }

  try {
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    log(
      `AI Provider: ${health.provider}` +
        (health.provider === "mock"
          ? "（公网演示默认 Mock；接真实模型请运行 LLM_PROVIDER=deepseek pnpm demo:tunnel）"
          : ""),
    );
  } catch {
    // health is best-effort here
  }

  if (!withTunnel) {
    log("已跳过 Cloudflare Tunnel（--no-tunnel）");
    return;
  }

  function launchTunnel(attempt = 1) {
    log(attempt === 1 ? "启动 Cloudflare 快速隧道…" : `重试 Cloudflare 快速隧道（第 ${attempt}/3 次）…`);
    const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(tunnel);

    let url = null;
    const handle = (buffer) => {
      const text = buffer.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (!url) process.stdout.write(`  ${line}\n`);
        const match = line.match(/https:\/\/(?!(?:api|www)\.)[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !url) {
          url = match[0];
          fs.mkdirSync(path.join(root, "data"), { recursive: true });
          fs.writeFileSync(path.join(root, "data/tunnel-url.txt"), `${url}\n`);
          console.log("\n========================================================");
          console.log(`  SalesDeck 公网地址： ${url}`);
          if (startedServer && basicAuth) {
            const [user] = basicAuth.split(":");
            console.log(`  访问账号： ${user} / ${basicAuth.split(":").slice(1).join(":")}`);
          } else {
            console.log("  访问密码： 复用已有服务（由该服务决定）");
          }
          console.log(`  已写入 data/tunnel-url.txt`);
          console.log("  按 Ctrl+C 停止服务与隧道");
          console.log("========================================================\n");
        }
      }
    };
    tunnel.stdout.on("data", handle);
    tunnel.stderr.on("data", handle);
    tunnel.on("error", (error) => {
      log(`无法启动 cloudflared：${error.message}`);
      log("安装方式：winget install --id Cloudflare.cloudflared -e");
    });
    tunnel.on("exit", (code) => {
      if (url) return;
      if (attempt < 3) {
        log(`cloudflared 未建立隧道（退出码 ${code}），3 秒后重试`);
        setTimeout(() => launchTunnel(attempt + 1), 3000);
        return;
      }
      log(`cloudflared 连续 3 次未建立隧道（退出码 ${code}）。请检查网络或稍后重试。`);
      stop(code ?? 1);
    });
  }

  launchTunnel();
}

main().catch((error) => {
  console.error(error);
  stop(1);
});
