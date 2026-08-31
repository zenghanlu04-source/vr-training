# VR 培训排期系统安全部署说明

## 1. CloudBase 环境

确认 `config.js` 中的环境 ID 正确：

```js
window.VR_CLOUDBASE_CONFIG = {
  envId: "vr-training-d5ge0f1f26b45bf3d",
  region: "ap-shanghai",
  publishableKey: "",
};
```

如控制台要求 Publishable Key，只能填写可公开使用的 Publishable Key。严禁把 SecretId、SecretKey 或管理员 API Key 放进网页文件。

## 2. 正式身份认证

进入 CloudBase 控制台：

1. 打开 `身份认证` > `登录方式`。
2. 启用 `用户名密码登录`。
3. 停用 `匿名登录`。
4. 打开 `身份认证` > `用户管理`，由管理员手动创建 2-3 个账号。

建议账号：

- `admin`
- `ops01`
- `ops02`

密码应为 8-32 位，并包含大写字母、小写字母、数字和特殊字符中的至少三类。每个人使用独立账号，不共用密码。

网页不提供自助注册。账号密码由 CloudBase 身份认证管理，业务数据库和浏览器缓存均不保存明文密码。

## 3. PostgreSQL 表与权限

进入 `SQL 型数据库` > `SQL 编辑器`，执行最新版 `cloudbase-postgres-schema.sql`。

脚本将：

- 创建或更新 `vr_records` 表。
- 启用 PostgreSQL RLS 行级安全。
- 拒绝匿名用户访问。
- 仅允许已登录的 CloudBase 用户读写团队共享数据。
- 删除旧原型遗留的 `app_accounts` 明文账号记录。

执行脚本前建议先导出一次现有业务数据。删除的只是旧账号记录，不会删除培训、讲师或派遣数据。

## 4. 安全来源

进入 CloudBase `环境配置` > `安全来源`，添加：

```text
zenghanlu04-source.github.io
```

本地调试时再添加：

```text
127.0.0.1:8765
```

安全来源通常需要数分钟生效。

## 5. GitHub Pages

正式地址：

```text
https://zenghanlu04-source.github.io/vr-training/
```

仓库 `Settings` > `Pages` 保持：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/(root)`

## 6. 加密备份

登录后，顶部提供：

- `备份数据`：导出 AES-256-GCM 加密的 `.vrbackup` 文件。
- `恢复备份`：输入原备份密码后恢复业务数据。

备份包含培训、讲师、派遣结算和设备设置，不包含登录密码。建议每周备份一次，并分别保存到负责人电脑和可信网盘。备份密码遗失后无法恢复。

## 7. 上线验收

1. 使用管理员账号登录，状态应显示 `云端已连接`。
2. 创建一条测试培训，等待状态显示 `云端已保存`。
3. 使用另一台电脑和另一个账号登录，确认能看到测试培训。
4. 导出加密备份，并使用同一密码完成一次恢复验证。
5. 确认无误后再录入真实身份证号和银行卡号。
