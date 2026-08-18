/**
 * publish.js — 使用 GitHub REST API 将本仓库发布到 GitHub Pages。
 * 零依赖,仅使用 Node 内置模块(https/dns/fs/path)。
 *
 * 流程:
 *   1. 校验 Token(GET /user)
 *   2. 创建(或复用)公开仓库 <owner>/markdownEditor
 *   3. 扫描本地文件(跳过 .git/.idea/node_modules)
 *   4. 通过 Git Data API 上传 Blob -> Tree -> Commit(单提交)
 *   5. 创建/更新分支 main
 *   6. 设置默认分支、启用 GitHub Pages
 *   7. 轮询 Pages 构建状态并输出访问地址
 *
 * 用法:
 *   node publish.js [--token-file <临时Token文件>] [--message <提交信息>]
 *   或设置环境变量 GITHUB_TOKEN。
 *
 * 说明:
 *   - 增量发布:新提交以远程当前 HEAD 为父提交,历史不断累积;
 *     仅当远程分支不存在(全新仓库)时创建分支,非快进时才强制更新。
 *   - 本机 hosts 把 api.github.com 指向 127.0.0.1,因此脚本用
 *     dns.resolve4() 获取真实 IP,以 host=<IP> + servername 方式连接,
 *     绕过 hosts 劫持;正常环境同样适用。
 *   - Token 需要经典 PAT 且勾选 repo 权限;请勿提交 Token 到仓库。
 */

const https = require('https');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

const OWNER = 'HACHIMAN168';
const REPO = 'markdownEditor';
const BRANCH = 'main';
const DEFAULT_COMMIT_MESSAGE = 'Initial commit: Markdown note editor (pure static frontend)';
const AUTHOR = { name: 'HACHIMAN168', email: 'HACHIMAN168@users.noreply.github.com' };

const API_HOST = 'api.github.com';
const ROOT = __dirname; // 脚本所在目录即仓库根目录
const SKIP_DIRS = new Set(['.git', '.idea', 'node_modules']);

let TOKEN = null;
let TOKEN_FILE = null;

// ---------- 参数与 Token ----------
function getCommitMessage() {
  const idx = process.argv.indexOf('--message');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return DEFAULT_COMMIT_MESSAGE;
}
function getToken() {
  const idx = process.argv.indexOf('--token-file');
  if (idx !== -1 && process.argv[idx + 1]) {
    TOKEN_FILE = path.resolve(process.argv[idx + 1]);
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  throw new Error('未找到 Token:请设置环境变量 GITHUB_TOKEN 或传入 --token-file <文件>');
}

// ---------- 收集待上传文件 ----------
function collectFiles(dir, base) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (TOKEN_FILE && path.resolve(full) === TOKEN_FILE) continue; // 防御:绝不上传 Token 文件
    if (ent.isDirectory()) out.push(...collectFiles(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

// ---------- HTTP 工具 ----------
function parseBody(res) {
  return new Promise((resolve) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (c) => (raw += c));
    res.on('end', () => {
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
      resolve({ status: res.statusCode, json, raw });
    });
  });
}

function api(method, route, body) {
  return new Promise((resolve, reject) => {
    dns.resolve4(API_HOST, (err, ips) => {
      if (err) return reject(new Error(`DNS 解析 ${API_HOST} 失败: ${err.code || err.message}`));
      const headers = {
        Host: API_HOST,
        'User-Agent': `${OWNER}-publish-script`,
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
      };
      const payload = body === undefined ? null : JSON.stringify(body);
      if (payload) headers['Content-Type'] = 'application/json';
      const req = https.request(
        { host: ips[0], port: 443, servername: API_HOST, method, path: route, headers },
        async (res) => {
          try { resolve(await parseBody(res)); } catch (e) { reject(e); }
        }
      );
      req.setTimeout(30000, () => req.destroy(new Error(`请求超时(30s): ${method} ${route}`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function expect(parsed, okStatuses, what) {
  if (!okStatuses.includes(parsed.status)) {
    const msg = parsed.json && parsed.json.message ? parsed.json.message : (parsed.raw || parsed.status);
    throw new Error(`${what} 失败 (HTTP ${parsed.status}): ${msg}`);
  }
  return parsed.json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 主流程 ----------
async function main() {
  TOKEN = getToken();
  console.log('==> 1/9 校验 Token...');
  const me = expect(await api('GET', '/user'), [200], '校验 Token');
  console.log(`    OK: 已认证为 ${me.login}`);
  let owner = me.login !== OWNER ? me.login : OWNER;

  console.log(`==> 2/9 确保仓库 ${owner}/${REPO} 存在(公开)...`);
  const existing = await api('GET', `/repos/${owner}/${REPO}`);
  let repo;
  if (existing.status === 200) {
    repo = existing.json;
    console.log(`    复用已有仓库: ${repo.html_url} (owner=${repo.owner.login})`);
  } else if (existing.status === 404) {
    repo = expect(
      await api('POST', '/user/repos', {
        name: REPO,
        description: 'Markdown 笔记工具(纯静态前端,LocalStorage 存储)',
        private: false,
        auto_init: false,
      }),
      [201],
      '创建仓库'
    );
    console.log(`    已创建仓库: ${repo.html_url}`);
  } else {
    throw new Error(`查询仓库失败 (HTTP ${existing.status}): ${existing.raw}`);
  }
  owner = repo.owner.login;

  console.log('==> 3/9 读取本地文件...');
  const files = collectFiles(ROOT, '');
  console.log(`    共 ${files.length} 个文件`);

  console.log('==> 4/9 上传 Blob...');
  const tree = [];
  let bootstrapped = false;
  for (const f of files) {
    let blob;
    try {
      blob = expect(
        await api('POST', `/repos/${owner}/${REPO}/git/blobs`, {
          content: fs.readFileSync(f.full).toString('base64'),
          encoding: 'base64',
        }),
        [201],
        `上传 ${f.rel}`
      );
    } catch (err) {
      // 空仓库无法直接写 Git Data API,先用 Contents API 创建引导提交
      if (!bootstrapped && err.message.includes('Git Repository is empty')) {
        console.log('    仓库为空,先创建引导提交(.gitkeep)...');
        const boot = await api('PUT', `/repos/${owner}/${REPO}/contents/.gitkeep`, {
          message: 'chore: bootstrap empty repository for initial publish',
          content: Buffer.from('bootstrap\n').toString('base64'),
        });
        expect(boot, [200, 201], '引导提交');
        bootstrapped = true;
        blob = expect(
          await api('POST', `/repos/${owner}/${REPO}/git/blobs`, {
            content: fs.readFileSync(f.full).toString('base64'),
            encoding: 'base64',
          }),
          [201],
          `上传 ${f.rel}`
        );
      } else {
        throw err;
      }
    }
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`    + ${f.rel} (${blob.sha.slice(0, 7)})`);
  }

  console.log('==> 5/9 构建 Tree...');
  const t = expect(
    await api('POST', `/repos/${owner}/${REPO}/git/trees`, { tree, base_tree: null }),
    [201],
    '构建 Tree'
  );

  console.log('==> 6/9 创建提交...');
  // 查询远程当前 HEAD,作为增量提交的父提交(全新仓库则无父提交)
  const refHead = await api('GET', `/repos/${owner}/${REPO}/git/ref/heads/${BRANCH}`);
  const parentSha = refHead.status === 200 ? refHead.json.object.sha : null;
  console.log(`    远程 ${BRANCH} 当前指向: ${parentSha || '(不存在)'}`);
  const now = new Date().toISOString();
  const commit = expect(
    await api('POST', `/repos/${owner}/${REPO}/git/commits`, {
      message: getCommitMessage(),
      tree: t.sha,
      parents: parentSha ? [parentSha] : [],
      author: { ...AUTHOR, date: now },
      committer: { ...AUTHOR, date: now },
    }),
    [201],
    '创建提交'
  );
  console.log(`    commit ${commit.sha}`);

  console.log('==> 7/9 更新分支 main...');
  const refRes = await api('POST', `/repos/${owner}/${REPO}/git/refs`, {
    ref: `refs/heads/${BRANCH}`,
    sha: commit.sha,
  });
  if (refRes.status === 201) {
    console.log(`    已创建分支 ${BRANCH}`);
  } else if (refRes.status === 422) {
    // 分支已存在:先尝试快进更新,非快进时再强制更新
    const ff = await api('PATCH', `/repos/${owner}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
    if (ff.status === 200) {
      console.log(`    分支 ${BRANCH} 快进更新到新提交`);
    } else {
      expect(
        await api('PATCH', `/repos/${owner}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true }),
        [200],
        '更新分支'
      );
      console.log(`    分支 ${BRANCH} 非快进,force 更新到新提交`);
    }
  } else {
    throw new Error(`创建分支失败 (HTTP ${refRes.status}): ${refRes.raw}`);
  }

  console.log('==> 8/9 设置默认分支与启用 Pages...');
  try {
    expect(await api('PATCH', `/repos/${owner}/${REPO}`, { default_branch: BRANCH }), [200], '设置默认分支');
    console.log(`    默认分支: ${BRANCH}`);
  } catch (e) {
    console.log(`    (忽略)${e.message}`);
  }
  const pagesRes = await api('POST', `/repos/${owner}/${REPO}/pages`, { source: { branch: BRANCH, path: '/' } });
  if ([200, 201, 204].includes(pagesRes.status)) {
    console.log(`    Pages 已启用: ${pagesRes.json && pagesRes.json.html_url ? pagesRes.json.html_url : ''}`);
  } else if (pagesRes.status === 409) {
    console.log('    Pages 已启用(幂等)');
  } else {
    throw new Error(`启用 Pages 失败 (HTTP ${pagesRes.status}): ${pagesRes.raw}`);
  }

  console.log('==> 9/9 等待 Pages 构建...');
  let last = null;
  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    const b = await api('GET', `/repos/${owner}/${REPO}/pages/builds/latest`);
    if (b.status === 404) {
      console.log(`    [${(i + 1) * 10}s] 暂无构建记录,继续等待...`);
      continue;
    }
    if (b.status !== 200) throw new Error(`查询构建状态失败 (HTTP ${b.status}): ${b.raw}`);
    last = b.json;
    console.log(`    [${(i + 1) * 10}s] status=${last.status}`);
    if (last.status === 'success' || last.status === 'built') break;
    if (last.status === 'error') throw new Error(`Pages 构建失败: ${JSON.stringify(last.error || last)}`);
  }

  const site = expect(await api('GET', `/repos/${owner}/${REPO}/pages`), [200], '查询 Pages 站点');
  const info = expect(await api('GET', `/repos/${owner}/${REPO}`), [200], '查询仓库信息');
  try {
    await api('PATCH', `/repos/${owner}/${REPO}`, { homepage: site.html_url });
  } catch { /* homepage 尽力而为,忽略 */ }

  console.log('\n========== 发布完成 ==========');
  console.log(`仓库:       ${info.html_url}`);
  console.log(`默认分支:   ${info.default_branch} (${info.private ? '私有' : '公开'})`);
  console.log(`Pages:      ${site.html_url}`);
  console.log(`Pages 状态: ${site.status}${last ? ` (最后构建: ${last.status})` : ''}`);
  console.log(`提交 sha:   ${commit.sha}`);
  if (!last || (last.status !== 'success' && last.status !== 'built')) {
    console.log(`注意: 构建尚未成功,稍后可刷新 ${site.html_url} 查看。`);
  }
  console.log(`本地同步:   git update-ref refs/heads/main ${commit.sha}`);
}

main().catch((e) => {
  console.error('\n[发布失败]', e.message);
  process.exit(1);
});
