const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// --- 配置区 ---
const CHECK_CONFIG = {
    csvFile: './国产系列.csv',      // 索引表
    m3u8File: './VideoResults/国产系列/国产系列_清单.m3u8', // 合并后的结果文件
    missingReport: './Missing_Videos.txt',   // 索引中有，但文件中没搜到的
    unmatchedReport: './Unmatched_m3u8.txt'  // 文件中有，但无法对应到索引标题的
};

function verifyFullSpectrum() {
    console.log(chalk.cyan("🔍 开始全维度双向核对..."));

    if (!fs.existsSync(CHECK_CONFIG.m3u8File) || !fs.existsSync(CHECK_CONFIG.csvFile)) {
        console.log(chalk.red("❌ 错误：CSV 或 m3u8 文件路径不存在。"));
        return;
    }

    // 1. 加载并预处理 m3u8
    // 将 m3u8 按条目切割成数组，每条包含标题行和链接行
    const m3u8Raw = fs.readFileSync(CHECK_CONFIG.m3u8File, 'utf-8');
    const m3u8Lines = m3u8Raw.split('\n');
    const m3u8Entries = []; // 存储所有 EXTINF 标题行
    m3u8Lines.forEach(line => {
        if (line.startsWith('#EXTINF')) {
            // 提取逗号后面的标题部分
            const titlePart = line.split(',')[1] || "";
            m3u8Entries.push(titlePart.trim());
        }
    });

    // 2. 加载 CSV 索引
    const csvContent = fs.readFileSync(CHECK_CONFIG.csvFile, 'utf-8');
    const csvLines = csvContent.split('\n');
    const csvData = [];
    csvLines.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2 && parts[0] !== 'ID' && parts[0].trim() !== '') {
            csvData.push({
                id: parts[0].trim(),
                title: parts[1].trim()
            });
        }
    });

    // --- 维度一：核对缺失 (CSV -> m3u8) ---
    // 逻辑：拿 CSV 的标题去 m3u8 每一行里找，完全没出现的记录下来
    const missingItems = [];
    const matchedM3u8Indices = new Set(); // 记录哪些 m3u8 条目被匹配到了

    csvData.forEach(csvItem => {
        let found = false;
        m3u8Entries.forEach((mTitle, index) => {
            if (mTitle.includes(csvItem.title)) {
                found = true;
                matchedM3u8Indices.add(index); // 标记这一行 m3u8 已“名花有主”
            }
        });
        if (!found) {
            missingItems.push(`ID: ${csvItem.id} | 标题: ${csvItem.title}`);
        }
    });

    // --- 维度二：核对冗余/未匹配 (m3u8 -> CSV) ---
    // 逻辑：看哪些 m3u8 的行没有被任何一个 CSV 标题“认领”
    const unmatchedM3u8 = [];
    m3u8Entries.forEach((mTitle, index) => {
        if (!matchedM3u8Indices.has(index)) {
            unmatchedM3u8.push(mTitle);
        }
    });

    // 3. 输出报告
    fs.writeFileSync(CHECK_CONFIG.missingReport, missingItems.join('\n'));
    fs.writeFileSync(CHECK_CONFIG.unmatchedReport, unmatchedM3u8.join('\n'));

    console.log(chalk.blue(`------------------------------------`));
    console.log(chalk.white(`📊 CSV 总数: ${csvData.length}`));
    console.log(chalk.white(`📊 m3u8 条数: ${m3u8Entries.length}`));
    console.log(chalk.red(`❌ 缺失数量 (未爬取): ${missingItems.length}`));
    console.log(chalk.yellow(`⚠️ 未匹配数量 (多余或改名): ${unmatchedM3u8.length}`));
    
    console.log(chalk.green(`\n📂 报告已生成：`));
    console.log(`1. ${CHECK_CONFIG.missingReport} (去补爬这些)`);
    console.log(`2. ${CHECK_CONFIG.unmatchedReport} (去检查这些)`);
}

verifyFullSpectrum();