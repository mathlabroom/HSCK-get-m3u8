需要确保电脑上有 Node.js 环境，并且安装了 Playwright 即可。

如果你是想在新环境运行，或者担心依赖不全，只需要在终端（PS 窗口）执行以下两步：

🛠️ 环境对齐清单
安装核心依赖：
在你的crawler.js所在文件夹目录下执行：
npm install playwright

安装浏览器内核（如果报错找不到浏览器时才需要）：
npx playwright install chromium
