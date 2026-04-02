const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    baseUrl: 'http://1772ck.cc', 
    categories: [
        { id: '26', name: '骑兵破解', stopM: 4, stopD: 1 },
        { id: '8',  name: '无码中文字幕', stopM: 3, stopD: 31 }
    ],
    saveDir: './VideoResults',
    dbFile: './history_db.json'
};

async function run() {
    console.log("🚀 启动【隔离对齐模式】：每个视频独立处理，无视崩溃...");
    
    let videoDb = fs.existsSync(CONFIG.dbFile) ? JSON.parse(fs.readFileSync(CONFIG.dbFile, 'utf-8')) : [];
    const browser = await chromium.launch({ headless: true }); 
    const mainPage = await browser.newPage({ ...devices['iPhone 13'] });

    for (const cat of CONFIG.categories) {
        console.log(`\n📂 进入分类: ${cat.name}`);
        let forceStop = false;

        for (let p = 1; p <= 100; p++) {
            if (forceStop) break;
            try {
                await mainPage.goto(`${CONFIG.baseUrl}/vodtype/${cat.id}-${p}.html`, { waitUntil: 'domcontentloaded' });
            } catch (e) { continue; }

            const items = await mainPage.evaluate((base) => {
                const res = [];
                document.querySelectorAll('.stui-vodlist li').forEach(li => {
                    const a = li.querySelector('h4.title a');
                    const sub = li.querySelector('p.sub');
                    if (a && sub) {
                        const href = a.getAttribute('href') || "";
                        const date = sub.innerText.trim();
                        if (href.includes('vod') && date.includes('-')) {
                            res.push({
                                title: a.innerText.trim(),
                                link: href.startsWith('http') ? href : base + href,
                                date: date.match(/(\d{2}-\d{2})/)[0]
                            });
                        }
                    }
                });
                return res;
            }, CONFIG.baseUrl);

            for (const item of items) {
                const [m, d] = item.date.split('-').map(Number);
                if (m < cat.stopM || (m === cat.stopM && d < cat.stopD)) {
                    forceStop = true; break;
                }
                // 🎯 修复逻辑：只提取 URL 最后的 ID 部分进行对比（例如 145503-1-1）
                   const videoId = item.link.split('/').pop(); 
                    if (videoDb.some(id => id.includes(videoId))) {
                     // console.log(`   ⏭️ 跳过已存在的 ID: ${videoId}`);
                    continue;
                    }

                console.log(`   🔎 处理中: [${item.date}] ${item.title.substring(0, 15)}`);
                
                // 🛠️ 关键改动：开启完全隔离的新上下文处理单个视频
                const tempContext = await browser.newContext({ ...devices['iPhone 13'] });
                // 阻断图片加载，节省内存
                await tempContext.route('**/*.{png,jpg,jpeg,gif,css}', route => route.abort());
                
                const detailPage = await tempContext.newPage();
                let captured = false;

                detailPage.on('request', req => {
                    const u = req.url();
                    if (u.includes('.m3u8') && !captured) {
                        captured = true;
                        const cleanM = u.split('?')[0];
                        const catFolder = path.join(CONFIG.saveDir, cat.name);
                        if (!fs.existsSync(catFolder)) fs.mkdirSync(catFolder, { recursive: true });
                        fs.appendFileSync(path.join(catFolder, `${cat.name}_清单.m3u8`), `#EXTINF:-1,[${item.date}] ${item.title}\n${cleanM}\n`);
                        videoDb.push(item.link);
                        fs.writeFileSync(CONFIG.dbFile, JSON.stringify(videoDb, null, 2));
                        console.log(`      ✅ 成功收割: ${cleanM.split('/').pop()}`);
                    }
                });

                try {
                    // 进入播放页，只要 HTML 出来就立刻操作
                    await detailPage.goto(item.link, { waitUntil: 'commit', timeout: 25000 }).catch(()=>{});
                    await detailPage.waitForTimeout(3000);

                    // 穿透点击：直接查找页面所有可能的播放元素并点击
                    await detailPage.evaluate(() => {
                        const selectors = ['.stui-player__video', '#playleft', 'video', 'iframe', '.playbtn'];
                        selectors.forEach(s => {
                            const el = document.querySelector(s);
                            if (el) {
                                el.click();
                                // 如果是 iframe，尝试点击它的中心
                                const rect = el.getBoundingClientRect();
                                el.dispatchEvent(new MouseEvent('click', {
                                    clientX: rect.left + rect.width / 2,
                                    clientY: rect.top + rect.height / 2
                                }));
                            }
                        });
                    }).catch(()=>{});

                    // 给 CDN 15 秒加载 index.m3u8 的时间
                    for (let i = 0; i < 15; i++) {
                        if (captured || detailPage.isClosed()) break;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (e) {
                    console.log(`      ⚠️ 任务超时或页面崩溃，自动跳过...`);
                } finally {
                    // 彻底销毁上下文，释放内存，防止被广告追踪
                    await tempContext.close().catch(()=>{});
                }
            }
        }
    }
    await browser.close();
    console.log('\n✨ 对齐任务圆满结束！');
}

run().catch(err => {
    console.error("🚨 发生了未预料的崩溃，请重新运行脚本即可断点续传:", err);
});
