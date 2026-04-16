const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// ========================================================
// 🛠️ 顶层参数配置
// ========================================================
const TASK_CONFIG = {
    domainFile: './current_domain.txt',    // 公共域名同步文件
    defaultBaseUrl: 'http://1794ck.cc',   // 默认起始域名
    catId: '7',                         // 分类 ID
    catName: '日本有码',                  // 分类名称（仅用于显示）
    startPage: 70,                        // 起始页码
    stopPage: 2000,                      // 终止页码
    outputFile: './日本有码.csv', // 索引结果文件
    edgePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
};

const PID = process.pid;
const style = {
    info: chalk.cyan,
    success: chalk.green.bold,
    warn: chalk.yellow,
    error: chalk.red.bold,
    head: chalk.bgMagenta.white.bold
};

// --- 工具函数：读取最新域名 ---
function getLatestDomain() {
    if (fs.existsSync(TASK_CONFIG.domainFile)) {
        return fs.readFileSync(TASK_CONFIG.domainFile, 'utf-8').trim().replace(/\/$/, '');
    }
    return TASK_CONFIG.defaultBaseUrl.replace(/\/$/, '');
}

// --- 工具函数：同步新域名 ---
function saveNewDomain(url) {
    const match = url.match(/^https?:\/\/[^\/]+/i);
    if (match) {
        const newDomain = match[0].replace(/\/$/, '');
        fs.writeFileSync(TASK_CONFIG.domainFile, newDomain);
        return newDomain;
    }
    return null;
}

async function run() {
    console.log(style.head(`\n 📑 [PID: ${PID}] 索引提取模式 (增量去重版) 启动 `));
    
    // 1. 加载现有数据实现增量去重
    let existingIds = new Set();
    if (fs.existsSync(TASK_CONFIG.outputFile)) {
        const content = fs.readFileSync(TASK_CONFIG.outputFile, 'utf-8');
        const lines = content.split('\n');
        lines.forEach(line => {
            const id = line.split(',')[0]; // CSV 第一列是 ID
            if (id && id !== 'ID') existingIds.add(id.trim());
        });
        console.log(style.info(`📊 检查：已加载本地 ${existingIds.size} 条历史索引，重复项将自动跳过。`));
    } else {
        // 写入带 BOM 的 CSV 头，防止 Excel 打开乱码
        fs.writeFileSync(TASK_CONFIG.outputFile, '\ufeffID,标题,日期\n');
    }

    const browser = await chromium.launch({ headless: true, executablePath: TASK_CONFIG.edgePath });
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();

    // 2. 极致拦截：只允许 Document (HTML)，屏蔽图片/广告/样式
    await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        return type === 'document' ? route.continue() : route.abort();
    });

    let currentBase = getLatestDomain();

    for (let p = TASK_CONFIG.startPage; p <= TASK_CONFIG.stopPage; p++) {
        try {
            // 每页开始前刷新域名
            currentBase = getLatestDomain();
            let listUrl = `${currentBase}/vodtype/${TASK_CONFIG.catId}-${p}.html`;

            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            
            // 3. 域名纠偏 (处理被弹回首页的情况)
            const actualUrl = page.url();
            if (!actualUrl.includes(`/vodtype/${TASK_CONFIG.catId}`)) {
                console.log(style.warn(`\n🔗 [PID: ${PID}] 检测到跳转，同步新域名...`));
                const newBase = saveNewDomain(actualUrl);
                if (newBase) {
                    currentBase = newBase;
                    listUrl = `${currentBase}/vodtype/${TASK_CONFIG.catId}-${p}.html`;
                    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                }
            }

            // 4. 数据解析
            const items = await page.evaluate(() => {
                const data = [];
                document.querySelectorAll('.stui-vodlist li').forEach(li => {
                    const a = li.querySelector('h4.title a');
                    const sub = li.querySelector('p.sub');
                    if (a && sub) {
                        const href = a.getAttribute('href') || "";
                        const idMatch = href.match(/vodplay\/(\d+)/) || href.match(/voddetail\/(\d+)/);
                        const dateMatch = sub.innerText.match(/(\d{2}-\d{2})/);
                        if (idMatch) {
                            data.push({
                                id: idMatch[1],
                                title: a.innerText.trim().replace(/,/g, ' '), // 清理标题中的逗号
                                date: dateMatch ? dateMatch[0] : '未知'
                            });
                        }
                    }
                });
                return data;
            });

            if (items.length === 0) {
                console.log(style.warn(`\n⏹️ 第 ${p} 页为空，可能是到达末尾或触发了安全机制。`));
                break;
            }

            // 5. 增量过滤与写入
            const newItems = items.filter(item => !existingIds.has(item.id));

            if (newItems.length > 0) {
                const csvRows = newItems.map(item => `${item.id},${item.title},${item.date}`).join('\n') + '\n';
                fs.appendFileSync(TASK_CONFIG.outputFile, csvRows);
                
                // 将新抓取的 ID 加入缓存，防止本轮内重复
                newItems.forEach(item => existingIds.add(item.id));
                
                process.stdout.write(
                    style.info(`  [Page ${p}] `) + 
                    style.success(`新增 ${newItems.length} 条 `) + 
                    (items.length > newItems.length ? style.warn(`(跳过已存在 ${items.length - newItems.length})`) : "") + 
                    `\r`
                );
            } else {
                process.stdout.write(style.warn(`  [Page ${p}] 全部重复，跳过写入... \r`));
            }

            // 轻微延迟，保护 IP
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            console.log(style.error(`\n🚨 第 ${p} 页访问超时或出错，跳过该页。`));
        }
    }

    await browser.close();
    console.log(style.success(`\n\n✨ 索引收割任务完成！`));
    console.log(style.info(`📂 结果已保存至: ${path.resolve(TASK_CONFIG.outputFile)}`));
}

run().catch(err => console.error("🚨 进程崩溃:", err));