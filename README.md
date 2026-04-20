##  说明
1. 需要确保电脑上有 Node.js 环境，并且安装了 Playwright 即可。
2. 如果你是想在新环境运行，或者担心依赖不全，只需要在终端（PS 窗口）执行以下两步：  
  🛠️ 环境对齐清单  
  1). 在你的crawler.js所在文件夹目录下执行：  
  npm install playwright  
  2). 安装浏览器内核（如果报错找不到浏览器时才需要）：    
  npx playwright install chromium  //已改为使用edge浏览器，可自己配置浏览器目录。  
  脚本有查重功能，不会重复爬取重复视频。  
3.  运行start.bat可运行全部爬取脚本，也可powershell运行node ****.js运行单个js。
  
##  备注
const CONFIG = {  
    baseUrl: 'http://1771ck.cc', //网址  
    categories: [  
        //{ id: '26', name: '骑兵破解', stopM: 3, stopD: 31 },      //1771ck.cc/vodtype/15.html中的15，可以设置爬取结束日期  
        { id: '8',  name: '无码中文字幕', stopM: 3, stopD: 28 }  
    ],  
    saveDir: './VideoResults',  
    dbFile: './history_db.json'  
};
