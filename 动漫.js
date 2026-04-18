const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// ========================================================
// 📅 自动计算日期逻辑 (获取昨天)
// ========================================================
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const defaultMonth = yesterday.getMonth() + 1; // 月份从0开始，所以+1
const defaultDay = yesterday.getDate();

// 获取命令行参数: [起始页, 终止页, 进程标识, 强制月份, 强制日期]
const args = process.argv.slice(2);

// ========================================================
// 🛠️ 顶层参数配置区 (所有修改仅在此处)
// ========================================================
const TASK_CONFIG = {
    baseUrl: 'http://1797ck.cc',       // 初始目标域名
    catId: '22',                      // 分类 ID
    catName: '动漫',               // 分类名称
    startPage: parseInt(args[0]) || 1,
    stopPage: parseInt(args[1]) || 60,
    // 自动刹车：优先用参数，没传参数就用“昨天”
    stopMonth: args[3] ? parseInt(args[3]) : defaultMonth,
    stopDay: args[4] ? parseInt(args[4]) : defaultDay,
    saveDir: './VideoResults',        // 结果保存目录
    dbFile: './动漫.json',     // 数据库文件名 (多开建议不同名)
    edgePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
};

// 使用命令行传入的进程标识，或者使用系统 PID
const PID = args[2] || process.pid;

const style = {
    info: chalk.cyan,
    success: chalk.green.bold,
    warn: chalk.yellow,
    error: chalk.red.bold,
    date: chalk.magenta,
    head: chalk.bgBlue.white.bold
};

// ========================================================
// 🚀 核心逻辑区
// ========================================================
async function run() {
    console.log(style.head(`\n 🚀 进程 [PID: ${PID}] 启动 | 区间: ${TASK_CONFIG.startPage} -> ${TASK_CONFIG.stopPage} `));
    
    let videoDb = fs.existsSync(TASK_CONFIG.dbFile) ? JSON.parse(fs.readFileSync(TASK_CONFIG.dbFile, 'utf-8')) : [];
    
    const browser = await chromium.launch({ 
        headless: true, 
        executablePath: TASK_CONFIG.edgePath 
    });
    const mainPage = await browser.newPage({ ...devices['iPhone 13'] });

    // 域名同步
    const syncDomain = (url) => {
        const match = url.match(/^https?:\/\/[^\/]+/i);
        if (match && match[0] !== TASK_CONFIG.baseUrl) {
            console.log(style.warn(`\n🔗 [PID: ${PID}] 域名跳变: ${TASK_CONFIG.baseUrl} -> ${match[0]}`));
            TASK_CONFIG.baseUrl = match[0];
        }
    };

    // 极致拦截
    await mainPage.route('**/*', (route) => {
        return route.request().resourceType() === 'document' ? route.continue() : route.abort();
    });

    console.log(style.info(`📂 分类: ${TASK_CONFIG.catName} | 清单将保存为: ${TASK_CONFIG.catName}_PID_${PID}.m3u8`));

    let forceStop = false;

    for (let p = TASK_CONFIG.startPage; p <= TASK_CONFIG.stopPage; p++) {
        if (forceStop) break;

        try {
            // 访问列表页
            // 1. 构造初始访问目标
			let listUrl = `${TASK_CONFIG.baseUrl.replace(/\/$/, '')}/vodtype/${TASK_CONFIG.catId}-${p}.html`;
            
            // 2. 尝试访问
            await mainPage.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            
            // 3. 核心判断：如果实际 URL 变了，说明被弹回首页了
            const currentUrl = mainPage.url();
            const match = currentUrl.match(/^https?:\/\/[^\/]+/i);
            
            if (match && match[0] !== TASK_CONFIG.baseUrl.replace(/\/$/, '')) {
                console.log(style.warn(`\n🔗 [PID: ${PID}] 检测到强制跳转！正在切换新域名重爬: ${match[0]}`));
                
                // 更新全局域名
                TASK_CONFIG.baseUrl = match[0];
                
                // 重新构造正确的第 p 页 URL 并再次访问
                listUrl = `${TASK_CONFIG.baseUrl}/vodtype/${TASK_CONFIG.catId}-${p}.html`;
                console.log(style.info(`🔄 [PID: ${PID}] 重新定位至: ${listUrl}`));
                await mainPage.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            }

            // 4. 这里的 syncDomain 其实已经被上面的逻辑覆盖了，但留着也没坏处
            syncDomain(mainPage.url());

            // 5. 下面才是开始解析页面内容

            const items = await mainPage.evaluate(() => {
                const res = [];
                document.querySelectorAll('.stui-vodlist li').forEach(li => {
                    const a = li.querySelector('h4.title a');
                    const sub = li.querySelector('p.sub');
                    if (sub && a) {
                        const dateMatch = sub.innerText.trim().match(/(\d{2}-\d{2})/);
                        const href = a.getAttribute('href') || "";
                        if (dateMatch && href.includes('vod')) {
                            res.push({
                                title: a.innerText.trim(),
                                relativeLink: href.startsWith('http') ? href.split('.cc')[1] || href : href,
                                date: dateMatch[0]
                            });
                        }
                    }
                });
                return res;
            });

            if (items.length === 0) {
                console.log(style.warn(`\n⚠️ 第 ${p} 页无内容，任务可能提前结束。`));
                break;
            }

            console.log(style.info(`\n📑 [PID: ${PID}] 正在处理第 ${p} 页 (${items.length} 条)`));

            let expireCount = 0;

            for (const item of items) {
                const fullLink = item.relativeLink.startsWith('http') ? item.relativeLink : TASK_CONFIG.baseUrl + item.relativeLink;
                const videoId = fullLink.match(/vodplay\/(\d+)/)?.[1];
                if (!videoId) continue;

                // 日期判定
                const [m, d] = item.date.split('-').map(Number);
                const isOld = (TASK_CONFIG.stopMonth && (m < TASK_CONFIG.stopMonth || (m === TASK_CONFIG.stopMonth && d < TASK_CONFIG.stopDay)));

                if (videoDb.includes(videoId) || isOld) {
                    if (isOld) {
                        expireCount++;
                        if (expireCount >= 3) {
                            console.log(style.warn(`\n🛑 连续旧资源 [${item.date}]，停止收割。`));
                            forceStop = true; break;
                        }
                    }
                    continue;
                }

                expireCount = 0;
                let finalM3u8 = null;
                let retry = 2;

                while (retry > 0 && !finalM3u8) {
                    try {
                        await new Promise(r => setTimeout(r, 500 + Math.random() * 300));
                        await mainPage.goto(fullLink, { waitUntil: 'commit', timeout: 15000 });
                        syncDomain(mainPage.url());

                        let html = await mainPage.content();
                        let rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);

                        if (!rawMatch) {
                            await new Promise(r => setTimeout(r, 2000));
                            html = await mainPage.content();
                            rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);
                        }

                        if (rawMatch) finalM3u8 = rawMatch[0].replace(/\\/g, "");
                        if (!finalM3u8) retry--;
                    } catch (e) { retry--; }
                }

                if (finalM3u8 && finalM3u8.toLowerCase().includes('m3u8')) {
                    const cleanM = finalM3u8.split('?')[0];
                    const catFolder = path.join(TASK_CONFIG.saveDir, TASK_CONFIG.catName);
                    if (!fs.existsSync(catFolder)) fs.mkdirSync(catFolder, { recursive: true });

                    // 使用 PID 后缀命名文件
                    const fileName = `${TASK_CONFIG.catName}_PID_${PID}.m3u8`;
                    fs.appendFileSync(
                        path.join(catFolder, fileName),
                        `#EXTINF:-1,${item.title} [${item.date}]\n${cleanM}\n`
                    );

                    videoDb.push(videoId);
                    fs.writeFileSync(TASK_CONFIG.dbFile, JSON.stringify(videoDb, null, 2));
                    process.stdout.write(style.success(` [OK] `) + style.date(`[${item.date}] `) + chalk.white(`${item.title.substring(0, 15)}...\r`));
                }
            }
        } catch (e) {
            console.log(style.error(`\n🚨 第 ${p} 页发生意外错误，尝试跳过...`));
        }
    }

    await browser.close();

    // ========================================================
    // 🚚 终极防错逻辑：特征配对、不丢链接、强制排序
    // ========================================================
    const catFolder = path.join(process.cwd(), TASK_CONFIG.saveDir, TASK_CONFIG.catName);
    const pidFile = path.join(catFolder, `${TASK_CONFIG.catName}_PID_${PID}.m3u8`);
    const mainFile = path.join(catFolder, `${TASK_CONFIG.catName}.m3u8`);

    if (fs.existsSync(mainFile) || fs.existsSync(pidFile)) {
        console.log(style.info(`\n正在例行整理 [${TASK_CONFIG.catName}] 清单...`));

        // 【核心工具：特征识别解析】
        const parse = (f) => {
            if (!fs.existsSync(f)) return [];
            try {
                const content = fs.readFileSync(f, 'utf-8');
                // 过滤空行，拿到所有有用行
                const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
                
                const result = [];
                let currentInfo = null;

                for (const line of lines) {
                    if (line.includes('#EXTM3U')) continue; // 杀掉所有头标

                    if (line.startsWith('#EXTINF')) {
                        currentInfo = line; // 抓到标题，暂存
                    } else if (line.startsWith('http')) {
                        // 发现链接，不论标题在哪，只要有链接就存
                        result.push({ 
                            info: currentInfo || `#EXTINF:-1,恢复数据_${Date.now()}`, 
                            url: line, 
                            title: currentInfo ? (currentInfo.split(',')[1] || "") : "未知标题"
                        });
                        currentInfo = null; // 用完重置，防止一个标题配多个链接
                    }
                }
                return result;
            } catch (e) { return []; }
        };

        // 1. 抓取所有数据（包含你现在弄乱的 mainFile）
        const allData = [...parse(mainFile), ...parse(pidFile)];

        if (allData.length > 0) {
            // 2. 强制按标题排序
            allData.sort((a, b) => 
                a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true })
            );

            // 3. 重新生成标准 M3U8 格式
            // 每一个 item 都会被重新格式化为标准的：标题换行链接
            const body = allData.map(i => `${i.info}\n${i.url}`).join('\n');
            const finalContent = `#EXTM3U8\n${body}\n`;
            
            try {
                fs.writeFileSync(mainFile, finalContent, 'utf-8');
                // 4. 清理临时碎片
                if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
                console.log(style.success(`✨ [${TASK_CONFIG.catName}] 修复并排序完成！`));
            } catch (e) { 
                console.log(style.error(`🚨 写入总表失败: ${e.message}`)); 
            }
        }
    }
    
    console.log(style.success(`\n✨ [PID: ${PID}] 任务圆满完成！`));
}

// 启动并捕获全局错误
run().catch(err => {
    console.error(chalk.red.bold(`\n🚨 脚本运行崩溃: `), err);
});	