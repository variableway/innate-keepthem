# Transparent Cookie Encryption (简化版)

## 设计原则

> "用户不需要知道助记词，只要知道是安全的。丢了？重新登录就行。"

**核心：后台自动处理所有加密，用户完全无感知。**

---

## 简化架构

```
用户视角:
登录 YouTube → 正常使用 → 关闭App
     ↑                              ↓
   提示"保存登录"?              下次自动登录
     ↓                              ↑
后台自动加密Cookie ────────→ 后台自动解密使用
```

**用户完全不需要知道：**
- ❌ 助记词
- ❌ 密钥
- ❌ 加密过程
- ❌ 恢复流程

**用户只需要知道：**
- ✅ Cookie被安全加密存储
- ✅ 如果重装系统/换电脑，需要重新登录

---

## 技术实现

### 1. 自动密钥管理

```rust
use rand::RngCore;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use sha2::{Sha256, Digest};

pub struct CookieEncryption {
    key_file: PathBuf,
}

impl CookieEncryption {
    /// 获取或创建加密密钥（完全自动）
    fn get_or_create_key(&self) -> Result<aes_gcm::Key<Aes256Gcm>, Box<dyn Error>> {
        // 检查是否已有密钥
        if self.key_file.exists() {
            // 读取现有密钥
            let key_bytes = fs::read(&self.key_file)?;
            if key_bytes.len() == 32 {
                return Ok(*aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes));
            }
        }
        
        // 生成新密钥（256位随机数）
        let mut key_bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key_bytes);
        
        // 保存密钥（文件系统权限保护）
        fs::write(&self.key_file, &key_bytes)?;
        
        // 设置文件权限（仅当前用户可读写）
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.key_file)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&self.key_file, perms)?;
        }
        
        Ok(*aes_gcm::Key::<Aes256Gcm>::from_slice(&key_bytes))
    }
    
    /// 加密Cookie（自动调用）
    pub fn encrypt_cookie(&self, cookie_data: &str) -> Result<Vec<u8>, Box<dyn Error>> {
        let key = self.get_or_create_key()?;
        
        // 生成随机nonce
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // AES-256-GCM加密
        let cipher = Aes256Gcm::new(&key);
        let ciphertext = cipher
            .encrypt(nonce, cookie_data.as_bytes())
            .map_err(|e| format!("Encryption failed: {:?}", e))?;
        
        // 组合: nonce + ciphertext
        let mut result = Vec::new();
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// 解密Cookie（自动调用）
    pub fn decrypt_cookie(&self, encrypted_data: &[u8]) -> Result<String, Box<dyn Error>> {
        if encrypted_data.len() < 12 {
            return Err("Invalid encrypted data".into());
        }
        
        let key = self.get_or_create_key()?;
        
        // 分离nonce和ciphertext
        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        // 解密
        let cipher = Aes256Gcm::new(&key);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| {
                // 解密失败（密钥损坏或被篡改）
                // 返回特殊错误，提示重新登录
                CookieError::NeedReLogin
            })?;
        
        Ok(String::from_utf8(plaintext)?)
    }
    
    /// 删除密钥（重置所有登录）
    pub fn reset_encryption(&self) -> Result<(), Box<dyn Error>> {
        if self.key_file.exists() {
            fs::remove_file(&self.key_file)?;
        }
        // 同时删除所有加密的cookie文件
        let cookie_dir = self.key_file.parent().unwrap().join("encrypted_cookies");
        if cookie_dir.exists() {
            fs::remove_dir_all(&cookie_dir)?;
        }
        Ok(())
    }
}
```

### 2. 用户界面（极简）

```typescript
// 用户完全无感知的加密流程

// 捕获Cookie时（用户看到的）
export function CookieCaptureDialog({ platform }: { platform: string }) {
  const capture = async () => {
    // 打开浏览器让用户登录
    await openBrowserForLogin(platform);
    
    // 登录成功后，后台自动捕获和加密
    await invoke("capture_and_encrypt_cookies", { platform });
    
    // 简单提示
    toast.success(`${platform} 登录已安全保存`);
  };
  
  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>保存 {platform} 登录</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <p>我们将打开浏览器让你登录 {platform}。</p>
        <p className="text-sm text-muted-foreground">
          登录信息会被加密保存在本地，下次自动使用。
        </p>
      </DialogContent>
      <DialogFooter>
        <Button onClick={capture}>开始登录</Button>
      </DialogFooter>
    </Dialog>
  );
}

// 使用Cookie时（完全自动）
export async function syncWithEncryptedCookies(platform: string) {
  try {
    // 尝试使用加密的Cookie自动登录
    await invoke("sync_platform", { platform });
  } catch (error) {
    // 如果解密失败（密钥丢失或损坏）
    if (error.code === "NEED_RELOGIN") {
      // 简单提示重新登录
      const shouldRelogin = await confirm(
        `${platform} 的登录信息需要更新`,
        `请重新登录 ${platform} 以继续同步。`
      );
      
      if (shouldRelogin) {
        // 打开登录对话框
        openCookieCaptureDialog(platform);
      }
    }
  }
}

// 设置页面（可选的高级功能）
export function PrivacySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>隐私与安全</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">本地数据加密</p>
            <p className="text-sm text-muted-foreground">
              所有登录信息使用 AES-256 加密存储
            </p>
          </div>
          <Badge variant="secondary">已启用</Badge>
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">清除所有登录信息</p>
            <p className="text-sm text-muted-foreground">
              删除所有保存的Cookie和密钥
            </p>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => {
              confirm("确定要清除所有登录信息吗？", 
                "你需要重新登录所有平台。");
              invoke("reset_encryption");
            }}
          >
            清除
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3. 存储结构

```
~/Library/Application Support/vYtDL/  (macOS)
%APPDATA%/vYtDL/                      (Windows)
~/.local/share/vYtDL/                 (Linux)
    │
    ├── encryption.key                 # 自动生成的密钥 (权限 600)
    │
    └── encrypted_cookies/
        ├── youtube.enc               # YouTube 加密Cookie
        ├── bilibili.enc              # Bilibili 加密Cookie
        └── alipay.enc                # 支付宝 加密Cookie
```

### 4. 错误处理

```rust
#[derive(Debug)]
pub enum CookieError {
    NeedReLogin,           // 密钥丢失或损坏，需要重新登录
    InvalidCookieData,     // Cookie数据格式错误
    PlatformNotSupported,  // 不支持的平台
}

impl fmt::Display for CookieError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CookieError::NeedReLogin => {
                write!(f, "登录信息已过期，请重新登录")
            }
            CookieError::InvalidCookieData => {
                write!(f, "Cookie数据无效")
            }
            CookieError::PlatformNotSupported => {
                write!(f, "不支持该平台")
            }
        }
    }
}
```

---

## 用户流程

### 第一次使用

```
1. 用户点击"同步YouTube"
2. 打开浏览器，用户正常登录
3. 登录成功后，后台自动：
   - 捕获Cookie
   - 生成密钥（如果不存在）
   - 加密Cookie
   - 保存到本地
4. 提示"已保存"，用户无感知加密过程
```

### 日常使用

```
1. 用户点击"同步YouTube"
2. 后台自动：
   - 读取密钥
   - 解密Cookie
   - 注入浏览器
   - 用户已登录状态
3. 正常同步，用户无感知
```

### 密钥丢失场景

```
1. 用户重装系统/换电脑
2. 点击"同步YouTube"
3. 后台解密失败（密钥不存在）
4. 提示："请重新登录YouTube"
5. 用户重新登录
6. 生成新密钥，保存新Cookie
7. 正常使用
```

---

## 安全特性

| 特性 | 实现 |
|------|------|
| **自动加密** | AES-256-GCM，后台自动处理 |
| **随机密钥** | 256位随机数，每次安装生成 |
| **文件权限** | Unix: 600 (仅用户可读) |
| **数据分离** | 密钥和加密数据分开存储 |
| **防篡改** | GCM认证，篡改即解密失败 |

---

## 对比复杂方案

| 特性 | 助记词方案 | 简化方案（推荐） |
|------|-----------|----------------|
| 用户学习成本 | 高（需理解助记词） | 零（完全无感知） |
| 备份复杂度 | 高（需抄写保存） | 零（自动处理） |
| 恢复流程 | 复杂（输入助记词） | 简单（重新登录） |
| 安全性 | 极高 | 高（足够安全） |
| 适用场景 | 高价值资产保护 | 日常Cookie保护 |

**结论：对于Cookie保护，简化方案更优！**

---

## 代码示例

```rust
// 使用示例
let encryption = CookieEncryption::new(
    dirs::data_dir().unwrap().join("vYtDL").join("encryption.key")
);

// 保存Cookie（自动加密）
let cookie_json = r#"[{ "name": "session", "value": "abc123" }]"#;
let encrypted = encryption.encrypt_cookie(cookie_json)?;
fs::write("youtube.enc", encrypted)?;

// 读取Cookie（自动解密）
let encrypted = fs::read("youtube.enc")?;
let cookie_json = encryption.decrypt_cookie(&encrypted)?;
```

---

## 总结

**设计原则：**
> "最好的安全是用户感受不到的安全"

**优势：**
- ✅ 用户零学习成本
- ✅ 完全自动处理
- ✅ 丢失后简单重新登录
- ✅ 足够高的安全性
- ✅ 维护简单

**文档：** `tasks/security/transparent-cookie-encryption.md`
