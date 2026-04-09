const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    // 初始域名，运行中会自动随跳转更新
    baseUrl: 'http://1786ck.cc', 
    categories: [
	    { id: '26',  name: '骑兵破解', startP: 1, stopM: 4, stopD: 9 },
        { id: '8',  name: '无码中文字幕', startP: 1, stopM: 4, stopD: 9 },
        { id: '2',  name: '国产系列', startP: 84, stopM: null, stopD: null }
    ],
    saveDir: './VideoResults',
    dbFile: './history_db.json'
};

async function run() {
    console.log("🚀 启动【极致省流+域名自适应】模式...");
    
    let videoDb = fs.existsSync(CONFIG.dbFile) ? JSON.parse(fs.readFileSync(CONFIG.dbFile, 'utf-8')) : [];
    const browser = await chromium.launch({ headless: true }); 
    const mainPage = await browser.newPage({ ...devices['iPhone 13'] });

    // 域名同步函数：检测当前页面 URL 是否发生跳转并更新基准域名
    const syncDomain = (url) => {
        const match = url.match(/^https?:\/\/[^\/]+/i);
        if (match && match[0] !== CONFIG.baseUrl) {
            console.log(`\n🔗 检测到域名跳转: ${CONFIG.baseUrl} -> ${match[0]}`);
            CONFIG.baseUrl = match[0];
        }
    };

    // 极致拦截：只要 HTML 文档
    await mainPage.route('**/*', (route) => {
        return route.request().resourceType() === 'document' ? route.continue() : route.abort();
    });

    for (const cat of CONFIG.categories) {
        console.log(`\n📂 进入分类: ${cat.name} (从第 ${cat.startP || 1} 页开始)`);
        let forceStop = false;

        for (let p = (cat.startP || 1); p <= 1000; p++) {
            if (forceStop) break;
            
            let items = [];
            try {
                // 1. 列表页访问
                await mainPage.goto(`${CONFIG.baseUrl}/vodtype/${cat.id}-${p}.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
                syncDomain(mainPage.url()); // 同步域名

                items = await mainPage.evaluate(() => {
                    const res = [];
                    document.querySelectorAll('.stui-vodlist li').forEach(li => {
                        const a = li.querySelector('h4.title a');
                        const sub = li.querySelector('p.sub');
                        if (sub && a) {
                            const dateMatch = sub.innerText.trim().match(/(\d{2}-\d{2})/);
                            const href = a.getAttribute('href') || "";
                            // 列表页只抓取相对路径 ID 核心部分，后面拼接最新的 baseUrl
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

                if (items.length === 0) break;
                console.log(`📑 第 ${p} 页扫描完毕，发现 ${items.length} 条资源 (当前域名: ${CONFIG.baseUrl})`);
            } catch (e) { 
                console.log(`⚠️ 第 ${p} 页列表加载失败，尝试换个域名重试...`);
                continue; 
            }

            let expireCount = 0; 

            for (const item of items) {
                // 构建完整的详情页地址 (用最新的域名拼接)
                const fullLink = item.relativeLink.startsWith('http') ? item.relativeLink : CONFIG.baseUrl + item.relativeLink;
                const idMatch = fullLink.match(/vodplay\/(\d+)/);
                const videoId = idMatch ? idMatch[1] : null;
                if (!videoId) continue;
                
                const [m, d] = item.date.split('-').map(Number);
                const isOld = (cat.stopM && (m < cat.stopM || (m === cat.stopM && d < cat.stopD)));

                if (videoDb.includes(videoId) || isOld) {
                    if (isOld) {
                        expireCount++;
                        if (expireCount >= 3) {
                            console.log(`🛑 连续旧片 [${item.date}]，该分类结束`);
                            forceStop = true; break;
                        }
                    }
                    continue; 
                }

                expireCount = 0; 
                
                // --- 开始收割逻辑 ---
                let finalM3u8 = null;
                let retry = 2; 

                while (retry > 0 && !finalM3u8) {
                    try {
                        await new Promise(r => setTimeout(r, 1200 + Math.random() * 1000));
                        
                        // 使用 fullLink (它会跟随 baseUrl 动态变化)
                        await mainPage.goto(fullLink, { waitUntil: 'commit', timeout: 15000 });
                        syncDomain(mainPage.url()); // 详情页如果跳转，也同步一下

                        let html = await mainPage.content();
                        let rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);
                        
                        if (!rawMatch) {
                            await new Promise(r => setTimeout(r, 2500));
                            html = await mainPage.content();
                            rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);
                        }

                        if (rawMatch) {
                            finalM3u8 = rawMatch[0].replace(/\\/g, ""); 
                        }
                        
                        if (!finalM3u8) {
                            retry--;
                        }
                    } catch (e) {
                        retry--;
                    }
                }

                if (finalM3u8 && finalM3u8.toLowerCase().includes('m3u8')) {
                    const cleanM = finalM3u8.split('?')[0];
                    const catFolder = path.join(CONFIG.saveDir, cat.name);
                    if (!fs.existsSync(catFolder)) fs.mkdirSync(catFolder, { recursive: true });
                    
                    fs.appendFileSync(
                        path.join(catFolder, `${cat.name}_清单.m3u8`), 
                        `#EXTINF:-1,${item.title} [${item.date}]\n${cleanM}\n`
                    );

                    videoDb.push(videoId); 
                    // 批量保存建议（可选）：这里为了稳妥还是每次写入，如果太慢可以改成每 10 条写一次
                    fs.writeFileSync(CONFIG.dbFile, JSON.stringify(videoDb, null, 2));
                    console.log(`      ✅ 提取成功: [${item.date}] ${item.title}`);
                } else {
                    console.log(`      ❌ 无法获取地址 (不记录): ${videoId}`);
                }
            } 
        } 
    }

    await browser.close();
    console.log('\n✨ 任务全部圆满完成！');
}

run().catch(err => { console.error("🚨 核心崩溃:", err); });
