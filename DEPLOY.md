# VR 培训排期系统部署说明

## 1. CloudBase 环境

已创建腾讯云 CloudBase 环境后，先确认 `config.js` 中环境 ID 正确：

```js
window.VR_CLOUDBASE_CONFIG = {
  envId: "vr-training-d5ge0f1f26b45bf3d",
  region: "ap-shanghai",
  publishableKey: "",
};
```

如果后续腾讯云控制台要求填写公开访问密钥，把对应的 Publishable Key 填到 `publishableKey`。

## 2. PostgreSQL 表

进入 CloudBase 控制台左侧 `SQL 型数据库`，打开 `SQL 编辑器`，执行 `cloudbase-postgres-schema.sql`。

这张 `vr_records` 表用来保存：

- 培训记录
- 师资信息
- 讲师派遣结算
- 设备总数设置

你已经执行过建表 SQL 的话，这一步不用重复。

## 3. 系统账号

现在采用低成本内部账号方案，不需要在 CloudBase 身份认证里创建账号。

打开系统登录弹窗后，直接填写你想要的账号和密码，点击 `创建账号` 即可。账号会保存到 CloudBase 的 `vr_records` 表里，后续同事用同一个账号密码登录。

建议只创建 2-3 个内部账号，例如：

- `admin`
- `ops01`
- `ops02`

这个方案适合小团队内部使用，重点是低成本和数据同步；不要把账号密码发给无关人员。

如果页面提示云端连接失败，但你仍然想把账号和业务数据同步到 CloudBase，可以在 CloudBase `身份认证` 里开启 `匿名登录`。业务账号仍然在系统弹窗里创建，匿名登录只用于让前端拿到云端读写权限。

## 4. 安全来源

进入 CloudBase 的环境配置或安全配置，把下面地址加入安全来源/安全域名：

```text
http://127.0.0.1:8765
```

如果后续部署了正式域名，也要把正式域名加进去，例如：

```text
https://你的正式域名
```

没有加入安全来源时，浏览器里通常会显示 `Failed to fetch`。

## 5. 本地检查

在当前目录启动静态服务后打开页面：

```bash
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/'||u==='')u='/index.html';const file=path.normalize(path.join(root,u));fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});}).listen(8765,'127.0.0.1',()=>console.log('http://127.0.0.1:8765/'));"
```

打开：

```text
http://127.0.0.1:8765/?v=20260828d
```

登录后右上角显示“云端已连接”，数据就会保存到 CloudBase。

## 6. 部署上线

国内使用建议继续放在腾讯云：

- `静态网站托管`：上传当前文件夹
- 或 `CloudBase Hosting`：用 CloudBase CLI 部署

需要包含这些文件：

- `index.html`
- `app.js`
- `styles.css`
- `config.js`

部署完成后，把正式域名加入 CloudBase 安全域名/HTTP Referer 白名单，再用账号登录测试一次新增、编辑、删除。
