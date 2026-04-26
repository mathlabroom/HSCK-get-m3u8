import os, re, json, time, requests, urllib.parse
from datetime import datetime
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, timedelta

# 自动计算“刹车日期”：设置为昨天
# 这样脚本每天运行都会自动更新标准，无需手动修改
target_date = datetime.now() - timedelta(days=1)
STOP_MONTH = target_date.month
STOP_DAY = target_date.day

print(f"📅 自动识别抓取标准：{STOP_MONTH}月{STOP_DAY}日之后的数据")

# --- 配置区 ---
BASE_URL = "http://ck0h.cc/"

CATS = [
    {"id": "2", "name": "国产系列"},
    {"id": "21", "name": "欧美高清"},
    {"id": "26", "name": "骑兵破解"},
    {"id": "10", "name": "日本无码"},
    {"id": "7", "name": "日本有码"},
    {"id": "8", "name": "无码中文字幕"},
    {"id": "9", "name": "有码中文字幕"},
    {"id": "4", "name": "动漫"}
]

def get_stable_session():
    session = requests.Session()
    retries = Retry(total=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount('http://', HTTPAdapter(max_retries=retries))
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Referer": BASE_URL
    })
    return session

def save_and_update(path, new_lines, db_list, db_path):
    """读取、去重、排序、保存"""
    old_content = []
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()[1:] 
            old_content = ["".join(lines[i:i+2]) for i in range(0, len(lines), 2)]

    # 合并去重并按名称排序
    combined = list(set(old_content + new_lines))
    combined.sort()

    with open(path, 'w', encoding='utf-8') as f:
        f.write("#EXTM3U\n" + "".join(combined))
    
    with open(db_path, 'w', encoding='utf-8') as f:
        json.dump(db_list, f, ensure_ascii=False)

def crawl_category(cat, session):
    cat_id, cat_name = cat["id"], cat["name"]
    db_file = f"./{cat_name}.json"
    save_dir = f"./VideoResults/{cat_name}"
    save_path = f"{save_dir}/{cat_name}.m3u8"
    os.makedirs(save_dir, exist_ok=True)
    
    # 加载数据库并转为 set 加速对比
    db = json.load(open(db_file, 'r', encoding='utf-8')) if os.path.exists(db_file) else []
    db_set = set(str(i) for i in db)
    
    print(f"\n{'='*50}\n📂 分类启动: 【{cat_name}】 | 库内: {len(db_set)}\n{'='*50}")

    stats = {"new": 0, "existed": 0}
    expire_count = 0

    for p in range(1, 50): # 翻页深度
        url = f"{BASE_URL}/vodtype/{cat_id}-{p}.html"
        print(f"🌐 正在扫描第 {p} 页...")
        
        try:
            res = session.get(url, timeout=15)
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            
            # 1:1 复刻 JS 的选择器逻辑
            li_list = soup.select('.stui-vodlist li')
            if not li_list: break

            page_new_items = []
            for li in li_list:
                a_tag = li.select_one('h4.title a')
                sub_tag = li.select_one('p.sub')
                if not a_tag or not sub_tag: continue

                title = a_tag.get_text(strip=True)
                href = a_tag.get('href', '')
                date_match = re.search(r'(\d{2}-\d{2})', sub_tag.get_text())
                if not date_match or 'vod' not in href: continue
                
                date_val = date_match.group(1)
                m, d = map(int, date_val.split('-'))

                # 提取并清洗 ID
                if href.startswith('http'):
                    relative_link = href.split('.cc')[-1] if '.cc' in href else href
                else:
                    relative_link = href
                
                v_id_match = re.search(r'vodplay/(\d+)', relative_link)
                if not v_id_match: continue
                v_id = v_id_match.group(1)

                # --- 核心判定逻辑 ---
                is_old = (m < STOP_MONTH or (m == STOP_MONTH and d < STOP_DAY))
                
                if v_id in db_set or is_old:
                    if is_old:
                        expire_count += 1
                        if expire_count >= 3:
                            print(f"  🛑 连续 3 个旧资源 [{date_val}]，停止收割该分类。")
                            if page_new_items: save_and_update(save_path, page_new_items, db, db_file)
                            return stats
                    else:
                        # 是库里的旧资源，重置刹车但跳过
                        stats["existed"] += 1
                        # 如果你想“撞库即停”，取消下面一行的注释
                        # return stats 
                    continue

                # --- 发现新货，进入详情页 ---
                expire_count = 0 
                try:
                    full_link = urllib.parse.urljoin(BASE_URL, relative_link)
                    p_res = session.get(full_link, timeout=10)
                    # 尝试捕获 m3u8 地址
                    m3u8_find = re.search(r'https?[:\\]+[^"\']+\.m3u8[^"\']*', p_res.text, re.I)
                    
                    if m3u8_find:
                        m3u8 = m3u8_find.group(0).replace('\\', '')
                        if "%3A" in m3u8: m3u8 = urllib.parse.unquote(m3u8)
                        
                        page_new_items.append(f"#EXTINF:-1,{title} [{date_val}]\n{m3u8}\n")
                        db.append(v_id)
                        db_set.add(v_id)
                        stats["new"] += 1
                        print(f"  ✅ [捕获] {date_val} | {title[:20]}")
                except:
                    continue

            # 每页跑完存一次盘
            if page_new_items:
                save_and_update(save_path, page_new_items, db, db_file)
            
            time.sleep(1) # 稍微歇下，防封

        except Exception as e:
            print(f"  🚨 扫描页面出错: {e}")
            break

    return stats

if __name__ == "__main__":
    start_all = time.time()
    session = get_stable_session()
    report = []

    try:
        for cat in CATS:
            res = crawl_category(cat, session)
            report.append({"name": cat["name"], **res})
    finally:
        # 最终战报
        print(f"\n\n{'*'*50}\n{' '*15}🎬 收割任务总结 🎬\n{'*'*50}")
        print(f"{'分类':<12} | {'新增':<6} | {'已存在':<6}")
        for r in report:
            print(f"{r['name']:<12} | {r['new']:<8} | {r['existed']:<8}")
        print(f"{'*'*50}\n总耗时: {time.time()-start_all:.1f}s")