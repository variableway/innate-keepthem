# Password-Derived Cookie Encryption

## 改进设计

> "密钥用用户密码加密存储，安全又方便"

```
用户密码 ──→ PBKDF2 ──→ 派生密钥 ──→ 解密 ──→ 实际加密密钥 ──→ 解密Cookie
   ↑                                                              ↓
   └──────────────── 内存中短暂存在 ──────────────────────────────┘
```

---

## 核心优势

| 场景 | 无密码加密 | 密码派生加密（推荐） |
|-----|-----------|-------------------|
| 电脑被盗 | 文件可被读取解密 | ❌ 需要密码才能解密 |
| 文件被复制 | 在其他机器可用 | ❌ 需要原密码 |
| 云同步风险 | 密钥暴露 | ❌ 密码不存储，安全 |
| 用户体验 | 完全无感 | 启动时输入一次密码 |

---

## 技术实现

### 1. 密钥派生 + 双层加密

```rust
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use pbkdf2::pbkdf2_hmac;
use sha2::{Sha256, Digest};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use rand::RngCore;

/// 存储结构
#[derive(Serialize, Deserialize)]
struct EncryptedKeyFile {
    /// Argon2id 参数（防暴力破解）
    salt: String,           // Base64编码的盐
    iterations: u32,        // Argon2内存参数
    memory: u32,
    /// 被密码加密的实际密钥
    encrypted_master_key: Vec<u8>,  // 用派生密钥加密的实际密钥
    /// 验证标签（确保密码正确）
    verification_tag: Vec<u8>,      // HMAC验证
}

pub struct SecureCookieEncryption {
    key_file: PathBuf,
    // 内存中缓存的解密后密钥（可选，有超时）
    cached_key: Option<(Vec<u8>, Instant)>,
}

impl SecureCookieEncryption {
    const KEY_TIMEOUT: Duration = Duration::from_secs(300); // 5分钟超时
    
    /// 首次设置密码
    pub fn setup_password(&self, password: &str) -> Result<(), Box<dyn Error>> {
        // 生成随机主密钥（真正加密Cookie用的）
        let mut master_key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut master_key);
        
        // 生成随机盐
        let salt = SaltString::generate(&mut rand::thread_rng());
        
        // Argon2id 派生密钥（抗GPU/ASIC破解）
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("Password hashing failed: {}", e))?;
        
        // 从hash提取派生密钥
        let derived_key = Self::extract_key_from_hash(&password_hash)?;
        
        // 用派生密钥加密主密钥
        let encrypted_master = Self::encrypt_with_key(&master_key, &derived_key)?;
        
        // 生成验证标签（用于快速检查密码正确性）
        let verification_tag = Self::create_verification_tag(&derived_key);
        
        // 保存到文件
        let key_file = EncryptedKeyFile {
            salt: salt.to_string(),
            iterations: 3,      // Argon2默认参数
            memory: 65536,      // 64MB内存
            encrypted_master_key: encrypted_master,
            verification_tag,
        };
        
        let json = serde_json::to_string_pretty(&key_file)?;
        fs::write(&self.key_file, json)?;
        
        // 设置文件权限
        #[cfg(unix)]
        Self::set_restricted_permissions(&self.key_file)?;
        
        Ok(())
    }
    
    /// 验证密码并获取主密钥
    pub fn unlock_with_password(&mut self, password: &str) -> Result<(), Box<dyn Error>> {
        // 读取加密文件
        let json = fs::read_to_string(&self.key_file)?;
        let key_file: EncryptedKeyFile = serde_json::from_str(&json)?;
        
        // 重新派生密钥
        let derived_key = Self::derive_key_with_argon2(
            password,
            &key_file.salt,
            key_file.iterations,
            key_file.memory
        )?;
        
        // 验证密码正确性（快速失败）
        let expected_tag = Self::create_verification_tag(&derived_key);
        if !constant_time_eq(&expected_tag, &key_file.verification_tag) {
            return Err("密码错误".into());
        }
        
        // 解密主密钥
        let master_key = Self::decrypt_with_key(
            &key_file.encrypted_master_key,
            &derived_key
        )?;
        
        // 缓存到内存（带超时）
        self.cached_key = Some((master_key, Instant::now()));
        
        Ok(())
    }
    
    /// 加密Cookie（需要已解锁）
    pub fn encrypt_cookie(&self, cookie_data: &str) -> Result<Vec<u8>, Box<dyn Error>> {
        let master_key = self.get_cached_key()?;
        
        // 使用主密钥AES-256-GCM加密
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        
        let cipher = Aes256Gcm::new(aes_gcm::Key::from_slice(&master_key));
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), cookie_data.as_bytes())
            .map_err(|e| format!("Encryption failed: {:?}", e))?;
        
        let mut result = Vec::new();
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// 解密Cookie（需要已解锁）
    pub fn decrypt_cookie(&self, encrypted_data: &[u8]) -> Result<String, Box<dyn Error>> {
        let master_key = self.get_cached_key()?;
        
        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        
        let cipher = Aes256Gcm::new(aes_gcm::Key::from_slice(&master_key));
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|_| CookieError::CorruptedData)?;
        
        Ok(String::from_utf8(plaintext)?)
    }
    
    /// 获取缓存的密钥（检查超时）
    fn get_cached_key(&self) -> Result<&[u8], Box<dyn Error>> {
        match &self.cached_key {
            Some((key, timestamp)) => {
                if timestamp.elapsed() > Self::KEY_TIMEOUT {
                    return Err("密钥已过期，请重新输入密码".into());
                }
                Ok(key.as_slice())
            }
            None => Err("请先输入密码解锁".into()),
        }
    }
    
    /// 锁屏/清除内存密钥
    pub fn lock(&mut self) {
        // 安全擦除内存
        if let Some((mut key, _)) = self.cached_key.take() {
            key.zeroize();
        }
    }
    
    /// 修改密码
    pub fn change_password(&self, old_password: &str, new_password: &str) -> Result<(), Box<dyn Error>> {
        // 先用旧密码解锁
        self.unlock_with_password(old_password)?;
        let master_key = self.get_cached_key()?.to_vec();
        
        // 用新密码重新加密
        self.setup_password_with_key(new_password, &master_key)
    }
}
```

### 2. 用户界面

```typescript
// App启动时检查
export function AppLockScreen() {
  const [isLocked, setIsLocked] = useState(true);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  
  useEffect(() => {
    checkKeyFile().then(exists => {
      setIsFirstSetup(!exists);
    });
  }, []);
  
  if (isFirstSetup) {
    return <FirstTimeSetup onComplete={() => setIsLocked(false)} />;
  }
  
  if (isLocked) {
    return <UnlockDialog onUnlock={() => setIsLocked(false)} />;
  }
  
  return <MainApp />;
}

// 首次设置
function FirstTimeSetup({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const setup = async () => {
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    
    if (password.length < 6) {
      toast.error("密码至少6位");
      return;
    }
    
    await invoke("setup_encryption_password", { password });
    toast.success("密码设置成功");
    onComplete();
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            设置安全密码
          </CardTitle>
          <CardDescription>
            用于保护你的登录信息安全
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 p-3 rounded text-sm text-amber-800">
            <p className="font-medium">⚠️ 重要提示</p>
            <p>此密码用于加密保存的登录信息。</p>
            <p>忘记密码需要重新登录所有平台。</p>
          </div>
          
          <div className="space-y-2">
            <Label>设置密码</Label>
            <Input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少6位"
            />
          </div>
          
          <div className="space-y-2">
            <Label>确认密码</Label>
            <Input 
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次输入"
            />
          </div>
          
          <Button onClick={setup} className="w-full">
            确认设置
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// 日常解锁
function UnlockDialog({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const unlock = async () => {
    try {
      await invoke("unlock_with_password", { password });
      onUnlock();
    } catch (e) {
      setError("密码错误");
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-[360px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            输入密码
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input 
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="请输入密码"
            onKeyDown={e => e.key === "Enter" && unlock()}
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={unlock} className="w-full">解锁</Button>
          
          <p className="text-xs text-muted-foreground text-center">
            忘记密码？
            <button 
              className="text-blue-600 hover:underline"
              onClick={() => confirmReset()}
            >
              重置所有数据
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// 自动锁屏检测
export function useAutoLock() {
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;
    
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        // 5分钟无操作自动锁定
        invoke("lock_encryption");
        window.location.reload(); // 返回锁屏
      }, 5 * 60 * 1000);
    };
    
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    resetTimer();
    
    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, []);
}
```

### 3. 存储文件结构

```json
{
  "version": 2,
  "key_derivation": {
    "algorithm": "argon2id",
    "salt": "c2FsdHN0cmluZ2hlcmU=",
    "iterations": 3,
    "memory": 65536,
    "parallelism": 1
  },
  "encrypted_master_key": "base64_encoded_encrypted_key",
  "verification_tag": "base64_hmac_tag",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## 安全特性

| 攻击场景 | 防护机制 |
|---------|---------|
| **暴力破解密码** | Argon2id + 64MB内存，抗GPU/ASIC |
| **密钥文件被盗** | 需要密码才能解密 |
| **内存Dump** | 5分钟超时自动清除 |
| **文件篡改** | HMAC验证，篡改即失败 |
| **彩虹表攻击** | 每个用户独立随机盐 |

---

## 用户体验

```
首次启动
  ↓
设置密码（6位以上）
  ↓
正常使用（Cookie自动加解密）
  ↓
5分钟无操作 → 自动锁定
  ↓
重新输入密码解锁
  ↓
忘记密码 → 重置所有登录数据
```

---

## 三种方案对比

| 方案 | 安全性 | 便利性 | 适用场景 |
|-----|-------|-------|---------|
| **明文密钥** | ⭐⭐ | ⭐⭐⭐⭐⭐ | 单机个人使用 |
| **透明加密** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 同上 |
| **密码派生** ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **推荐！** |

---

## 结论

**密码派生加密是最佳方案：**

✅ 安全：Argon2id + AES-256-GCM  
✅ 方便：只需记住一个密码  
✅ 可控：5分钟自动锁定  
✅ 恢复：忘记密码重新登录即可  

**文档：** `tasks/security/password-derived-encryption.md`
