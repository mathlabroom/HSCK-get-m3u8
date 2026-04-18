const fs = require('fs');
const path = require('path');

const BASE_DIR = './VideoResults'; // 你的 m3u8 根目录
const OUTPUT_DIR = './E2_Bouquets'; // 生成的 .tv 文件存放处

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// 对应你截图中的分类和基础 SID 规则
const CATEGORY_MAP = {
    "国产系列": { bouquetId: "1", hexId: "65" },
    "骑兵破解": { bouquetId: "2", hexId: "66" },
    "无码中文字幕": { bouquetId: "3", hexId: "67" },
    "有码中文字幕": { bouquetId: "4", hexId: "68" },
    "日本有码": { bouquetId: "6", hexId: "69" },
    "日本无码": { bouquetId: "7", hexId: "6A" }
};

function convert() {
    Object.keys(CATEGORY_MAP).forEach(catName => {
        const m3u8Path = path.join(BASE_DIR, catName, `${catName}.m3u8`);
        if (!fs.existsSync(m3u8Path)) return;

        console.log(`正在转换: ${catName}...`);
        const content = fs.readFileSync(m3u8Path, 'utf-8');
        const lines = content.split('\n');
        
        let bouquetContent = `#NAME ${catName}\n`;
        let sidCounter = 1; // 第二个1是sid，从1开始往下排

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF')) {
                const title = lines[i].split(',')[1].trim();
                const url = lines[i + 1] ? lines[i + 1].trim() : "";
                
                if (url && url.startsWith('http')) {
                    // 格式: #SERVICE 4097:0:1:SID:0:0:HEX_ID:0:0:0:URL_ENCODED:TITLE
                    // 将 URL 中的 : 替换为 %3a
                    const encodedUrl = url.replace(/:/g, '%3a');
                    const hexSid = sidCounter.toString(16).toUpperCase();
                    
                    bouquetContent += `#SERVICE 4097:0:1:${hexSid}:0:0:${CATEGORY_MAP[catName].hexId}:0:0:0:${encodedUrl}:${title}\n`;
                    bouquetContent += `#DESCRIPTION ${title}\n`;
                    sidCounter++;
                }
            }
        }

        fs.writeFileSync(path.join(OUTPUT_DIR, `subbouquet.${catName}.tv`), bouquetContent);
    });
}

convert();
