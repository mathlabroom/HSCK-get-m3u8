import os, re, json, time, requests, urllib.parse
from datetime import datetime
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, timedelta

def load_config():
    default_config = {
        "BASE_URL": "http://ck0d.cc",
        "CATS": [
            {"id": "2", "name": "国产系列"},
            {"id": "21", "name": "欧美高清"},
            {"id": "26", "name": "骑兵破解"},
            {"id": "10", "name": "日本无码"},
            {"id": "7", "name": "日本有码"},
            {"id": "8", "name": "无码中文字幕"},
            {"id": "9", "name": "有码中文字幕"},
            {"id": "4", "name": "动漫"}
        ],
        "STOP_DAYS_AGO": 1
    }
    
    config_path = "config.json"
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            print("⚠️ config.json 格式错误，使用默认配置")
    return default_config

config = load_config()
BASE_URL = config["BASE_URL"]
CATS = config["CATS"]
# 刹车日期改由 JSON 控制
target_date = datetime.now() - timedelta(days=config.get("STOP_DAYS_AGO", 1))
STOP_MONTH = target_date.month
STOP_DAY = target_date.day

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
    
# --- 新增：Enigma2 转换逻辑 ---
def convert_to_e2_bouquets():
    BASE_DIR = './VideoResults'
    OUTPUT_DIR = './E2_Bouquets'
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    CATEGORY_MAP = {
        "国产系列": {"hexId": "65"}, "骑兵破解": {"hexId": "66"},
        "无码中文字幕": {"hexId": "67"}, "有码中文字幕": {"hexId": "68"},
        "日本有码": {"hexId": "69"}, "日本无码": {"hexId": "6A"},
        "欧美高清": {"hexId": "6B"}, "动漫": {"hexId": "6C"}
    }

    for cat_name, info in CATEGORY_MAP.items():
        m3u8_path = os.path.join(BASE_DIR, cat_name, f"{cat_name}.m3u8")
        if not os.path.exists(m3u8_path): continue

        # 优化点：使用上下文管理器一次性写入，减少磁盘寻道
        with open(m3u8_path, 'r', encoding='utf-8') as f_in:
            lines = f_in.read().splitlines() # 比 readlines() 快一点

        output_lines = [f"#NAME {cat_name}"]
        sid_counter = 1

        for i, line in enumerate(lines):
            if line.startswith('#EXTINF'):
                title = line.split(',')[-1].strip()
                url = lines[i+1].strip() if (i+1) < len(lines) else ""
                
                if url.startswith('http'):
                    # 批量拼接字符串，最后再 join，这比 += 字符串快得多
                    hex_sid = hex(sid_counter)[2:].upper()
                    output_lines.append(f"#SERVICE 4097:0:1:{hex_sid}:0:0:{info['hexId']}:0:0:0:{url.replace(':', '%3a')}:{title}")
                    output_lines.append(f"#DESCRIPTION {title}")
                    sid_counter += 1

        with open(os.path.join(OUTPUT_DIR, f"subbouquet.{cat_name}.tv"), 'w', encoding='utf-8') as f_out:
            f_out.write("\n".join(output_lines) + "\n")
            
# --- 修改主程序入口 ---
# --- 修改主程序入口 ---
if __name__ == "__main__":
    start_all = time.time()
    session = get_stable_session()
    report = []

    print("\n💡 提示：抓取过程中可随时按 [Ctrl + C] 停止当前分类，直接进入转换任务。")

    try:
        for cat in CATS:
            try:
                # 正常执行抓取
                res = crawl_category(cat, session)
                report.append({"name": cat["name"], **res})
            except KeyboardInterrupt:
                # 捕获 Ctrl+C
                print(f"\n\n⚠️ 手动跳过：已停止【{cat['name']}】的抓取，准备处理下一项或开始转换...")
                # 记录一个空结果防止战报报错
                report.append({"name": cat["name"], "new": "已跳过", "existed": "已跳过"})
                continue 

    except Exception as e:
        print(f"❌ 运行发生致命错误: {e}")
        
    finally:
        # 无论抓取是否完整，都会执行这里
        print(f"\n\n{'*'*50}\n🎬 收割任务总结 🎬\n{'*'*50}")
        for r in report:
            print(f"{r['name']:<12} | 新增: {r['new']:<5} | 总计: {r['existed']:<5}")
        
        # 核心：直接跳转到这里
        convert_to_e2_bouquets()
        
        print(f"\n✅ 全部任务完成！耗时: {time.time()-start_all:.1f}s")
        # --- 新增这行，防止 EXE 闪退 ---
        input("\n按回车键(Enter)退出程序...")