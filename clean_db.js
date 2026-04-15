const fs = require('fs');

// --- 配置区 ---
const FILES = {
    main: './国产系列.json',      // 包含多余数据的“大库”
    sub1: './日本有码.json',    // 需要剔除的子库 1
	sub2: './日本无码.json',    // 需要剔除的子库 1
};

function cleanDatabase() {
    try {
        // 1. 读取主库
        if (!fs.existsSync(FILES.main)) {
            console.log("❌ 主库文件不存在，请检查路径。");
            return;
        }
        let mainDb = JSON.parse(fs.readFileSync(FILES.main, 'utf-8'));
        const originalCount = mainDb.length;

        // 2. 读取并合并所有需要剔除的 ID
        let idsToRemove = new Set();
        [FILES.sub1, FILES.sub2].forEach(file => {
            if (fs.existsSync(file)) {
                const subDb = JSON.parse(fs.readFileSync(file, 'utf-8'));
                subDb.forEach(id => idsToRemove.add(id));
                console.log(`📖 已加载子库 ${file}，包含 ${subDb.length} 条数据`);
            }
        });

        // 3. 执行过滤 (只保留不在子库中的 ID)
        // 注意：这里用 Set 的 has 方法效率极高
        const cleanedDb = mainDb.filter(id => !idsToRemove.has(id));

        // 4. 保存结果
        fs.writeFileSync(FILES.main, JSON.stringify(cleanedDb, null, 2));

        console.log('\n✨ 处理完成！');
        console.log(`📊 原始条数: ${originalCount}`);
        console.log(`➖ 剔除条数: ${idsToRemove.size}`);
        console.log(`✅ 剩余条数: ${cleanedDb.length}`);
        
    } catch (e) {
        console.error("🚨 处理过程中出错:", e.message);
    }
}

cleanDatabase();