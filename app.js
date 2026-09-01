const today = startOfDay(new Date());
const dayMs = 24 * 60 * 60 * 1000;
const timelineStart = addDays(today, -1);
const timelineDayCount = 16;
const businessPeople = ["马帅", "武艺凡", "邢家琛", "熊俊宇", "师荣", "张伸", "张智真", "吴瑞", "张嘉慧"];
const statuses = ["待排期", "已确认", "运输中", "使用中", "已完成"];
const localStorageKey = "vr_schedule_manager_state_v1";
const localAccountKey = "vr_schedule_manager_accounts_v1";
const rememberLoginKey = "vr_schedule_manager_remember_login_v1";
const backupFormat = "vr-training-encrypted-backup";
const backupVersion = 1;
const backupIterations = 250000;
const defaultTeacherRates = {
  "普通": 400,
  "铜牌": 500,
  "银牌": 600,
  "金牌": 700,
  "钻石": 800,
};

let totalDevices = 600;
let teacherRates = { ...defaultTeacherRates };
let currentPage = "overview";
let selectedDispatchKeys = new Set();
let draftSources = [
  { type: "北京仓", count: 30 },
  { type: "待调配", count: 20 },
];

let trainings = buildSampleTrainings();
let editingTrainingId = null;
let pendingDeleteTrainingId = null;
let editingTeacherId = null;
let editingDispatchKey = null;
let cloudbaseApp = null;
let cloudbaseAuth = null;
let cloudbaseDb = null;
let storageMode = "locked";
let currentAppUser = null;
let pendingRestoreBackup = null;

let dispatchSettlements = {
  "T001-S001": {
    workflowScore: 96,
    surveyScore: 98,
    reimbursement: 260,
    reimbursementStatus: "已付款",
    remoteAllowance: 0,
    adjustment: 100,
    settlementStatus: "已结算",
    note: "",
  },
  "T003-S002": {
    workflowScore: 92,
    surveyScore: 95,
    reimbursement: 180,
    reimbursementStatus: "待审核",
    remoteAllowance: 0,
    adjustment: 0,
    settlementStatus: "待结算",
    note: "",
  },
};

let teachers = [
  {
    id: "S001",
    name: "刘明",
    phone: "13800020001",
    city: "安徽合肥",
    travelRange: "华东地区",
    sessions: 36,
    refusals: 1,
    cancellations: 0,
    complaints: 0,
    rating: "金牌",
    teacherStatus: "正常",
    idCard: "隐藏",
    bankCard: "隐藏",
    bankName: "隐藏",
    profile: "课堂组织稳定，适合省级农业院校现场培训。",
  },
  {
    id: "S002",
    name: "王倩",
    phone: "13800020002",
    city: "河南郑州",
    travelRange: "全国",
    sessions: 52,
    refusals: 0,
    cancellations: 1,
    complaints: 0,
    rating: "钻石",
    teacherStatus: "正常",
    idCard: "隐藏",
    bankCard: "隐藏",
    bankName: "隐藏",
    profile: "执行力强，适合多讲师协同和高强度排期。",
  },
  {
    id: "S003",
    name: "陈浩",
    phone: "13800020003",
    city: "河北保定",
    travelRange: "华北地区",
    sessions: 24,
    refusals: 2,
    cancellations: 0,
    complaints: 1,
    rating: "银牌",
    teacherStatus: "正常",
    idCard: "隐藏",
    bankCard: "隐藏",
    bankName: "隐藏",
    profile: "设备沟通细致，适合华北地区中小班培训。",
  },
  {
    id: "S004",
    name: "赵雪",
    phone: "13800020004",
    city: "湖南长沙",
    travelRange: "华中地区",
    sessions: 18,
    refusals: 1,
    cancellations: 1,
    complaints: 0,
    rating: "铜牌",
    teacherStatus: "离职",
    idCard: "隐藏",
    bankCard: "隐藏",
    bankName: "隐藏",
    profile: "历史培训经验较多，目前状态为离职。",
  },
];

const sampleText = `培训目的地：安徽省合肥市长江西路130号安徽农业大学
培训班级名称：2026 年芜湖市繁昌区高素质农民稻渔综合种养培训班
机构名称：安徽农业大学
培训人数：50
需设备总数：50
培训开始时间：2026年8月15日
需到达时间：2026年8月14日
上课/住宿地点详细地址：安徽省合肥市长江西路130号安徽农业大学朝阳楼202
设备邮寄地址：安徽省合肥市长江西路130号安徽农业大学
收货人：田礼欣
电话：13555561993`;

let previewData = {};

function getCloudBaseConfig() {
  return window.VR_CLOUDBASE_CONFIG || {};
}

function hasCloudBaseConfig() {
  const config = getCloudBaseConfig();
  return Boolean(config.envId && window.cloudbase);
}

function updateStorageStatus(message) {
  const status = document.querySelector("#connection-status");
  if (!status) return;
  status.textContent = message || (storageMode === "cloud" ? "云端已连接" : "请登录");
  status.classList.toggle("cloud", storageMode === "cloud");
  document.querySelector("#logout-button")?.classList.toggle("collapsed", !currentAppUser);
  document.querySelector("#backup-data")?.classList.toggle("collapsed", !currentAppUser);
  document.querySelector("#restore-data")?.classList.toggle("collapsed", !currentAppUser);
  const userLabel = document.querySelector("#current-user");
  if (userLabel) {
    userLabel.textContent = currentAppUser ? `当前账号：${currentAppUser}` : "";
    userLabel.classList.toggle("collapsed", !currentAppUser);
  }
}

function getDataSnapshot() {
  return { totalDevices, teacherRates, trainings, teachers, dispatchSettlements };
}

function applyDataSnapshot(snapshot = {}) {
  if (Number.isFinite(Number(snapshot.totalDevices))) totalDevices = Number(snapshot.totalDevices);
  if (snapshot.teacherRates && typeof snapshot.teacherRates === "object") {
    teacherRates = normalizeTeacherRates(snapshot.teacherRates);
  }
  if (Array.isArray(snapshot.trainings)) trainings = snapshot.trainings;
  if (Array.isArray(snapshot.teachers)) teachers = snapshot.teachers;
  if (snapshot.dispatchSettlements && typeof snapshot.dispatchSettlements === "object") {
    dispatchSettlements = snapshot.dispatchSettlements;
  }
  const totalInput = document.querySelector("#total-devices");
  if (totalInput) totalInput.value = totalDevices;
}

function loadLocalData() {
  localStorage.removeItem(localStorageKey);
  localStorage.removeItem(localAccountKey);
  localStorage.removeItem(rememberLoginKey);
}

function saveLocalData() {
  // Sensitive teacher records are never persisted in browser storage.
}

async function initPersistence() {
  loadLocalData();
  if (!hasCloudBaseConfig()) {
    storageMode = "locked";
    updateStorageStatus("云端未配置");
    openAuthModal("系统未连接云数据库，为保护敏感信息，当前已停止本地模式。", true);
    return;
  }

  try {
    const config = getCloudBaseConfig();
    cloudbaseApp = window.cloudbase.init({
      env: config.envId,
      region: config.region || "ap-shanghai",
      accessKey: config.publishableKey || undefined,
    });
    cloudbaseAuth = resolveCloudBaseAuth(cloudbaseApp);
    cloudbaseDb = cloudbaseApp.rdb();
    const currentUser = await getCloudBaseCurrentUser();
    if (!currentUser) {
      storageMode = "locked";
      updateStorageStatus("请登录");
      openAuthModal();
      return;
    }
    currentAppUser = getCloudBaseUserLabel(currentUser);
    storageMode = "cloud";
    updateStorageStatus("云端已连接");
    await loadCloudData();
    closeAuthModal();
  } catch (error) {
    storageMode = "locked";
    updateStorageStatus("云端初始化失败");
    console.error(error);
    openAuthModal("CloudBase 初始化失败。为保护敏感信息，本地离线模式已停用，请检查环境 ID、安全来源和身份认证配置。", true);
  }
}

function resolveCloudBaseAuth(app) {
  const auth = app?.auth;
  if (!auth) return null;
  if (typeof auth.signInWithPassword === "function" || typeof auth.getSession === "function") return auth;
  return typeof auth === "function" ? auth.call(app) : auth;
}

async function loadCloudData() {
  if (!cloudbaseDb || storageMode !== "cloud") return;
  let rows = [];
  try {
    const result = await cloudbaseDb.from("vr_records").select("collection,record_key,data");
    if (result?.error) throw result.error;
    rows = normalizeCloudRows(result);
  } catch (error) {
    updateStorageStatus("云端读取失败");
    console.error(error);
    return;
  }
  if (!rows.length) {
    await seedCloudData();
    return;
  }

  const nextTrainings = [];
  const nextTeachers = [];
  const nextSettlements = {};
  let nextTotalDevices = totalDevices;
  let nextTeacherRates = teacherRates;
  rows.forEach((row) => {
    if (row.collection === "settings" && row.record_key === "main") {
      nextTotalDevices = Number(row.data.totalDevices) || totalDevices;
      nextTeacherRates = normalizeTeacherRates(row.data.teacherRates || teacherRates);
    }
    if (row.collection === "trainings") nextTrainings.push(row.data);
    if (row.collection === "teachers") nextTeachers.push(row.data);
    if (row.collection === "dispatch_settlements") nextSettlements[row.record_key] = row.data;
  });
  applyDataSnapshot({
    totalDevices: nextTotalDevices,
    teacherRates: nextTeacherRates,
    trainings: nextTrainings.length ? nextTrainings.sort((a, b) => Number(a.serial || 0) - Number(b.serial || 0)) : trainings,
    teachers: nextTeachers.length ? nextTeachers : teachers,
    dispatchSettlements: Object.keys(nextSettlements).length ? nextSettlements : dispatchSettlements,
  });
}

async function seedCloudData() {
  await Promise.all([
    saveSettings(),
    ...trainings.map((item) => saveTrainingRecord(item)),
    ...teachers.map((item) => saveTeacherRecord(item)),
    ...Object.entries(dispatchSettlements).map(([key, value]) => saveDispatchSettlementRecord(key, value)),
  ]);
}

async function upsertRecord(collection, recordKey, data) {
  if (!cloudbaseDb || storageMode !== "cloud") return false;
  try {
    const result = await cloudbaseDb
      .from("vr_records")
      .upsert({ collection, record_key: recordKey, data }, { onConflict: "collection,record_key" });
    if (result?.error) throw result.error;
  } catch (error) {
    updateStorageStatus("云端保存失败");
    console.error(error);
    return false;
  }
  updateStorageStatus("云端已保存");
  return true;
}

async function deleteRecord(collection, recordKey) {
  if (!cloudbaseDb || storageMode !== "cloud") return false;
  try {
    const result = await cloudbaseDb
      .from("vr_records")
      .delete()
      .eq("collection", collection)
      .eq("record_key", recordKey);
    if (result?.error) throw result.error;
  } catch (error) {
    updateStorageStatus("云端删除失败");
    console.error(error);
    return false;
  }
  updateStorageStatus("云端已保存");
  return true;
}

function saveSettings() {
  return upsertRecord("settings", "main", { totalDevices, teacherRates });
}

function saveTrainingRecord(item) {
  return upsertRecord("trainings", item.id, item);
}

function saveTeacherRecord(item) {
  return upsertRecord("teachers", item.id, item);
}

function saveDispatchSettlementRecord(key, data) {
  return upsertRecord("dispatch_settlements", key, data);
}

function normalizeTeacherRates(rates = {}) {
  return Object.fromEntries(
    Object.entries(defaultTeacherRates).map(([rating, fallback]) => {
      const value = Number(rates[rating]);
      return [rating, Number.isFinite(value) && value >= 0 ? value : fallback];
    }),
  );
}

function normalizeCloudRows(result) {
  const data = result?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(result?.records)) return result.records;
  return [];
}

async function deleteTrainingRecord(id) {
  await deleteRecord("trainings", id);
  const settlementKeys = Object.keys(dispatchSettlements).filter((key) => key.startsWith(`${id}-`));
  settlementKeys.forEach((key) => delete dispatchSettlements[key]);
  await Promise.all(settlementKeys.map((key) => deleteRecord("dispatch_settlements", key)));
}

function openAuthModal(message = "", setupOnly = false) {
  document.querySelector("#auth-modal")?.classList.remove("collapsed");
  const messageEl = document.querySelector("#auth-message");
  if (messageEl) messageEl.textContent = message;
  document.querySelector("#auth-email")?.toggleAttribute("disabled", setupOnly);
  document.querySelector("#auth-password")?.toggleAttribute("disabled", setupOnly);
  document.querySelector("#login-button")?.toggleAttribute("disabled", setupOnly);
}

function closeAuthModal() {
  document.querySelector("#auth-modal")?.classList.add("collapsed");
}

async function handleAuth() {
  const account = document.querySelector("#auth-email").value.trim();
  const password = document.querySelector("#auth-password").value;
  const message = document.querySelector("#auth-message");
  if (!account || !password) {
    message.textContent = "请填写账号和密码。";
    return;
  }
  if (!cloudbaseAuth || !cloudbaseDb) {
    message.textContent = "云端尚未连接，请稍后刷新或检查 CloudBase 配置。";
    return;
  }

  const loginButton = document.querySelector("#login-button");
  loginButton.disabled = true;
  loginButton.textContent = "登录中...";
  message.textContent = "正在验证账号...";
  try {
    let loginResult = null;
    const credentials = buildPasswordCredentials(account, password);
    if (typeof cloudbaseAuth.signInWithPassword === "function") {
      loginResult = await cloudbaseAuth.signInWithPassword(credentials);
    } else if (typeof cloudbaseAuth.signInWithUsernameAndPassword === "function") {
      await cloudbaseAuth.signInWithUsernameAndPassword(account, password);
    } else if (typeof cloudbaseAuth.signIn === "function") {
      await cloudbaseAuth.signIn(credentials);
    } else {
      throw new Error("当前 CloudBase SDK 不支持账号密码登录");
    }
    if (loginResult?.error) throw loginResult.error;
    const user = await getCloudBaseCurrentUser();
    if (!user && !loginResult?.data?.user) throw new Error("登录状态未建立，请重试");
    const authedUser = user || loginResult.data.user;
    currentAppUser = getCloudBaseUserLabel(authedUser, account);
    storageMode = "cloud";
    updateStorageStatus("云端已连接");
    await loadCloudData();
    renderAll();
    document.querySelector("#auth-password").value = "";
    closeAuthModal();
  } catch (error) {
    storageMode = "locked";
    currentAppUser = null;
    updateStorageStatus("登录失败");
    message.textContent = await getCloudErrorMessage(error, account);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "登录";
  }
}

function buildPasswordCredentials(account, password) {
  const trimmed = account.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { email: trimmed, password };
  }
  if (/^1[3-9]\d{9}$/.test(trimmed)) {
    return { phone: trimmed, password };
  }
  return { username: trimmed, password };
}

async function logout() {
  try {
    await cloudbaseAuth?.signOut?.();
  } catch (error) {
    console.warn("CloudBase 退出登录失败", error);
  }
  currentAppUser = null;
  storageMode = "locked";
  trainings = [];
  teachers = [];
  dispatchSettlements = {};
  updateStorageStatus("已退出");
  renderAll();
  openAuthModal();
}

async function getCloudBaseCurrentUser() {
  if (!cloudbaseAuth) return null;
  if (typeof cloudbaseAuth.getSession === "function") {
    const sessionResult = await cloudbaseAuth.getSession();
    const sessionUser = sessionResult?.data?.session?.user || sessionResult?.session?.user;
    if (sessionUser) return sessionUser;
  }
  if (typeof cloudbaseAuth.getUser === "function") {
    const userResult = await cloudbaseAuth.getUser();
    const authUser = userResult?.data?.user || userResult?.user;
    if (authUser) return authUser;
  }
  if (typeof cloudbaseAuth.getCurrentUser === "function") {
    const user = await cloudbaseAuth.getCurrentUser();
    if (user) return user;
  }
  return cloudbaseAuth.currentUser || null;
}

function getCloudBaseUserLabel(user, fallback = "") {
  return user?.username || user?.name || user?.email || user?.uid || fallback || "已认证用户";
}

async function getCloudErrorMessage(error, account = "") {
  const raw = extractErrorText(error);
  const errorCode = extractCloudErrorCode(error);
  const errorDetail = `${raw} ${errorCode}`;
  if (/failed to fetch|cors|cross-origin|permission denied/i.test(raw)) {
    return "连接 CloudBase 失败。请确认安全来源已添加 zenghanlu04-source.github.io，并检查 PostgreSQL 的登录用户权限。";
  }
  if (/provider|not enabled|unauthorized_client/i.test(raw)) {
    return "CloudBase 用户名密码登录未开启，请在身份认证的登录方式中启用。";
  }
  if (/user.?not.?found|not.?exist|用户不存在/i.test(errorDetail)) {
    return `CloudBase 未找到账号“${account}”。请核对用户管理中的“用户名”列，不要输入用户 ID。`;
  }
  if (/invalid|password|credential/i.test(errorDetail)) {
    return `账号或密码不正确（${errorCode || "CloudBase 未返回错误代码"}）。请确认输入的是用户管理里创建时填写的用户名、邮箱或手机号，不是用户 ID。`;
  }
  return `${raw || "登录失败，请检查账号、密码、CloudBase 安全来源和身份认证设置。"}${errorCode ? `（${errorCode}）` : ""}`;
}

function extractCloudErrorCode(error) {
  if (!error || typeof error === "string") return "";
  const code = [error.category, error.code, error.status, error.name]
    .find((value) => typeof value === "string" && value.trim());
  return code || "";
}

function extractErrorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const direct = [
    error.message,
    error.error_description,
    error.errorDescription,
    error.description,
    error.helpMessage,
    error.msg,
    error.code,
    error.error,
  ].find((value) => typeof value === "string" && value.trim());
  if (direct) return direct;
  if (error.originError && error.originError !== error) return extractErrorText(error.originError);
  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    return String(error);
  }
}

function openBackupModal(mode, envelope = null) {
  pendingRestoreBackup = mode === "restore" ? envelope : null;
  const modal = document.querySelector("#backup-modal");
  const title = document.querySelector("#backup-modal-title");
  const desc = document.querySelector("#backup-modal-desc");
  const button = document.querySelector("#confirm-backup");
  const password = document.querySelector("#backup-password");
  const message = document.querySelector("#backup-message");
  title.textContent = mode === "restore" ? "恢复加密备份" : "导出加密备份";
  desc.textContent = mode === "restore"
    ? "输入创建备份时使用的密码，验证后可恢复数据。"
    : "备份包含培训、讲师和派遣数据，不包含登录密码。";
  button.textContent = mode === "restore" ? "验证并恢复" : "导出备份";
  button.dataset.mode = mode;
  password.value = "";
  message.textContent = "";
  modal.classList.remove("collapsed");
  password.focus();
}

function closeBackupModal() {
  document.querySelector("#backup-modal")?.classList.add("collapsed");
  document.querySelector("#backup-password").value = "";
  document.querySelector("#backup-message").textContent = "";
  pendingRestoreBackup = null;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveBackupKey(password, salt, usages) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: backupIterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function createEncryptedBackup(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, ["encrypt"]);
  const payload = {
    format: backupFormat,
    version: backupVersion,
    createdAt: new Date().toISOString(),
    exportedBy: currentAppUser,
    data: getDataSnapshot(),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    format: backupFormat,
    version: backupVersion,
    encrypted: true,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: backupIterations,
    createdAt: payload.createdAt,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBackup(envelope, password) {
  if (envelope?.format !== backupFormat || envelope?.version !== backupVersion || !envelope?.encrypted) {
    throw new Error("这不是有效的 VR 培训系统加密备份文件。");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveBackupKey(password, salt, ["decrypt"]);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch (error) {
    throw new Error("备份密码不正确，或备份文件已经损坏。");
  }
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  validateBackupPayload(payload);
  return payload;
}

function validateBackupPayload(payload) {
  const data = payload?.data;
  if (
    payload?.format !== backupFormat
    || payload?.version !== backupVersion
    || !data
    || !Array.isArray(data.trainings)
    || !Array.isArray(data.teachers)
    || !data.dispatchSettlements
    || typeof data.dispatchSettlements !== "object"
  ) {
    throw new Error("备份内容不完整，无法恢复。");
  }
}

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(text, filename, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function backupFilename() {
  const stamp = new Date().toLocaleString("sv-SE").replace(" ", "_").replaceAll(":", "-");
  return `VR培训排期备份_${stamp}.vrbackup`;
}

async function handleBackupAction() {
  const password = document.querySelector("#backup-password").value;
  const message = document.querySelector("#backup-message");
  const button = document.querySelector("#confirm-backup");
  const mode = button.dataset.mode || "export";
  if (password.length < 8) {
    message.textContent = "备份密码至少需要8位。";
    return;
  }
  button.disabled = true;
  message.textContent = mode === "restore" ? "正在验证备份..." : "正在加密数据...";
  try {
    if (mode === "export") {
      const envelope = await createEncryptedBackup(password);
      downloadJsonFile(envelope, backupFilename());
      closeBackupModal();
      updateStorageStatus("加密备份已导出");
      return;
    }
    const payload = await decryptBackup(pendingRestoreBackup, password);
    const { trainings: nextTrainings, teachers: nextTeachers } = payload.data;
    const confirmed = window.confirm(
      `备份包含 ${nextTrainings.length} 场培训、${nextTeachers.length} 位讲师。确认用该备份覆盖当前业务数据吗？`,
    );
    if (!confirmed) {
      message.textContent = "已取消恢复，当前数据没有变化。";
      return;
    }
    message.textContent = "正在恢复云端数据，请勿关闭页面...";
    await restoreBackupPayload(payload.data);
    closeBackupModal();
    updateStorageStatus("备份恢复完成");
  } catch (error) {
    message.textContent = String(error?.message || error || "备份操作失败");
  } finally {
    button.disabled = false;
  }
}

async function handleRestoreFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const envelope = JSON.parse(await file.text());
    if (envelope?.format !== backupFormat || !envelope?.encrypted) throw new Error("文件格式不正确。");
    openBackupModal("restore", envelope);
  } catch (error) {
    window.alert(String(error?.message || error || "无法读取备份文件"));
  }
}

async function restoreBackupPayload(snapshot) {
  const previousTrainings = [...trainings];
  const previousTeachers = [...teachers];
  const previousSettlementKeys = Object.keys(dispatchSettlements);
  const nextTrainingIds = new Set(snapshot.trainings.map((item) => item.id));
  const nextTeacherIds = new Set(snapshot.teachers.map((item) => item.id));
  const nextSettlementKeys = new Set(Object.keys(snapshot.dispatchSettlements));
  const operations = [
    ...previousTrainings.filter((item) => !nextTrainingIds.has(item.id)).map((item) => deleteRecord("trainings", item.id)),
    ...previousTeachers.filter((item) => !nextTeacherIds.has(item.id)).map((item) => deleteRecord("teachers", item.id)),
    ...previousSettlementKeys.filter((key) => !nextSettlementKeys.has(key)).map((key) => deleteRecord("dispatch_settlements", key)),
    upsertRecord("settings", "main", {
      totalDevices: Number(snapshot.totalDevices) || 0,
      teacherRates: normalizeTeacherRates(snapshot.teacherRates || teacherRates),
    }),
    ...snapshot.trainings.map((item) => upsertRecord("trainings", item.id, item)),
    ...snapshot.teachers.map((item) => upsertRecord("teachers", item.id, item)),
    ...Object.entries(snapshot.dispatchSettlements).map(([key, value]) => upsertRecord("dispatch_settlements", key, value)),
  ];
  const results = await Promise.all(operations);
  if (results.some((result) => result !== true)) throw new Error("部分数据未能写入云端，请检查连接后重试。");
  applyDataSnapshot(snapshot);
  renderAll();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function makeTraining(id, owner, city, name, devices, shipDate, arriveDate, startDate, endDate, source, status, extra = {}) {
  const province = city.slice(0, 2);
  return { id, serial: extra.serial || serialFromTrainingId(id), owner, city, province, name, devices, shipDate, arriveDate, startDate, endDate, source, status, ...extra };
}

function buildSampleTrainings() {
  const specs = [
    ["T001", "马帅", "安徽合肥", "2026 年芜湖市繁昌区高素质农民稻渔综合种养培训班", "安徽农业大学", 50, 50, -1, 2, 3, "北京仓50台", "安徽省合肥市长江西路130号安徽农业大学", "田礼欣", "13555561993"],
    ["T002", "武艺凡", "河北保定", "保定高素质农民农业科技培训班", "河北农业大学", 80, 80, 0, 3, 4, "北京仓80台", "河北省保定市莲池区灵雨寺街289号河北农业大学", "刘晨", "13800010002"],
    ["T003", "张伸", "河南郑州", "郑州农业社会化服务专题培训班", "河南农业大学", 75, 75, 1, 4, 5, "北京仓75台", "河南省郑州市金水区农业路63号河南农业大学", "王璐", "13800010003"],
    ["T004", "张伸", "河南洛阳", "洛阳稻渔综合种养实训班", "洛阳职业技术学院", 60, 60, 3, 5, 6, "郑州周转60台", "河南省洛阳市伊滨区科技大道6号洛阳职业技术学院", "赵杰", "13800010004"],
    ["T005", "师荣", "黑龙江大庆", "大庆智慧农业 VR 实践培训班", "黑龙江八一农垦大学", 90, 90, 2, 6, 8, "北京仓90台", "黑龙江省大庆市高新区新风路5号黑龙江八一农垦大学", "李娜", "13800010005"],
    ["T006", "邢家琛", "陕西汉中", "汉中农产品电商高素质农民培训班", "汉中职业技术学院", 55, 55, 4, 7, 7, "北京仓55台", "陕西省汉中市汉台区宗营镇汉中职业技术学院", "陈曦", "13800010006"],
    ["T007", "熊俊宇", "湖南长沙", "长沙数字农业与品牌建设培训班", "湖南农业大学", 100, 100, 5, 8, 10, "北京仓100台", "湖南省长沙市芙蓉区农大路1号湖南农业大学", "周敏", "13800010007"],
    ["T008", "吴瑞", "湖南岳阳", "岳阳绿色水产技术培训班", "岳阳职业技术学院", 65, 65, 6, 9, 9, "待调配65台", "湖南省岳阳市学院路岳阳职业技术学院", "孙强", "13800010008"],
    ["T009", "张智真", "河北沧州", "沧州设施蔬菜产业培训班", "沧州职业技术学院", 45, 45, 7, 10, 11, "北京仓45台", "河北省沧州市运河区九河西路沧州职业技术学院", "许宁", "13800010009"],
    ["T010", "马帅", "河南鹤壁", "鹤壁农产品短视频电商培训班", "鹤壁职业技术学院", 58, 58, 8, 11, 12, "洛阳周转58台", "河南省鹤壁市淇滨区朝歌路5号鹤壁职业技术学院", "高磊", "13800010010"],
    ["T011", "师荣", "黑龙江鸡西", "鸡西现代农业实训培训班", "黑龙江工业学院", 70, 70, 9, 12, 13, "大庆周转70台", "黑龙江省鸡西市鸡冠区和平南大街99号黑龙江工业学院", "孟雪", "13800010011"],
    ["T012", "张伸", "陕西榆林", "榆林农机安全与智慧种植培训班", "榆林职业技术学院", 95, 95, 10, 13, 14, "北京仓95台", "陕西省榆林市高新区裕华路南榆林职业技术学院", "韩越", "13800010012"],
  ];

  const durations = [3, 2, 3, 2, 3, 1, 3, 2, 2, 3, 2, 3];
  return specs.map(([id, owner, city, name, org, people, devices, shipOffset, arriveOffset, startOffset, source, mailAddress, receiver, phone], index) => {
    const startDate = formatFullDate(addDays(today, startOffset));
    const endDate = formatFullDate(addDays(parseDate(startDate), durations[index] - 1));
    return makeTraining(
      id,
      owner,
      city,
      name,
      devices,
      formatFullDate(addDays(today, shipOffset)),
      formatFullDate(addDays(today, arriveOffset)),
      startDate,
      endDate,
      source,
      "已确认",
      { org, people, mailAddress, receiver, phone, teacherIds: sampleTeacherIds(id) },
    );
  });
}

function sampleTeacherIds(id) {
  const map = {
    T001: ["S001"],
    T002: ["S002"],
    T003: ["S002", "S003"],
    T004: ["S003"],
  };
  return map[id] || [];
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value) {
  const d = value instanceof Date ? value : parseDate(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFullDate(value) {
  const d = value instanceof Date ? value : parseDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolveTrainingEndDate(startDate, endDate, days) {
  if (!startDate) return endDate || "";
  const count = Number(days) || 0;
  if (count > 1) return formatFullDate(addDays(parseDate(startDate), count - 1));
  return endDate || startDate;
}

function serialFromTrainingId(id) {
  const match = String(id || "").match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function formatTrainingSerial(item) {
  return String(item.serial || serialFromTrainingId(item.id)).padStart(3, "0");
}

function nextTrainingSerial() {
  return trainings.reduce((max, item) => Math.max(max, Number(item.serial || serialFromTrainingId(item.id)) || 0), 0) + 1;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * dayMs);
}

function between(date, start, end) {
  return date >= parseDate(start) && date <= parseDate(end);
}

function lockedTrainingCount(date) {
  return trainings.reduce((sum, item) => {
    if (item.status === "已取消" || item.status === "已完成") return sum;
    return between(date, item.shipDate, item.endDate) ? sum + Number(item.devices) : sum;
  }, 0);
}

function trainingUseCount(date) {
  return trainings.reduce((sum, item) => {
    if (item.status === "已取消" || item.status === "已完成") return sum;
    return between(date, item.startDate, item.endDate) ? sum + Number(item.devices) : sum;
  }, 0);
}

function getCapacity() {
  return Array.from({ length: timelineDayCount }, (_, index) => {
    const date = addDays(timelineStart, index);
    const used = trainingUseCount(date);
    return { date, loaned: 0, base: totalDevices, used, remain: totalDevices - used };
  });
}

function getDayState(remain) {
  if (remain < 0) return "over";
  if (remain === 0) return "full";
  if (remain <= 80) return "low";
  return "ok";
}

function renderMetrics() {
  const locked = lockedTrainingCount(today);
  const available = totalDevices - locked;
  const pending = trainings.filter((item) => !["已完成", "已取消"].includes(item.status)).length;
  const metrics = [
    ["设备总数", totalDevices, "管理员可在右上角修改"],
    ["今日已锁定设备", locked, "培训、运输、抵达等待中的设备"],
    ["当前可调配", available, "总数 - 已锁定", available < 100 ? "warning" : ""],
    ["待处理培训", pending, "未完成且未取消的培训记录"],
  ];
  document.querySelector("#metrics").innerHTML = metrics.map(([label, value, hint, cls]) => `
    <article class="metric-card ${cls || ""}">
      <span>${label}</span>
      <strong>${value}台</strong>
      <small>${hint}</small>
    </article>
  `).join("");

  const shippingToday = trainings.filter((item) => item.shipDate === formatFullDate(today));
  const arrivingSoon = trainings.filter((item) => {
    const d = parseDate(item.arriveDate);
    return d >= today && d <= addDays(today, 3);
  });
  const risks = getCapacity().filter((day) => day.remain <= 0);
  document.querySelector("#notices").innerHTML = [
    notice("待开展培训", `${pending}场`, "未来已创建、尚未完成的培训"),
    notice("今日需发货", `${shippingToday.length}场`, shippingToday.map((i) => `${i.city}｜${i.devices}台`).join("；") || "暂无今日发货"),
    notice("即将抵达", `${arrivingSoon.length}场`, "未来1-3天设备需要抵达"),
    notice("已排满日期", risks.length ? `${formatDate(risks[0].date)} 缺口${Math.abs(risks[0].remain)}台` : "暂无", risks.length ? `需求${risks[0].used}台，当天可排${risks[0].base}台` : "未来15天容量正常", risks.length ? "risk" : ""),
  ].join("");
}

function notice(title, value, desc, cls = "") {
  return `<article class="notice-card ${cls}">
    <div><span>${title}</span><p>${desc}</p></div>
    <strong>${value}</strong>
  </article>`;
}

function renderCapacity() {
  const html = getCapacity().map((day) => {
    const state = getDayState(day.remain);
    const pct = Math.min(100, Math.max(4, Math.round((day.used / Math.max(day.base, 1)) * 100)));
    return `<div class="capacity-row ${state}">
      <span>${formatDate(day.date)}</span>
      <div class="bar" title="基础可排${day.base}台，已占用${day.used}台">
        <div class="fill" style="width:${pct}%"></div>
      </div>
      <span>${day.remain}台</span>
    </div>`;
  }).join("");
  document.querySelector("#capacity-list").innerHTML = html;
}

function renderGantt() {
  const selected = document.querySelector("#biz-filter").value;
  const days = getCapacity();
  const shown = selected ? trainings.filter((item) => item.owner === selected) : trainings;
  const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dayIndex = (dateStr) => Math.round((parseDate(dateStr) - timelineStart) / dayMs);
  const visibleBar = (startDate, endDate) => {
    const start = Math.max(0, dayIndex(startDate));
    const end = Math.min(timelineDayCount - 1, dayIndex(endDate));
    if (end < 0 || start > timelineDayCount - 1) return null;
    return { start, span: end - start + 1 };
  };
  const barStyle = (start, span) => `left:${start * 64}px;width:${span * 64}px`;
  const monthLabel = getTimelineMonthLabel(days);
  let html = `<div class="gantt-grid">
    <div class="gantt-blank"></div>
    <div class="gantt-blank"></div>
    <div class="gantt-blank"></div>
    <div class="gantt-blank"></div>
    <div class="gantt-month" style="grid-column: span ${timelineDayCount};">${monthLabel}</div>
    <div class="gantt-head col-biz">商务</div>
    <div class="gantt-head col-name">培训机构</div>
    <div class="gantt-head col-city">省市</div>
    <div class="gantt-head col-devices">台数</div>`;
  html += days.map((day) => {
    const state = getDayState(day.remain);
    const isWeekend = [0, 6].includes(day.date.getDay());
    return `<div class="gantt-date ${state === "over" || state === "full" ? "risk" : ""} ${isWeekend ? "weekend" : ""} ${formatFullDate(day.date) === formatFullDate(today) ? "today" : ""}">
      <strong>${String(day.date.getDate()).padStart(2, "0")}</strong><span>${weekNames[day.date.getDay()]}</span>
    </div>`;
  }).join("");
  const groups = businessPeople
    .filter((person) => !selected || person === selected)
    .map((person, order) => ({
      person,
      order,
      items: shown.filter((item) => item.owner === person),
    }))
    .sort((a, b) => countRecentTrainings(b.items) - countRecentTrainings(a.items) || a.order - b.order);
  groups.forEach((group) => {
    html += `<div class="gantt-group">▾ ${group.person}<span>(${group.items.length}场)</span></div>`;
    group.items.forEach((item) => {
      const train = visibleBar(item.startDate, item.endDate);
      const ship = visibleBar(item.shipDate, item.shipDate);
      const arrive = visibleBar(item.arriveDate, item.arriveDate);
      const trainDays = Math.round((parseDate(item.endDate) - parseDate(item.startDate)) / dayMs) + 1;
      const sourceTip = item.source.includes("待调配") ? ` title="设备来源存在待调配风险"` : "";
      html += `
        <div class="gantt-left-cell biz"></div>
        <div class="gantt-left-cell name"${sourceTip}>${riskMark(item)}${item.org || item.name}</div>
        <div class="gantt-left-cell city">${item.city}</div>
        <div class="gantt-left-cell devices">${item.devices}</div>
        <div class="timeline today">
          ${ship ? `<div class="bar-segment ship" title="${formatDate(item.shipDate)} 发货" style="${barStyle(ship.start, 1)}">发货日</div>` : ""}
          ${arrive ? `<div class="bar-segment arrive" title="${formatDate(item.arriveDate)} 收货" style="${barStyle(arrive.start, 1)}">收货日</div>` : ""}
          ${train ? `<div class="bar-segment train" title="${formatDate(item.startDate)}-${formatDate(item.endDate)} 培训" style="${barStyle(train.start, train.span)}">培训日（${trainDays}天）</div>` : ""}
        </div>`;
    });
  });
  html += "</div>";
  document.querySelector("#gantt").innerHTML = html;
}

function exportGantt() {
  const title = "VR实践教学培训设备排期一览";
  const selected = document.querySelector("#biz-filter").value;
  const days = getCapacity();
  const shown = selected ? trainings.filter((item) => item.owner === selected) : trainings;
  const groups = businessPeople
    .filter((person) => !selected || person === selected)
    .map((person, order) => ({
      person,
      order,
      items: shown.filter((item) => item.owner === person),
    }))
    .sort((a, b) => countRecentTrainings(b.items) - countRecentTrainings(a.items) || a.order - b.order);
  const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const cols = [92, 190, 118, 70];
  const dayWidth = 64;
  const tableWidth = cols.reduce((sum, item) => sum + item, 0) + timelineDayCount * dayWidth;
  const titleHeight = 68;
  const monthHeight = 30;
  const headHeight = 46;
  const groupHeight = 32;
  const rowHeight = 32;
  const contentHeight = monthHeight + headHeight + groups.reduce((sum, group) => sum + groupHeight + group.items.length * rowHeight, 0);
  const width = tableWidth + 48;
  const height = titleHeight + contentHeight + 28;
  const x0 = 24;
  const y0 = titleHeight;
  const tableX = x0;
  const dateX = x0 + cols.reduce((sum, item) => sum + item, 0);
  const dayIndex = (dateStr) => Math.round((parseDate(dateStr) - timelineStart) / dayMs);
  const visibleBar = (startDate, endDate) => {
    const start = Math.max(0, dayIndex(startDate));
    const end = Math.min(timelineDayCount - 1, dayIndex(endDate));
    if (end < 0 || start > timelineDayCount - 1) return null;
    return { start, span: end - start + 1 };
  };
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";
  const drawRect = (x, y, w, h, fill, stroke = "#edf2f8") => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  const drawText = (value, x, y, options = {}) => {
    ctx.fillStyle = options.fill || "#22324a";
    ctx.font = `${options.weight || 400} ${options.size || 12}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    ctx.textAlign = options.anchor || "left";
    ctx.fillText(String(value || ""), x, y);
  };
  drawRect(0, 0, width, height, "#f7fbff", "#f7fbff");
  drawText(title, 24, 40, { size: 26, weight: 700, fill: "#10213a" });
  drawRect(tableX, y0, tableWidth, contentHeight, "#ffffff", "#dfe7f2");
  drawRect(tableX, y0, tableWidth, monthHeight, "#f8fbff", "#edf2f8");
  drawRect(tableX, y0 + monthHeight, tableWidth, headHeight, "#f8fbff", "#edf2f8");
  drawText(getTimelineMonthLabel(days), dateX + 12, y0 + 20, { size: 13, weight: 700, fill: "#344054" });
  let cursorX = tableX;
  ["商务", "培训机构", "省市", "台数"].forEach((label, index) => {
    drawRect(cursorX, y0 + monthHeight, cols[index], headHeight, "#f8fbff", "#edf2f8");
    drawText(label, cursorX + cols[index] / 2, y0 + monthHeight + 28, { anchor: "center", weight: 700, fill: "#4b5c72" });
    cursorX += cols[index];
  });
  days.forEach((day, index) => {
    const x = dateX + index * dayWidth;
    const isWeekend = [0, 6].includes(day.date.getDay());
    const isToday = formatFullDate(day.date) === formatFullDate(today);
    drawRect(x, y0 + monthHeight, dayWidth, headHeight, isWeekend ? "#fffaf5" : "#ffffff", "#edf2f8");
    if (isToday) {
      ctx.fillStyle = "#174ea6";
      ctx.fillRect(x, y0 + monthHeight, 2, contentHeight - monthHeight);
    }
    drawText(String(day.date.getDate()).padStart(2, "0"), x + dayWidth / 2, y0 + monthHeight + 18, { anchor: "center", weight: 700, fill: isWeekend ? "#c46d38" : "#22324a" });
    drawText(weekNames[day.date.getDay()], x + dayWidth / 2, y0 + monthHeight + 36, { anchor: "center", size: 11, fill: isWeekend ? "#c46d38" : "#66758a" });
  });
  let y = y0 + monthHeight + headHeight;
  groups.forEach((group) => {
    drawRect(tableX, y, tableWidth, groupHeight, "#f8fbff", "#edf2f8");
    drawText(`▾ ${group.person}`, tableX + 10, y + 21, { weight: 700, fill: "#22324a" });
    drawText(`(${group.items.length}场)`, tableX + 72, y + 21, { size: 12, weight: 600, fill: "#66758a" });
    y += groupHeight;
    group.items.forEach((item) => {
      let cellX = tableX;
      const cells = ["", item.org || item.name, item.city, item.devices];
      cells.forEach((cell, index) => {
        drawRect(cellX, y, cols[index], rowHeight, "#ffffff", "#edf2f8");
        if (index === 1) drawText(cell, cellX + 10, y + 21, { fill: "#344054" });
        if (index === 2 || index === 3) drawText(cell, cellX + cols[index] / 2, y + 21, { anchor: "center", fill: "#344054" });
        cellX += cols[index];
      });
      for (let i = 0; i < timelineDayCount; i += 1) {
        drawRect(dateX + i * dayWidth, y, dayWidth, rowHeight, "#ffffff", "#edf2f8");
      }
      const ship = visibleBar(item.shipDate, item.shipDate);
      const arrive = visibleBar(item.arriveDate, item.arriveDate);
      const train = visibleBar(item.startDate, item.endDate);
      const trainDays = Math.round((parseDate(item.endDate) - parseDate(item.startDate)) / dayMs) + 1;
      if (ship) {
        drawRect(dateX + ship.start * dayWidth, y, dayWidth, rowHeight, "#f6d37a", "#e7c263");
        drawText("发货日", dateX + ship.start * dayWidth + dayWidth / 2, y + 21, { anchor: "center", size: 11, weight: 650, fill: "#243247" });
      }
      if (arrive) {
        drawRect(dateX + arrive.start * dayWidth, y, dayWidth, rowHeight, "#dfe5ee", "#d0d8e4");
        drawText("收货日", dateX + arrive.start * dayWidth + dayWidth / 2, y + 21, { anchor: "center", size: 11, weight: 650, fill: "#405166" });
      }
      if (train) {
        drawRect(dateX + train.start * dayWidth, y, train.span * dayWidth, rowHeight, "#abc8f5", "#98b8e8");
        drawText(`培训日（${trainDays}天）`, dateX + train.start * dayWidth + train.span * dayWidth / 2, y + 21, { anchor: "center", size: 11, weight: 650, fill: "#173d73" });
      }
      y += rowHeight;
    });
  });
  const downloadCanvas = (blob) => {
    const link = document.createElement("a");
    link.download = `${title}.png`;
    link.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
    link.click();
    if (blob) setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  if (canvas.toBlob) {
    canvas.toBlob(downloadCanvas, "image/png");
  } else {
    downloadCanvas(null);
  }
}

function countRecentTrainings(items) {
  const windowEnd = addDays(timelineStart, timelineDayCount - 1);
  return items.filter((item) => parseDate(item.endDate) >= timelineStart && parseDate(item.startDate) <= windowEnd).length;
}

function getTimelineMonthLabel(days) {
  const first = days[0].date;
  const last = days[days.length - 1].date;
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getFullYear()}年${first.getMonth() + 1}月`;
  }
  return `${first.getFullYear()}年${first.getMonth() + 1}月 - ${last.getFullYear()}年${last.getMonth() + 1}月`;
}

function riskMark(item) {
  return item.source.includes("待调配") ? `<span class="risk-dot"></span>` : "";
}

function renderFilters() {
  const bizOptions = [`<option value="">全部商务</option>`, ...businessPeople.map((p) => `<option value="${p}">${p}</option>`)].join("");
  document.querySelector("#biz-filter").innerHTML = bizOptions;
  document.querySelector("#list-biz-filter").innerHTML = bizOptions;
  const provinces = [...new Set(trainings.map((item) => item.province))];
  document.querySelector("#province-filter").innerHTML = `<option value="">全部省份</option>${provinces.map((p) => `<option value="${p}">${p}</option>`).join("")}`;
  document.querySelector("#status-filter").innerHTML = `<option value="">全部状态</option>${statuses.map((s) => `<option value="${s}">${s}</option>`).join("")}`;
}

function renderTrainingTable() {
  const biz = document.querySelector("#list-biz-filter").value;
  const province = document.querySelector("#province-filter").value;
  const status = document.querySelector("#status-filter").value;
  const risk = document.querySelector("#risk-filter").value;
  const rows = trainings.filter((item) => {
    const hasRisk = item.source.includes("待调配");
    const autoStatus = getTrainingStatus(item);
    return (!biz || item.owner === biz)
      && (!province || item.province === province)
      && (!status || autoStatus === status)
      && (!risk || (risk === "risk" ? hasRisk : !hasRisk));
  }).sort(compareTrainingsByDate);
  document.querySelector("#training-table").innerHTML = rows.map((item) => `
    <tr>
      <td><span class="id-chip">${formatTrainingSerial(item)}</span></td>
      <td class="narrow-col business-col">${ownerChip(item.owner)}</td>
      <td>${item.name}</td>
      <td>${item.org || "—"}</td>
      <td>${item.city}</td>
      <td class="narrow-col people-col">${item.people || "—"}</td>
      <td>${item.devices}台</td>
      <td>${formatTrainingDateRange(item)}</td>
      <td>${formatTrainingTeachers(item)}</td>
      <td>${statusBadge(getTrainingStatus(item))}</td>
      <td class="mailing-cell">${formatMailingInfo(item)}</td>
      <td class="action-cell">
        <button class="ghost small-btn" data-edit-training="${item.id}">编辑</button>
        <button class="danger small-btn" data-delete-training="${item.id}">删除</button>
      </td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-edit-training]").forEach((btn) => {
    btn.addEventListener("click", () => editTraining(btn.dataset.editTraining));
  });
  document.querySelectorAll("[data-delete-training]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTraining(btn.dataset.deleteTraining));
  });
}

function renderTeacherTable() {
  const keyword = document.querySelector("#teacher-search")?.value.trim() || "";
  const rows = teachers
    .filter((teacher) => !keyword || teacher.name.includes(keyword) || String(teacher.profile || "").includes(keyword))
    .sort((a, b) => Number(a.teacherStatus === "离职") - Number(b.teacherStatus === "离职"));
  document.querySelector("#teacher-table").innerHTML = rows.map((teacher) => `
    <tr>
      <td><strong>${teacher.name}</strong></td>
      <td>${teacher.phone}</td>
      <td>${teacher.city}</td>
      <td>${teacher.travelRange}</td>
      <td>${getTeacherTotalSessions(teacher)}场</td>
      <td>${teacher.refusals}</td>
      <td>${teacher.cancellations}</td>
      <td>${teacher.complaints}</td>
      <td>${teacherRatingBadge(teacher.rating)}</td>
      <td class="profile-cell">${summarizeText(teacher.profile)}</td>
      <td>${teacherStatusBadge(teacher.teacherStatus)}</td>
      <td class="action-cell">
        <button class="ghost small-btn" data-edit-teacher="${teacher.id}">编辑</button>
      </td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-edit-teacher]").forEach((btn) => {
    btn.addEventListener("click", () => editTeacher(btn.dataset.editTeacher));
  });
}

function renderTeacherRateSettings() {
  const el = document.querySelector("#teacher-rate-settings");
  if (!el) return;
  el.innerHTML = `
    <div>
      <h3>讲师基础费用</h3>
      <p>修改后，派遣应结金额会按新标准重新计算</p>
    </div>
    <div class="rate-grid">
      ${Object.keys(defaultTeacherRates).map((rating) => `
        <label>${rating}
          <input data-teacher-rate="${rating}" type="number" min="0" value="${teacherRates[rating]}">
        </label>
      `).join("")}
    </div>
  `;
  document.querySelectorAll("[data-teacher-rate]").forEach((input) => {
    input.addEventListener("input", () => {
      teacherRates[input.dataset.teacherRate] = Math.max(0, Number(input.value || 0));
      renderDispatchTable();
    });
    input.addEventListener("change", () => {
      teacherRates = normalizeTeacherRates(teacherRates);
      renderTeacherRateSettings();
      renderDispatchTable();
      void saveSettings();
    });
  });
}

function renderDispatchTable() {
  const rows = getFilteredDispatchRows();
  const selectionMode = isDispatchSelectionMode();
  syncSelectedDispatchKeys(rows, selectionMode);
  const totalPayable = rows.reduce((sum, row) => sum + getDispatchAmounts(row).payable, 0);
  document.querySelector("#dispatch-total").textContent = `${totalPayable}元`;
  document.querySelector("#dispatch-selection-head")?.classList.toggle("collapsed-cell", !selectionMode);
  document.querySelector("#batch-settlement")?.classList.toggle("collapsed", !selectionMode);
  document.querySelector("#dispatch-table").innerHTML = rows.length ? rows.map((row) => {
    const settlement = getDispatchSettlement(row.key);
    const amounts = getDispatchAmounts(row);
    const reimbursement = Number(settlement.reimbursement || 0);
    const settlementStatus = normalizeSettlementStatus(settlement.settlementStatus);
    const selected = selectedDispatchKeys.has(row.key);
    return `
      <tr class="clickable-row ${settlementStatus === "已结算" ? "settled-row" : ""}" data-dispatch-row="${row.key}">
        ${selectionMode ? `<td class="select-col"><input type="checkbox" data-dispatch-select="${row.key}" ${selected ? "checked" : ""}></td>` : ""}
        <td><span class="id-chip">${formatTrainingSerial(row.training)}</span></td>
        <td>${row.training.name}</td>
        <td>${row.training.city}</td>
        <td class="narrow-col people-col">${row.training.people || "—"}</td>
        <td class="narrow-col business-col">${ownerChip(row.training.owner)}</td>
        <td>${teacherChip(row.teacher)}</td>
        <td>${formatTrainingDateRange(row.training)}</td>
        <td>${scoreCell(settlement.workflowScore, row, 2)}</td>
        <td>${scoreCell(settlement.surveyScore, row, 1)}</td>
        <td class="narrow-col days-col">${amounts.teachingDays}天</td>
        <td>${amounts.wage}元</td>
        <td>${formatOptionalMoney(settlement.remoteAllowance)}</td>
        <td>${amounts.deduction}元</td>
        <td><button class="amount-link ${settlementStatus === "已结算" ? "settled-amount" : ""}" data-amount-detail="${row.key}">${amounts.payable}元</button></td>
        <td>${settlementStatusBadge(settlementStatus)}</td>
        <td class="narrow-col operation-col action-cell"><button class="ghost small-btn" data-edit-dispatch="${row.key}">编辑结算</button></td>
        <td>${reimbursement}元</td>
        <td class="narrow-col reimbursement-status-col">${reimbursementStatusBadge(settlement.reimbursementStatus)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="${selectionMode ? 19 : 18}">培训管理中选择派遣讲师后，这里会自动生成讲师派遣记录。</td></tr>`;
  renderDispatchBatchState(rows);
  document.querySelectorAll("[data-dispatch-select]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedDispatchKeys.add(checkbox.dataset.dispatchSelect);
      } else {
        selectedDispatchKeys.delete(checkbox.dataset.dispatchSelect);
      }
      renderDispatchBatchState(rows);
    });
  });
  document.querySelectorAll("[data-edit-dispatch]").forEach((btn) => {
    btn.addEventListener("click", () => editDispatch(btn.dataset.editDispatch));
  });
  document.querySelectorAll("[data-amount-detail]").forEach((btn) => {
    btn.addEventListener("click", () => openAmountDetail(btn.dataset.amountDetail));
  });
  document.querySelectorAll("[data-dispatch-row]").forEach((rowEl) => {
    rowEl.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      openDispatchDetail(rowEl.dataset.dispatchRow);
    });
  });
}

function renderDispatchFilters() {
  const monthSelect = document.querySelector("#dispatch-month-filter");
  const teacherSelect = document.querySelector("#dispatch-teacher-filter");
  if (!teacherSelect) return;
  if (monthSelect) {
    const selectedMonth = monthSelect.value;
    const months = getDispatchMonthOptions();
    monthSelect.innerHTML = `<option value="">全部月份</option>${months.map((month) => `<option value="${month}" ${month === selectedMonth ? "selected" : ""}>${month}</option>`).join("")}`;
    if (selectedMonth && !months.includes(selectedMonth)) monthSelect.value = "";
  }
  const selected = teacherSelect.value;
  const options = getDispatchTeacherOptions()
    .map((teacher) => `<option value="${teacher.id}" ${teacher.id === selected ? "selected" : ""}>${teacher.name}</option>`)
    .join("");
  teacherSelect.innerHTML = `<option value="">全部讲师</option>${options}`;
  if (selected && !getDispatchTeacherOptions().some((teacher) => teacher.id === selected)) {
    teacherSelect.value = "";
  }
}

function renderAnomalyTable() {
  const rows = getDispatchRows()
    .map((row) => ({ row, anomaly: getDispatchAnomaly(row) }))
    .filter((item) => item.anomaly);

  document.querySelector("#anomaly-table").innerHTML = rows.length ? rows.map(({ row, anomaly }) => `
    <tr>
      <td>${ownerChip(row.training.owner)}</td>
      <td>${teacherChip(row.teacher)}</td>
      <td>${row.training.name}</td>
      <td>${row.training.org || "—"}</td>
      <td>${row.training.city}</td>
      <td>${formatTrainingDateRange(row.training)}</td>
      <td>${anomaly.missing.join("、")}</td>
      <td>${formatDate(anomaly.dueDate)}</td>
      <td>${anomaly.daysOverdue}天</td>
      <td><span class="badge risk">异常</span></td>
      <td class="action-cell"><button class="ghost small-btn" data-edit-dispatch="${row.key}">补填评分</button></td>
    </tr>
  `).join("") : `<tr><td colspan="11">暂无异常记录。超过填写期限且评分缺失时，这里会自动出现提醒。</td></tr>`;

  document.querySelectorAll("#anomaly-table [data-edit-dispatch]").forEach((btn) => {
    btn.addEventListener("click", () => editDispatch(btn.dataset.editDispatch));
  });
}

function getDispatchRows() {
  return trainings.flatMap((training) => (training.teacherIds || []).map((teacherId) => {
    const teacher = teachers.find((item) => item.id === teacherId);
    if (!teacher) return null;
    return { key: getDispatchKey(training.id, teacher.id), training, teacher };
  }).filter(Boolean));
}

function getFilteredDispatchRows() {
  const selectedTeacherId = document.querySelector("#dispatch-teacher-filter")?.value || "";
  const selectedMonth = document.querySelector("#dispatch-month-filter")?.value || "";
  const selectedSettlementStatus = document.querySelector("#dispatch-settlement-filter")?.value || "";
  return getDispatchRows().filter((row) => {
    const settlement = getDispatchSettlement(row.key);
    const matchesTeacher = !selectedTeacherId || row.teacher.id === selectedTeacherId;
    const matchesMonth = !selectedMonth || getTrainingMonthKey(row.training) === selectedMonth;
    const matchesSettlement = !selectedSettlementStatus || normalizeSettlementStatus(settlement.settlementStatus) === selectedSettlementStatus;
    return matchesTeacher && matchesMonth && matchesSettlement;
  }).sort(compareDispatchRowsByDate);
}

function getDispatchTeacherOptions() {
  const ids = new Set(getDispatchRows().map((row) => row.teacher.id));
  return teachers.filter((teacher) => ids.has(teacher.id));
}

function getDispatchMonthOptions() {
  return [...new Set(getDispatchRows().map((row) => getTrainingMonthKey(row.training)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
}

function getTrainingMonthKey(training) {
  return training.startDate ? training.startDate.slice(0, 7) : "";
}

function trainingDatePriority(training) {
  if (!training.startDate) return Number.MAX_SAFE_INTEGER;
  const diff = parseDate(training.startDate) - today;
  return diff >= 0 ? diff : Math.abs(diff) + (366 * dayMs);
}

function compareTrainingsByDate(a, b) {
  const dateDiff = trainingDatePriority(a) - trainingDatePriority(b);
  if (dateDiff !== 0) return dateDiff;
  return formatTrainingSerial(a).localeCompare(formatTrainingSerial(b), "zh-CN", { numeric: true });
}

function compareDispatchRowsByDate(a, b) {
  const dateDiff = compareTrainingsByDate(a.training, b.training);
  if (dateDiff !== 0) return dateDiff;
  return a.teacher.name.localeCompare(b.teacher.name, "zh-CN");
}

function isDispatchSelectionMode() {
  return Boolean(
    document.querySelector("#dispatch-month-filter")?.value
    || document.querySelector("#dispatch-settlement-filter")?.value,
  );
}

function syncSelectedDispatchKeys(rows, selectionMode) {
  if (!selectionMode) {
    selectedDispatchKeys.clear();
    return;
  }
  const visibleKeys = new Set(rows.map((row) => row.key));
  selectedDispatchKeys = new Set([...selectedDispatchKeys].filter((key) => visibleKeys.has(key)));
}

function renderDispatchBatchState(rows) {
  const visibleKeys = rows.map((row) => row.key);
  const checkedCount = visibleKeys.filter((key) => selectedDispatchKeys.has(key)).length;
  const selectedTotal = rows
    .filter((row) => selectedDispatchKeys.has(row.key))
    .reduce((sum, row) => sum + getDispatchAmounts(row).payable, 0);
  const totalEl = document.querySelector("#dispatch-selected-total");
  if (totalEl) totalEl.textContent = `已选${checkedCount}条 / ${selectedTotal}元`;
  const allCheckbox = document.querySelector("#dispatch-select-all");
  if (allCheckbox) {
    allCheckbox.checked = Boolean(visibleKeys.length && checkedCount === visibleKeys.length);
    allCheckbox.indeterminate = checkedCount > 0 && checkedCount < visibleKeys.length;
  }
}

function getDispatchKey(trainingId, teacherId) {
  return `${trainingId}-${teacherId}`;
}

function getDispatchSettlement(key) {
  return dispatchSettlements[key] || {
    workflowScore: "",
    surveyScore: "",
    reimbursement: 0,
    reimbursementStatus: "待审核",
    remoteAllowance: "",
    adjustment: 0,
    settlementStatus: "待结算",
    note: "",
  };
}

function getTrainingDays(training) {
  if (!training.startDate || !training.endDate) return 1;
  return Math.max(1, Math.round((parseDate(training.endDate) - parseDate(training.startDate)) / dayMs) + 1);
}

function formatTrainingDateRange(training) {
  if (!training.startDate && !training.endDate) return "—";
  if (!training.endDate || training.startDate === training.endDate) return formatDate(parseDate(training.startDate || training.endDate));
  return `${formatDate(parseDate(training.startDate))}-${formatDate(parseDate(training.endDate))}`;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function formatOptionalMoney(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `${amount}元` : "无";
}

function isScoreOverdue(training, daysAfterEnd) {
  if (!training.endDate) return false;
  return today > addDays(parseDate(training.endDate), daysAfterEnd);
}

function getScoreDueDate(training, daysAfterEnd) {
  return addDays(parseDate(training.endDate), daysAfterEnd);
}

function scoreCell(value, row, daysAfterEnd) {
  if (!isBlank(value)) return `<span class="score-value">${value}</span>`;
  const className = isScoreOverdue(row.training, daysAfterEnd) ? "score-overdue" : "score-pending";
  return `<span class="score-chip ${className}">待填写</span>`;
}

function summarizeText(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}

function getDispatchAnomaly(row) {
  if (!row.training.endDate) return null;
  const settlement = getDispatchSettlement(row.key);
  const missing = [];
  if (isBlank(settlement.workflowScore) && isScoreOverdue(row.training, 2)) {
    missing.push({ label: "工作流程评分", dueDate: getScoreDueDate(row.training, 2) });
  }
  if (isBlank(settlement.surveyScore) && isScoreOverdue(row.training, 1)) {
    missing.push({ label: "问卷满意度评分", dueDate: getScoreDueDate(row.training, 1) });
  }
  if (!missing.length) return null;

  const dueDate = missing.reduce((earliest, item) => item.dueDate < earliest ? item.dueDate : earliest, missing[0].dueDate);
  const daysOverdue = Math.max(1, Math.floor((today - dueDate) / dayMs));
  return { missing: missing.map((item) => item.label), dueDate, daysOverdue };
}

function getTeacherDailyRate(rating) {
  return Number(teacherRates[rating]) || defaultTeacherRates[rating] || defaultTeacherRates["普通"];
}

function getDispatchAmounts(row) {
  const settlement = getDispatchSettlement(row.key);
  const teachingDays = getTrainingDays(row.training);
  const dayRate = getTeacherDailyRate(row.teacher.rating);
  const wage = dayRate * teachingDays;
  const remoteAllowance = Math.max(0, Number(settlement.remoteAllowance || 0));
  const deduction = Math.max(0, Number(settlement.adjustment || 0));
  const reimbursement = Math.max(0, Number(settlement.reimbursement || 0));
  return {
    teachingDays,
    dayRate,
    wage,
    remoteAllowance,
    deduction,
    reimbursement,
    payable: Math.max(0, wage + remoteAllowance - deduction),
  };
}

function normalizeReimbursementStatus(status) {
  return status === "已付款" || status === "已结算" || status === "已通过" || status === "已打款" ? "已付款" : "待审核";
}

function reimbursementStatusBadge(status = "待审核") {
  const normalized = normalizeReimbursementStatus(status);
  const classMap = {
    "待审核": "status-pending",
    "已付款": "status-using",
  };
  const className = classMap[normalized] || "";
  return `<span class="badge ${className}">${normalized}</span>`;
}

function normalizeSettlementStatus(status) {
  return ["已结算", "已提交", "待结算"].includes(status) ? status : "待结算";
}

function settlementStatusBadge(status = "待结算") {
  const normalized = normalizeSettlementStatus(status);
  const classMap = {
    "待结算": "status-pending",
    "已提交": "status-confirmed",
    "已结算": "status-settled",
  };
  return `<span class="badge ${classMap[normalized] || ""}">${normalized}</span>`;
}

function openAmountDetail(key) {
  const row = getDispatchRows().find((item) => item.key === key);
  if (!row) return;
  const amounts = getDispatchAmounts(row);
  const settlement = getDispatchSettlement(row.key);
  document.querySelector("#amount-modal-desc").textContent = `${row.training.name}｜${row.teacher.name}`;
  document.querySelector("#amount-detail").innerHTML = `
    <div><span>授课天数</span><strong>${amounts.teachingDays}天</strong></div>
    <div><span>日劳务标准</span><strong>${amounts.dayRate}元/天</strong></div>
    <div><span>劳务报酬</span><strong>${amounts.teachingDays} × ${amounts.dayRate} = ${amounts.wage}元</strong></div>
    <div><span>偏远补贴</span><strong>${formatOptionalMoney(settlement.remoteAllowance)}</strong></div>
    <div><span>扣款</span><strong>-${amounts.deduction}元</strong></div>
    <div><span>报销费用</span><strong>${amounts.reimbursement}元</strong></div>
    <div class="amount-final"><span>应结金额</span><strong>${amounts.wage} + ${amounts.remoteAllowance} - ${amounts.deduction} = ${amounts.payable}元</strong></div>
  `;
  document.querySelector("#amount-modal").classList.remove("collapsed");
}

function closeAmountDetail() {
  document.querySelector("#amount-modal").classList.add("collapsed");
}

function openDispatchDetail(key) {
  const row = getDispatchRows().find((item) => item.key === key);
  if (!row) return;
  const settlement = getDispatchSettlement(row.key);
  const amounts = getDispatchAmounts(row);
  document.querySelector("#dispatch-detail-desc").textContent = `${row.training.name}｜${row.teacher.name}`;
  document.querySelector("#dispatch-detail").innerHTML = `
    ${detailSection("培训信息", [
      ["ID", formatTrainingSerial(row.training)],
      ["培训班名称", row.training.name],
      ["客户机构名称", row.training.org || "—"],
      ["省市", row.training.city || "—"],
      ["培训人数", row.training.people || "—"],
      ["详细地址", row.training.address || row.training.mailAddress || "—"],
      ["培训日期", formatTrainingDateRange(row.training)],
      ["商务", row.training.owner || "—"],
    ])}
    ${detailSection("讲师档案", [
      ["讲师", row.teacher.name],
      ["手机号", row.teacher.phone || "—"],
      ["常驻城市", row.teacher.city || "—"],
      ["可出差范围", row.teacher.travelRange || "—"],
      ["讲师评级", row.teacher.rating || "—"],
      ["讲师基础画像", row.teacher.profile || "—"],
      ["身份证号", row.teacher.idCard || "—"],
      ["银行卡号", row.teacher.bankCard || "—"],
      ["开户行", row.teacher.bankName || "—"],
    ])}
    ${detailSection("结算信息", [
      ["工作流程评分", isBlank(settlement.workflowScore) ? "待填写" : settlement.workflowScore],
      ["问卷满意度评分", isBlank(settlement.surveyScore) ? "待填写" : settlement.surveyScore],
      ["授课天数", `${amounts.teachingDays}天`],
      ["日劳务标准", `${amounts.dayRate}元/天`],
      ["劳务报酬", `${amounts.wage}元`],
      ["偏远补贴", formatOptionalMoney(settlement.remoteAllowance)],
      ["扣款", `${amounts.deduction}元`],
      ["应结金额", `${amounts.payable}元`],
      ["结算状态", normalizeSettlementStatus(settlement.settlementStatus)],
      ["报销费用", `${amounts.reimbursement}元`],
      ["报销状态", normalizeReimbursementStatus(settlement.reimbursementStatus)],
      ["备注", String(settlement.note || "").trim() || "—"],
    ])}
  `;
  document.querySelector("#dispatch-detail-modal").classList.remove("collapsed");
}

function detailSection(title, items) {
  return `
    <section class="detail-section">
      <h3>${title}</h3>
      <div class="detail-grid">
        ${items.map(([label, value]) => `
          <div class="detail-item">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function closeDispatchDetail() {
  document.querySelector("#dispatch-detail-modal").classList.add("collapsed");
}

function editDispatch(key) {
  const row = getDispatchRows().find((item) => item.key === key);
  if (!row) return;
  const settlement = getDispatchSettlement(key);
  editingDispatchKey = key;
  document.querySelector("#dispatch-modal-desc").textContent = `${row.training.name}｜${row.teacher.name}`;
  document.querySelectorAll("[data-dispatch-field]").forEach((el) => {
    const value = settlement[el.dataset.dispatchField];
    if (el.dataset.dispatchField === "reimbursementStatus") {
      el.value = normalizeReimbursementStatus(value);
      return;
    }
    if (el.dataset.dispatchField === "settlementStatus") {
      el.value = normalizeSettlementStatus(value);
      return;
    }
    if (el.dataset.dispatchField === "remoteAllowance") {
      el.value = value ? Number(value) : "";
      return;
    }
    el.value = value ?? (el.type === "number" ? 0 : "");
  });
  document.querySelector("#dispatch-modal").classList.remove("collapsed");
}

function closeDispatchModal() {
  editingDispatchKey = null;
  document.querySelector("#dispatch-modal").classList.add("collapsed");
  document.querySelector("#dispatch-modal-desc").textContent = "培训信息、讲师、授课天数和劳务报酬自动同步";
}

function saveDispatchSettlement() {
  if (!editingDispatchKey) return;
  const keyToSave = editingDispatchKey;
  const data = {};
  document.querySelectorAll("[data-dispatch-field]").forEach((el) => {
    const key = el.dataset.dispatchField;
    if (["workflowScore", "surveyScore"].includes(key) && el.value.trim() === "") {
      data[key] = "";
      return;
    }
    if (key === "reimbursementStatus") {
      data[key] = normalizeReimbursementStatus(el.value);
      return;
    }
    if (key === "settlementStatus") {
      data[key] = normalizeSettlementStatus(el.value);
      return;
    }
    data[key] = el.type === "number" ? Math.max(0, Number(el.value || 0)) : el.value.trim();
  });
  dispatchSettlements[keyToSave] = data;
  closeDispatchModal();
  renderDispatchTable();
  renderAnomalyTable();
  void saveDispatchSettlementRecord(keyToSave, data);
}

function toggleSelectAllDispatch(checked) {
  const rows = getFilteredDispatchRows();
  if (checked) {
    rows.forEach((row) => selectedDispatchKeys.add(row.key));
  } else {
    rows.forEach((row) => selectedDispatchKeys.delete(row.key));
  }
  renderDispatchTable();
}

function batchUpdateSettlementStatus() {
  const status = normalizeSettlementStatus(document.querySelector("#batch-settlement-status")?.value);
  const keys = [...selectedDispatchKeys];
  if (!keys.length) {
    alert("请先勾选需要修改的派遣记录。");
    return;
  }
  keys.forEach((key) => {
    dispatchSettlements[key] = {
      ...getDispatchSettlement(key),
      settlementStatus: status,
    };
  });
  renderDispatchTable();
  renderAnomalyTable();
  void Promise.all(keys.map((key) => saveDispatchSettlementRecord(key, dispatchSettlements[key])));
}

function teacherRatingBadge(rating) {
  const classMap = {
    "普通": "",
    "铜牌": "status-transport",
    "银牌": "status-confirmed",
    "金牌": "status-pending",
    "钻石": "status-using",
  };
  const className = classMap[rating] || "";
  return `<span class="badge ${className}">${rating}</span>`;
}

function teacherStatusBadge(status = "正常") {
  const className = status === "离职" ? "status-transport" : "status-using";
  return `<span class="badge ${className}">${status}</span>`;
}

function getTeacherTotalSessions(teacher) {
  return Number(teacher.sessions || 0) + trainings.filter((item) => (item.teacherIds || []).includes(teacher.id)).length;
}

function formatTrainingTeachers(item) {
  const chips = (item.teacherIds || [])
    .map((id) => teachers.find((teacher) => teacher.id === id))
    .filter(Boolean);
  return chips.length ? `<div class="teacher-chip-list">${chips.map((teacher) => teacherChip(teacher)).join("")}</div>` : "未派遣";
}

function activeTeachers() {
  return teachers.filter((teacher) => teacher.teacherStatus !== "离职");
}

function openTeacherModal() {
  if (!editingTeacherId) {
    document.querySelector("#teacher-modal-title").textContent = "创建师资信息";
    document.querySelector("#save-teacher").textContent = "保存信息";
  }
  document.querySelector("#teacher-modal").classList.remove("collapsed");
}

function closeTeacherModal() {
  document.querySelector("#teacher-modal").classList.add("collapsed");
  editingTeacherId = null;
  document.querySelector("#teacher-modal-title").textContent = "创建师资信息";
  document.querySelector("#save-teacher").textContent = "保存信息";
  document.querySelectorAll("[data-teacher-field]").forEach((el) => {
    if (el.tagName === "SELECT") {
      el.value = el.dataset.teacherField === "teacherStatus" ? "正常" : "普通";
    } else if (el.type === "number") {
      el.value = 0;
    } else {
      el.value = "";
    }
  });
}

function editTeacher(id) {
  const teacher = teachers.find((item) => item.id === id);
  if (!teacher) return;
  editingTeacherId = id;
  document.querySelector("#teacher-modal-title").textContent = "编辑师资信息";
  document.querySelector("#save-teacher").textContent = "保存修改";
  document.querySelectorAll("[data-teacher-field]").forEach((el) => {
    const value = teacher[el.dataset.teacherField];
    el.value = value ?? (el.type === "number" ? 0 : "");
  });
  openTeacherModal();
}

function createTeacher() {
  const data = {};
  document.querySelectorAll("[data-teacher-field]").forEach((el) => {
    data[el.dataset.teacherField] = el.type === "number" ? Number(el.value || 0) : el.value.trim();
  });
  if (!data.name || !data.phone) {
    alert("请至少填写讲师姓名和手机号。");
    return;
  }
  const nextTeacher = {
    id: editingTeacherId || `S${String(Date.now()).slice(-6)}`,
    name: data.name,
    phone: data.phone,
    city: data.city || "未填写",
    travelRange: data.travelRange || "未填写",
    sessions: data.sessions,
    refusals: data.refusals,
    cancellations: data.cancellations,
    complaints: data.complaints,
    rating: data.rating || "普通",
    teacherStatus: data.teacherStatus || "正常",
    idCard: data.idCard,
    bankCard: data.bankCard,
    bankName: data.bankName,
    profile: data.profile,
  };
  if (editingTeacherId) {
    teachers = teachers.map((teacher) => teacher.id === editingTeacherId ? nextTeacher : teacher);
  } else {
    teachers.unshift(nextTeacher);
  }
  closeTeacherModal();
  renderAll();
  void saveTeacherRecord(nextTeacher);
}

function ownerChip(owner) {
  const index = Math.max(0, businessPeople.indexOf(owner));
  return `<span class="owner-chip owner-${index}">${owner || "未选择"}</span>`;
}

function teacherChip(teacher) {
  const index = Math.max(0, teachers.findIndex((item) => item.id === teacher.id));
  return `<span class="teacher-chip teacher-${index % 8}">${teacher.name}</span>`;
}

function getTrainingStatus(item) {
  if (item.source.includes("待调配")) return "待排期";
  const now = today;
  if (item.endDate && now > parseDate(item.endDate)) return "已完成";
  if (item.startDate && item.endDate && between(now, item.startDate, item.endDate)) return "使用中";
  if (item.shipDate && item.arriveDate && now >= parseDate(item.shipDate) && now < parseDate(item.startDate || item.arriveDate)) return "运输中";
  return "已确认";
}

function statusBadge(status) {
  const classMap = {
    "待排期": "status-pending",
    "已确认": "status-confirmed",
    "运输中": "status-transport",
    "使用中": "status-using",
    "已完成": "",
  };
  return `<span class="badge ${classMap[status] || ""}">${status}</span>`;
}

function formatMailingInfo(item) {
  const parts = [
    item.mailAddress || item.address || "—",
    item.receiver ? `收货人：${item.receiver}` : "",
    item.phone ? `电话：${item.phone}` : "",
  ].filter(Boolean);
  return parts.join("<br>");
}

function parseSourceString(source, fallbackCount) {
  if (!source) return [{ type: "北京仓", count: Number(fallbackCount) || 0 }];
  return source.split(" + ").map((part) => {
    const match = part.match(/^(.*?)(\d+)台$/);
    return match
      ? { type: match[1], count: Number(match[2]) }
      : { type: part, count: Number(fallbackCount) || 0 };
  });
}

function splitCity(item) {
  const province = item.province || item.city.slice(0, 2);
  const city = item.city.startsWith(province) ? item.city.slice(province.length) : item.city;
  return { province, city };
}

function prepareCreateForm() {
  editingTrainingId = null;
  document.querySelector("#create-training").textContent = "确认创建培训";
  document.querySelector("#save-draft").style.display = "";
  document.querySelector("#toggle-create").textContent = "收起";
  document.querySelector("#parse-text").style.display = "";
  parseSmartText();
}

function editTraining(id) {
  const item = trainings.find((training) => training.id === id);
  if (!item) return;
  const { province, city } = splitCity(item);
  editingTrainingId = id;
  previewData = {
    owner: item.owner,
    teacherIds: item.teacherIds || [],
    name: item.name,
    org: item.org || "",
    province,
    city,
    district: item.district || "",
    address: item.address || "",
    people: item.people || "",
    devices: item.devices,
    startDate: item.startDate,
    endDate: item.endDate || item.startDate,
    days: item.startDate && item.endDate ? Math.round((parseDate(item.endDate) - parseDate(item.startDate)) / dayMs) + 1 : 1,
    arriveDate: item.arriveDate,
    shipDate: item.shipDate,
    mailAddress: item.mailAddress || "",
    receiver: item.receiver || "",
    phone: item.phone || "",
  };
  draftSources = parseSourceString(item.source, item.devices);
  document.querySelector("#create-training").textContent = "保存修改";
  document.querySelector("#save-draft").style.display = "none";
  document.querySelector("#toggle-create").textContent = "取消";
  document.querySelector("#parse-text").style.display = "none";
  renderPreview();
  openCreatePanel();
}

function deleteTraining(id) {
  const item = trainings.find((training) => training.id === id);
  if (!item) return;
  pendingDeleteTrainingId = id;
  document.querySelector("#delete-message").innerHTML = `将删除「${item.name}」。<br>删除后会同时从列表和甘特图中移除。`;
  document.querySelector("#delete-modal").classList.remove("collapsed");
}

function closeDeleteConfirm() {
  pendingDeleteTrainingId = null;
  document.querySelector("#delete-modal").classList.add("collapsed");
}

function confirmDeleteTraining() {
  if (!pendingDeleteTrainingId) return;
  const deletedId = pendingDeleteTrainingId;
  trainings = trainings.filter((training) => training.id !== pendingDeleteTrainingId);
  closeDeleteConfirm();
  renderAll();
  void deleteTrainingRecord(deletedId);
}

function renderPreview() {
  const fields = [
    ["owner", "商务负责人", "select"],
    ["teacherIds", "派遣讲师", "multiselect"],
    ["name", "培训班名称"],
    ["org", "机构名称"],
    ["province", "省"],
    ["city", "市"],
    ["district", "区县"],
    ["address", "培训详细地址"],
    ["people", "培训人数", "number"],
    ["devices", "设备需求数量", "number"],
    ["startDate", "培训开始日期", "date"],
    ["endDate", "培训结束日期", "date"],
    ["days", "培训使用天数", "number"],
    ["arriveDate", "设备到达日期", "date"],
    ["shipDate", "建议发货日期", "date"],
    ["mailAddress", "邮寄地址"],
    ["receiver", "收货人"],
    ["phone", "电话"],
  ];
  document.querySelector("#preview-form").innerHTML = fields.map(([key, label, type]) => {
    if (type === "select") {
      return `<label>${label}<select data-field="${key}"><option value="">请选择商务负责人</option>${businessPeople.map((p) => `<option value="${p}" ${previewData[key] === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>`;
    }
    if (type === "multiselect") {
      const selected = Array.isArray(previewData[key]) ? previewData[key] : [];
      return `<label>${label}<div class="teacher-picker"><input class="teacher-search-input" data-teacher-search="${key}" placeholder="搜索讲师姓名"><select data-field="${key}" multiple class="multi-select">${renderTeacherOptions(selected)}</select></div></label>`;
    }
    return `<label>${label}<input data-field="${key}" type="${type || "text"}" value="${previewData[key] || ""}"></label>`;
  }).join("");
  document.querySelectorAll("[data-field]").forEach((el) => {
    const updateField = () => {
      previewData[el.dataset.field] = el.multiple ? Array.from(el.selectedOptions).map((option) => option.value) : el.value;
      if (el.dataset.field === "devices") renderSources();
      renderRisk();
    };
    el.addEventListener("input", updateField);
    el.addEventListener("change", updateField);
  });
  document.querySelectorAll("[data-teacher-search]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.teacherSearch;
      const selected = Array.isArray(previewData[key]) ? previewData[key] : [];
      const select = input.parentElement.querySelector(`[data-field="${key}"]`);
      select.innerHTML = renderTeacherOptions(selected, input.value.trim());
    });
  });
  renderSources();
  renderRisk();
}

function renderTeacherOptions(selected = [], keyword = "") {
  return activeTeachers()
    .filter((teacher) => !keyword || teacher.name.includes(keyword) || teacher.city.includes(keyword) || selected.includes(teacher.id))
    .map((teacher) => `<option value="${teacher.id}" ${selected.includes(teacher.id) ? "selected" : ""}>${teacher.name}｜${teacher.city}</option>`)
    .join("");
}

const locationHints = [
  ["呼和浩特", "内蒙古", "呼和浩特"],
  ["包头", "内蒙古", "包头"],
  ["鄂尔多斯", "内蒙古", "鄂尔多斯"],
  ["赤峰", "内蒙古", "赤峰"],
  ["合肥", "安徽", "合肥"],
  ["芜湖", "安徽", "芜湖"],
  ["保定", "河北", "保定"],
  ["沧州", "河北", "沧州"],
  ["郑州", "河南", "郑州"],
  ["洛阳", "河南", "洛阳"],
  ["鹤壁", "河南", "鹤壁"],
  ["长沙", "湖南", "长沙"],
  ["岳阳", "湖南", "岳阳"],
  ["大庆", "黑龙江", "大庆"],
  ["鸡西", "黑龙江", "鸡西"],
  ["汉中", "陕西", "汉中"],
  ["榆林", "陕西", "榆林"],
  ["西安", "陕西", "西安"],
];

function inferLocation(destination, organization, trainingName) {
  const text = [destination, organization, trainingName].filter(Boolean).join(" ");
  const hinted = locationHints.find(([keyword]) => text.includes(keyword));
  let province = hinted?.[1] || "";
  let city = hinted?.[2] || "";
  const provinceMatch = text.match(/(内蒙古|广西|宁夏|新疆|西藏|[\u4e00-\u9fa5]{2,3})(省|自治区|市)/);

  if (provinceMatch) {
    province = provinceMatch[1];
    const afterProvince = text.slice(provinceMatch.index + provinceMatch[0].length);
    const cityMatch = afterProvince.match(/([\u4e00-\u9fa5]{2,7}?)(市|盟|地区)/);
    if (cityMatch) city = cityMatch[1];
  }
  if (!city && hinted) city = hinted[2];
  if (!province && hinted) province = hinted[1];
  return { province: province || "安徽", city: city || "合肥" };
}

function parseSmartText() {
  const text = document.querySelector("#smart-input").value;
  const pick = (label) => {
    const match = text.match(new RegExp(`${label}[:：]\\s*([^\\n]+)`));
    return match ? match[1].trim() : "";
  };
  const destination = pick("培训目的地") || pick("上课/住宿地点详细地址");
  const organization = pick("机构名称") || pick("客户名称");
  const trainingName = pick("培训班级名称") || pick("培训班名称");
  const dateText = pick("培训开始时间");
  const arriveText = pick("需到达时间");
  const startDate = normalizeDate(dateText);
  const arriveDate = normalizeDate(arriveText);
  const location = inferLocation(destination, organization, trainingName);
  previewData = {
    owner: "",
    teacherIds: [],
    name: trainingName,
    org: organization,
    province: location.province,
    city: location.city,
    district: destination.includes("繁昌") ? "繁昌区" : "",
    address: pick("上课/住宿地点详细地址") || destination,
    people: numberFrom(pick("培训人数")),
    devices: numberFrom(pick("需设备总数")),
    startDate,
    endDate: startDate,
    days: dateText.includes("各半天") ? 1 : 1,
    arriveDate,
    shipDate: suggestShipDate(arriveDate, destination),
    mailAddress: pick("设备邮寄地址"),
    receiver: pick("收货人"),
    phone: pick("电话"),
  };
  draftSources = [{ type: "北京仓", count: Number(previewData.devices) || 0 }];
  renderPreview();
}

function normalizeDate(text) {
  const match = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function suggestShipDate(arriveDate, address) {
  if (!arriveDate) return "";
  let days = 4;
  if (address.includes("河北")) days = 2;
  if (address.includes("河南")) days = 3;
  if (address.includes("黑龙江")) days = 5;
  if (address.includes("安徽")) days = 3;
  return formatFullDate(addDays(parseDate(arriveDate), -days));
}

function numberFrom(text) {
  const match = String(text).match(/\d+/);
  return match ? Number(match[0]) : "";
}

function renderSources() {
  const sourceTypes = ["北京仓", "上一培训地周转", "待调配", "河南郑州上一培训", "河南洛阳上一培训"];
  document.querySelector("#sources").innerHTML = draftSources.map((source, index) => `
    <div class="source-row">
      <select data-source-type="${index}">
        ${sourceTypes.map((type) => `<option ${source.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select>
      <input data-source-count="${index}" type="number" value="${source.count}" min="0">
      <button class="danger" data-remove-source="${index}">删除</button>
    </div>
  `).join("");
  document.querySelectorAll("[data-source-type]").forEach((el) => {
    el.addEventListener("change", () => {
      draftSources[Number(el.dataset.sourceType)].type = el.value;
      renderSources();
      renderRisk();
    });
  });
  document.querySelectorAll("[data-source-count]").forEach((el) => {
    el.addEventListener("input", () => {
      draftSources[Number(el.dataset.sourceCount)].count = Number(el.value);
      renderSources();
      renderRisk();
    });
  });
  document.querySelectorAll("[data-remove-source]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draftSources.splice(Number(btn.dataset.removeSource), 1);
      renderSources();
      renderRisk();
    });
  });
  const need = Number(previewData.devices) || 0;
  const sum = draftSources.reduce((acc, item) => acc + Number(item.count || 0), 0);
  document.querySelector("#source-total").innerHTML = `<span>来源合计：${sum}台</span><strong>${sum === need ? "数量匹配" : `与需求差 ${need - sum} 台`}</strong>`;
}

function renderRisk() {
  const need = Number(previewData.devices) || 0;
  const sourceSum = draftSources.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const hasPending = draftSources.some((item) => item.type.includes("待调配"));
  const hasOwner = Boolean(previewData.owner);
  const enough = sourceSum === need && !hasPending && hasOwner;
  const el = document.querySelector("#create-risk");
  el.className = `risk-card ${enough ? "" : "risk"}`;
  el.textContent = enough
    ? "设备可安排：来源数量匹配，暂无调配风险。"
    : `${hasOwner ? "" : "请选择商务负责人。"}设备检查：本场需要${need || 0}台，已确认来源${sourceSum}台，请补齐来源或保存为预排。`;
}

function createTraining(status = "已确认") {
  const fields = document.querySelectorAll("[data-field]");
  fields.forEach((el) => {
    previewData[el.dataset.field] = el.multiple ? Array.from(el.selectedOptions).map((option) => option.value) : el.value;
  });
  if (!previewData.owner) {
    alert("请先手动选择商务负责人。");
    return;
  }
  const id = editingTrainingId || `T${String(Date.now()).slice(-6)}`;
  const existingTraining = editingTrainingId ? trainings.find((item) => item.id === editingTrainingId) : null;
  const source = draftSources.map((item) => `${item.type}${item.count}台`).join(" + ");
  const endDate = resolveTrainingEndDate(previewData.startDate, previewData.endDate, previewData.days);
  const nextTraining = makeTraining(
    id,
    previewData.owner || "马帅",
    `${previewData.province || ""}${previewData.city || ""}`,
    previewData.name || "新建培训班",
    Number(previewData.devices) || 0,
    previewData.shipDate,
    previewData.arriveDate,
    previewData.startDate,
    endDate,
    source,
    status,
    {
      org: previewData.org,
      people: previewData.people,
      district: previewData.district,
      address: previewData.address,
      mailAddress: previewData.mailAddress,
      receiver: previewData.receiver,
      phone: previewData.phone,
      teacherIds: previewData.teacherIds || [],
      serial: existingTraining?.serial || nextTrainingSerial(),
    },
  );
  if (editingTrainingId) {
    trainings = trainings.map((item) => item.id === editingTrainingId ? nextTraining : item);
  } else {
    trainings.unshift(nextTraining);
  }
  renderAll();
  switchPage("training");
  closeCreatePanel();
  void saveTrainingRecord(nextTraining);
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.querySelector(`#${page}-page`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));
  const titles = { overview: "总览", training: "培训管理", teacher: "师资信息管理", dispatch: "讲师派遣管理", anomaly: "异常记录" };
  document.querySelector("#page-title").textContent = titles[page];
  document.querySelector("#quick-create").textContent = page === "teacher" ? "创建信息" : "创建培训";
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchPage(btn.dataset.page)));
  document.querySelector("#quick-create").addEventListener("click", () => {
    if (currentPage === "teacher") {
      openTeacherModal();
      return;
    }
    switchPage("training");
    prepareCreateForm();
    openCreatePanel();
  });
  document.querySelector("#total-devices").addEventListener("input", (e) => {
    totalDevices = Number(e.target.value) || 0;
    renderAll();
    void saveSettings();
  });
  document.querySelector("#biz-filter").addEventListener("change", renderGantt);
  document.querySelector("#reset-filter").addEventListener("click", () => {
    document.querySelector("#biz-filter").value = "";
    renderGantt();
  });
  document.querySelector("#export-gantt").addEventListener("click", exportGantt);
  ["#list-biz-filter", "#province-filter", "#status-filter", "#risk-filter"].forEach((id) => {
    document.querySelector(id).addEventListener("change", renderTrainingTable);
  });
  document.querySelector("#teacher-search").addEventListener("input", renderTeacherTable);
  document.querySelector("#parse-text").addEventListener("click", parseSmartText);
  document.querySelector("#toggle-create").addEventListener("click", toggleCreatePanel);
  document.querySelector("#create-backdrop").addEventListener("click", closeCreatePanel);
  document.querySelector("#add-source").addEventListener("click", () => {
    draftSources.push({ type: "待调配", count: 0 });
    renderSources();
    renderRisk();
  });
  document.querySelector("#create-training").addEventListener("click", () => createTraining("已确认"));
  document.querySelector("#save-draft").addEventListener("click", () => createTraining("待排期"));
  document.querySelector("#cancel-delete").addEventListener("click", closeDeleteConfirm);
  document.querySelector("#delete-backdrop").addEventListener("click", closeDeleteConfirm);
  document.querySelector("#confirm-delete").addEventListener("click", confirmDeleteTraining);
  document.querySelector("#teacher-backdrop").addEventListener("click", closeTeacherModal);
  document.querySelector("#cancel-teacher").addEventListener("click", closeTeacherModal);
  document.querySelector("#save-teacher").addEventListener("click", createTeacher);
  document.querySelector("#dispatch-backdrop").addEventListener("click", closeDispatchModal);
  document.querySelector("#cancel-dispatch").addEventListener("click", closeDispatchModal);
  document.querySelector("#save-dispatch").addEventListener("click", saveDispatchSettlement);
  document.querySelector("#dispatch-detail-backdrop").addEventListener("click", closeDispatchDetail);
  document.querySelector("#close-dispatch-detail").addEventListener("click", closeDispatchDetail);
  document.querySelector("#dispatch-month-filter").addEventListener("change", renderDispatchTable);
  document.querySelector("#dispatch-teacher-filter").addEventListener("change", renderDispatchTable);
  document.querySelector("#dispatch-settlement-filter").addEventListener("change", renderDispatchTable);
  document.querySelector("#dispatch-select-all").addEventListener("change", (event) => toggleSelectAllDispatch(event.target.checked));
  document.querySelector("#batch-update-settlement").addEventListener("click", batchUpdateSettlementStatus);
  document.querySelector("#amount-backdrop").addEventListener("click", closeAmountDetail);
  document.querySelector("#close-amount").addEventListener("click", closeAmountDetail);
  document.querySelector("#login-button").addEventListener("click", handleAuth);
  document.querySelector("#auth-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void handleAuth();
  });
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.querySelector("#backup-data").addEventListener("click", () => openBackupModal("export"));
  document.querySelector("#restore-data").addEventListener("click", () => document.querySelector("#restore-file").click());
  document.querySelector("#restore-file").addEventListener("change", handleRestoreFile);
  document.querySelector("#backup-backdrop").addEventListener("click", closeBackupModal);
  document.querySelector("#cancel-backup").addEventListener("click", closeBackupModal);
  document.querySelector("#confirm-backup").addEventListener("click", handleBackupAction);
}

function toggleCreatePanel() {
  const modal = document.querySelector("#create-modal");
  if (modal.classList.contains("collapsed")) {
    openCreatePanel();
  } else {
    closeCreatePanel();
  }
}

function openCreatePanel() {
  document.querySelector("#create-modal").classList.remove("collapsed");
}

function closeCreatePanel() {
  document.querySelector("#create-modal").classList.add("collapsed");
  editingTrainingId = null;
  document.querySelector("#create-training").textContent = "确认创建培训";
  document.querySelector("#save-draft").style.display = "";
  document.querySelector("#toggle-create").textContent = "收起";
  document.querySelector("#parse-text").style.display = "";
}

function renderAll() {
  renderFilters();
  renderMetrics();
  renderGantt();
  renderPreview();
  renderTrainingTable();
  renderTeacherRateSettings();
  renderTeacherTable();
  renderDispatchFilters();
  renderDispatchTable();
  renderAnomalyTable();
}

async function initApp() {
  document.querySelector("#smart-input").value = sampleText;
  parseSmartText();
  bindEvents();
  await initPersistence();
  renderAll();
}

void initApp();
