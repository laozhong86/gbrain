# Deployment

GBrain 不是一个需要长期运行在云上的 Web 服务。当前更准确的说法是安装和分发：把 `gbrain` 编译成一个本地可执行 CLI，配一个 `brain.db`，再按需接到 MCP client。

如果部署目标是 OpenClaw，先看这两份：

- [`docs/openclaw.md`](/Users/x/Desktop/Project/GBrain/docs/openclaw.md)
- [`hooks/gbrain-ingest-session/HOOK.md`](/Users/x/Desktop/Project/GBrain/hooks/gbrain-ingest-session/HOOK.md)

这份文档分三种场景：

1. 本地安装，自己直接用
2. 二进制分发，给别人下载
3. MCP 接入，给 Claude Code 或其他客户端调用

## 1. 本地安装

### 前提

- Bun `1.3.11`
- macOS 或 Linux
- 可选：`OPENAI_API_KEY`，只有 `gbrain embed` 和 `gbrain query` 需要

### 一条命令安装最新 release

```bash
curl -fsSL https://raw.githubusercontent.com/laozhong86/gbrain/main/install.sh | sh
```

这个安装器会：

- 按当前平台下载最新 GitHub Release 二进制
- 下载同一 release 的 `SHA256SUMS`
- 在替换目标二进制前做 SHA-256 校验
- 安装到 `~/.local/bin/gbrain`
- 直接把二进制设成可执行

当前 release 资产覆盖：

- `gbrain-linux-x64`
- `gbrain-darwin-arm64`
- `gbrain-darwin-x64`

如果目标机器已经装了 OpenClaw，并且你要顺手把插件也接上：

```bash
curl -fsSL https://raw.githubusercontent.com/laozhong86/gbrain/main/install.sh | sh -s -- --with-openclaw
```

安装器会先尝试直接安装版本化插件包 `@laozhong86/gbrain-openclaw`。如果当前版本还没有发布这个包，它才会回退到 repo checkout + `openclaw plugins install --link ...`。

### 从源码安装

```bash
git clone https://github.com/laozhong86/gbrain.git
cd gbrain

bun install
bun run check
bun test
bun run build
```

构建成功后会生成：

```bash
bin/gbrain
```

### 直接运行

```bash
./bin/gbrain init
./bin/gbrain stats
```

默认数据库文件是当前目录下的 `brain.db`。

如果你想显式指定数据库：

```bash
./bin/gbrain init /path/to/brain.db
./bin/gbrain stats --db /path/to/brain.db
```

### 放进 PATH

```bash
mkdir -p ~/.local/bin
cp bin/gbrain ~/.local/bin/gbrain
```

确保 `~/.local/bin` 在 `PATH` 里，然后就可以直接：

```bash
gbrain init
gbrain stats
```

如果你想用 OpenClaw 友好的默认路径，可以启用这个预设：

```bash
export GBRAIN_PROFILE=openclaw
gbrain init
gbrain stats
```

这样默认数据库会落到 `~/.openclaw/brain.db`。显式传 `--db` 或设置 `GBRAIN_DB` 仍然优先。

### Embeddings 相关环境变量

如果你要用 embedding 和 hybrid query：

```bash
export OPENAI_API_KEY=your_api_key
```

如果你想走 OpenRouter，也可以直接用：

```bash
export OPENROUTER_API_KEY=your_api_key
```

当前实现会优先按这些方式工作：

- 显式传入自定义 base URL
- `EMBEDDING_BASE_URL`
- `OPENAI_BASE_URL`
- 如果只检测到 `OPENROUTER_API_KEY`，默认走 `https://openrouter.ai/api/v1`
- 否则默认走 `https://api.openai.com/v1`

如果你想给 OpenRouter 带可选标识头，也可以加：

```bash
export OPENROUTER_HTTP_REFERER=https://your-site.example
export OPENROUTER_X_TITLE=GBrain
```

没有这个环境变量时：

- `gbrain search` 仍然可用
- `gbrain embed` 和 `gbrain query` 会失败

## 2. 作为二进制分发

当前仓库已经支持用 Bun 编译单文件二进制：

```bash
bun run build
```

产物是：

```bash
bin/gbrain
```

如果你要把它发给别人，推荐的最小流程是：

1. 在干净环境里运行 `bun install`
2. 运行 `bun run check`
3. 运行 `bun test`
4. 运行 `bun run build`
5. 验证二进制

```bash
./bin/gbrain version
./bin/gbrain --tools-json
```

6. 把 `bin/gbrain` 上传到 GitHub Release

当前 CI 已经会做：

```bash
bun install
bun run check
bun test
bun run build
```

但它还不会自动创建 GitHub Release。现在的发布方式更适合手动打包上传。

### 推荐的 Release 结构

至少包含：

- `gbrain` 二进制
- `README.md`
- `DEPLOYMENT.md`
- `skills/` 目录

如果你希望用户直接拿来接 MCP，最好在 Release 说明里一起给一个配置样例。

## 3. MCP 接入

GBrain 的 MCP 入口是：

```bash
gbrain serve --db /absolute/path/to/brain.db
```

客户端通过 stdio 启动它，不是通过 HTTP。

### Claude Code 配置示例

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve", "--db", "/absolute/path/to/brain.db"]
    }
  }
}
```

如果 `gbrain` 不在 `PATH` 里，也可以写绝对路径：

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "/absolute/path/to/gbrain",
      "args": ["serve", "--db", "/absolute/path/to/brain.db"]
    }
  }
}
```

### MCP 运行前建议

先手动确认这几个命令都通：

```bash
gbrain version
gbrain --tools-json
gbrain stats --db /absolute/path/to/brain.db
```

如果你要让 MCP 里的 semantic query 生效，还需要在启动 MCP 的那个环境里带上：

```bash
OPENAI_API_KEY
```

## 4. 生产上怎么理解

如果你说的“生产部署”是指：

- 放到服务器上长期运行
- 给多个用户共享
- 挂 HTTP API
- 反向代理
- 做高可用

那当前仓库还不是这个形态。它现在的产品边界是：

- 本地 CLI
- 本地 SQLite 文件
- stdio MCP server

这不是缺陷，只是当前版本的设计选择。

## 5. CI

当前 CI 在 GitHub Actions 里，文件在：

[`ci.yml`](/Users/x/Desktop/Project/GBrain/.github/workflows/ci.yml)

它会在 push 和 pull request 上执行：

```bash
bun install
bun run check
bun test
bun run build
```

当前固定的 Bun 版本是：

```bash
1.3.11
```

这很重要，因为它避免了 `latest` 带来的不确定性。

## 6. 升级和回滚

### 升级二进制

重新拉代码并构建：

```bash
git pull
bun install
bun run check
bun test
bun run build
cp bin/gbrain ~/.local/bin/gbrain
```

如果你已经是通过编译后二进制安装，也可以直接：

```bash
gbrain upgrade --check
gbrain upgrade
```

这条路径会从 GitHub Release 下载与你当前平台匹配的最新二进制，校验 `SHA256SUMS`，然后原地替换。

注意两点：

- 它要求你当前运行的是编译后的 `gbrain` 二进制
- 它依赖仓库已经发布对应平台的 GitHub Release 资产

### 回滚

最稳的回滚单元其实不是代码，而是：

- 上一个 `gbrain` 二进制
- 上一个 `brain.db` 备份

因为这是 SQLite 单文件架构，回滚成本很低。

## 7. 故障排查

### `gbrain query` / `gbrain embed` 失败

先看有没有：

```bash
echo $OPENAI_API_KEY
```

没有就先配置环境变量。

### `gbrain serve` 能启动，但客户端看不到工具

先本地跑：

```bash
gbrain --tools-json
```

如果这里都不对，先修本地安装；不要先怀疑 MCP client。

### 编译出来了但运行时报数据库相关错误

先确认当前目录或 `--db` 指向的位置可写，并且：

```bash
gbrain init /path/to/brain.db
gbrain stats --db /path/to/brain.db
```

### 构建通过，但二进制在另一台机器不能运行

当前做的是 Bun compile 产物分发。最稳妥的方式仍然是：

- 在目标平台上构建目标平台的二进制
- 不要假设一个平台构建出的产物能无差别覆盖所有平台

## 8. 当前推荐做法

如果你只是自己用：

```bash
bun install && bun run check && bun test && bun run build
cp bin/gbrain ~/.local/bin/gbrain
```

如果你要给别人用：

- 在 CI 或本机构建 `bin/gbrain`
- 手动发 GitHub Release
- 附上 MCP 配置样例

如果你要接 AI 客户端：

- 安装 `gbrain`
- 准备好 `brain.db`
- 配置 `gbrain serve --db ...`
- 需要 semantic query 时再加 `OPENAI_API_KEY`
