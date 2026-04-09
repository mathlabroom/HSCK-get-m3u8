const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    baseUrl: 'http://1786ck.cc', 
    categories: [
        { id: '8',  name: '无码中文字幕', startP: 2, stopM: 4, stopD: 9 },
        { id: '2',  name: '国产系列', startP: 20, stopM: 1, stopD: 1 }
    ],
    saveDir: './VideoResults',
    dbFile: './history_db.json'
};

async function run() {
    console.log("🚀 启动【极致省流源码直取模式】...");
    
    let videoDb = fs.existsSync(CONFIG.dbFile) ? JSON.parse(fs.readFileSync(CONFIG.dbFile, 'utf-8')) : [];
    const browser = await chromium.launch({ headless: true }); 
    const mainPage = await browser.newPage({ ...devices['iPhone 13'] });

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
                await mainPage.goto(`${CONFIG.baseUrl}/vodtype/${cat.id}-${p}.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
                
                items = await mainPage.evaluate((base) => {
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
                                    link: href.startsWith('http') ? href : base + href,
                                    date: dateMatch[0] // 修正索引
                                });
                            }
                        }
                    });
                    return res;
                }, CONFIG.baseUrl);

                if (items.length === 0) break;
                console.log(`📑 第 ${p} 页扫描完毕，发现 ${items.length} 条资源`);
            } catch (e) { 
                console.log(`⚠️ 第 ${p} 页列表加载失败，跳过...`);
                continue; 
            }

            let expireCount = 0; 

            for (const item of items) {
                const idMatch = item.link.match(/vodplay\/(\d+)/);
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
                        // 1. 拟人休眠
                        await new Promise(r => setTimeout(r, 1200 + Math.random() * 1000));
                        
                        // 2. 访问页面 (commit 级别)
                        await mainPage.goto(item.link, { waitUntil: 'commit', timeout: 15000 });
                        
                        // 3. 第一次尝试提取
                        let html = await mainPage.content();
                        // 针对转义斜杠优化的暴力正则
                        let rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);
                        
                        if (!rawMatch) {
                            // 【回马枪】如果没抓到，等 2.5 秒（给服务器吐源码的时间），再拉一次
                            await new Promise(r => setTimeout(r, 2500));
                            html = await mainPage.content();
                            rawMatch = html.match(/https?[:\\]+[^"']+\.m3u8[^"']*/i);
                        }

                        if (rawMatch) {
                            finalM3u8 = rawMatch[0].replace(/\\/g, ""); 
                        }
                        
                        if (!finalM3u8) {
                            retry--;
                            if(retry > 0) console.log(`     🔄 未匹配到地址，准备第 ${3-retry} 次重试...`);
                        }
                    } catch (e) {
                        retry--;
                        console.log(`     ⚠️ 网络异常 (${e.message.substring(0,20)})，剩余重试: ${retry}`);
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

                    // 成功才记录
                    videoDb.push(videoId); 
                    fs.writeFileSync(CONFIG.dbFile, JSON.stringify(videoDb, null, 2));
                    console.log(`     ✅ 提取成功: [${item.date}] ${videoId}`);
                } else {
                    console.log(`     ❌ 无法获取地址 (不记录): ${videoId}`);
                }
            } 
        } 
    }

    await browser.close();
    console.log('\n✨ 任务全部圆满完成！');
}

run().catch(err => { console.error("🚨 核心崩溃:", err); });