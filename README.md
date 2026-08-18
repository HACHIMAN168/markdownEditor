# Markdown 编辑器

一个纯静态的 Markdown 笔记工具,无框架、无构建步骤、无后端。所有笔记保存在浏览器 LocalStorage 中。

## 功能

- 三栏布局:笔记列表(按更新时间倒序) / 编辑器 / 实时预览
- Markdown 实时渲染(基于 `marked`,CDN 加载)与代码语法高亮(基于 `highlight.js`)
- 自动保存(500ms 防抖),切换与关闭页面时也会保存
- 搜索过滤标题与内容(不区分大小写)
- 删除需二次确认,不可恢复
- 深色主题,代码块自动换行

## 使用

直接用浏览器打开 `index.html`,或在任意静态服务器下访问(如 GitHub Pages)。

## 在线地址

<https://hachiman168.github.io/markdownEditor/>

## 技术说明

- 纯静态前端:HTML + CSS + 原生 JavaScript(IIFE,无 ES 模块)
- 运行时依赖仅来自 CDN(`jsdelivr`):`marked`、`highlight.js`
- 数据存储:LocalStorage,键 `markdownEditor.notes.v1`,格式为 JSON 数组
- 笔记结构:`{id, title, content, createTime, updateTime}`
